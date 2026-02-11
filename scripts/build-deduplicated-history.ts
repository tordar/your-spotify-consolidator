/**
 * Builds a single JSON file with deduplicated metadata (Option A):
 * - songs[] with albumId/artistId references
 * - albums: { [albumId]: { id, name, images, ... } }
 * - artists: { [artistId]: { id, name, genres, images, ... } }
 *
 * Uses data/spotify-history/ for initial build, then supports appending new events.
 * Reuses consolidation (scripts/cleaner/utils/consolidation.ts) and optional
 * Spotify enrichment (same client as generate-cleaned-files-from-history).
 *
 * Usage (pass flags after -- so npm doesn't consume them):
 *   npm run build-deduplicated-history              # Build from data/spotify-history/
 *   npm run build-deduplicated-history -- --enrich  # Enrich via Spotify API (or use: npm run build-deduplicated-history:enrich)
 *   npm run build-deduplicated-history -- --append  # Append temp recent plays to latest file
 *   npm run build-deduplicated-history -- --from-merged  # Convert latest merged-streaming-history to deduplicated format
 *
 * Enrich behavior: If a deduplicated file already exists, --enrich loads it and only enriches albums/artists still missing id or images (incremental). Otherwise builds from spotify-history then enriches. Default 500 songs per run (ENRICH_BATCH_LIMIT); set ENRICH_BATCH_LIMIT=0 to enrich all in one run.
 *
 * Convenience scripts: build-deduplicated-history:enrich, build-deduplicated-history:append, build-deduplicated-history:from-merged
 */

import * as fs from 'fs';
import * as path from 'path';
import { ConsolidationRulesManager, Consolidator } from './cleaner/utils/consolidation';
import { buildMasterAlbumList } from './cleaner/utils/build-master-album-list';
import { SpotifyTokenManager } from './spotify-token-manager';
import { SpotifyApiClient } from './cleaner/utils/spotify-api-client';

// ----- Input: same as merge-streaming-history -----
interface StreamingHistoryEntry {
  ts: string;
  platform: string;
  ms_played: number;
  conn_country: string;
  master_metadata_track_name: string;
  master_metadata_album_artist_name: string;
  master_metadata_album_album_name: string;
  spotify_track_uri: string;
}

// ----- Deduplicated output format -----
// Albums/artists are keyed by explicit "albumName|artistName" / "artistName" (no lowercasing).
// albumName and artistName are stored with original casing (first occurrence or Spotify).
interface AlbumRecord {
  id: string;
  name: string;
  albumName: string;
  artistName: string;
  images: Array<{ height: number; url: string; width: number }>;
  release_date?: string;
  release_date_precision?: string;
}

interface ArtistRecord {
  id: string;
  name: string;
  genres: string[];
  images?: Array<{ height: number; url: string; width: number }>;
}

interface ListeningEvent {
  playedAt: string;
  msPlayed: number;
  conn_country?: string;
}

interface SongRecord {
  songId: string;
  name: string;
  albumId: string;
  artistId: string;
  duration_ms: number;
  playCount: number;
  totalListeningTime: number;
  listeningEvents: ListeningEvent[];
  external_urls: { spotify: string };
  preview_url: string | null;
}

interface DeduplicatedHistory {
  metadata: {
    totalSongs: number;
    totalListeningEvents: number;
    totalListeningTime: number;
    dateRange: { earliest: string; latest: string };
    filesProcessed?: string[];
    timestamp: string;
    source: string;
  };
  albums: Record<string, AlbumRecord>;
  artists: Record<string, ArtistRecord>;
  songs: SongRecord[];
}

// ----- Recent play (for append mode) -----
interface RecentPlayData {
  id: string;
  name: string;
  artists: string[];
  album: {
    id: string;
    name: string;
    images: Array<{ height: number; url: string; width: number }>;
  };
  duration_ms: number;
  played_at: string;
  external_urls: { spotify: string };
  preview_url: string | null;
}

const HISTORY_DIR = './data/spotify-history';
const OUTPUT_DIR = './data/merged-streaming-history';
const DEDUP_FILENAME_PREFIX = 'deduplicated-streaming-history';
const TEMP_DIR = 'temp';

function extractTrackId(uri: string): string {
  return uri.replace('spotify:track:', '');
}

/**
 * Normalized artist key for internal dedup only (so "The Airfields" and "the airfields" merge).
 * Output keys use explicit record.name (no lowercasing).
 */
function normalizedArtistKeyForDedup(name: string): string {
  return name.toLowerCase().trim() || 'unknown';
}

class DeduplicatedHistoryBuilder {
  private consolidator: Consolidator;
  private historyDir: string;
  private outputDir: string;

  constructor() {
    this.consolidator = new Consolidator(new ConsolidationRulesManager());
    this.historyDir = HISTORY_DIR;
    this.outputDir = OUTPUT_DIR;
  }

  /**
   * Normalized album key for internal dedup only (same album/artist merge).
   * Output keys use explicit albumName|artistName (no lowercasing).
   */
  private normalizedAlbumKey(albumName: string, artistName: string): string {
    const normalized = this.consolidator.normalizeAlbumNameForGrouping(albumName, artistName);
    const a = normalizedArtistKeyForDedup(artistName);
    return `${normalized}|${a}`;
  }

  /**
   * Explicit storage key for an album (no lowercasing): "albumName|artistName".
   */
  private explicitAlbumKey(albumName: string, artistName: string): string {
    return `${albumName.trim() || 'Unknown Album'}|${artistName.trim() || 'Unknown Artist'}`;
  }

  /**
   * Get base album name for display (from consolidation rules when available).
   */
  private baseAlbumName(albumName: string, artistName: string): string {
    const base = this.consolidator.getBaseAlbumNameForGrouping(albumName, artistName);
    if (base) return base;
    return this.consolidator.normalizeAlbumNameForGrouping(albumName, artistName);
  }

  // ----- Read from spotify-history (same logic as merge-streaming-history) -----
  private getStreamingHistoryFiles(): string[] {
    if (!fs.existsSync(this.historyDir)) {
      throw new Error(`Directory ${this.historyDir} does not exist. Add Spotify export files there.`);
    }
    const files = fs.readdirSync(this.historyDir)
      .filter(f => f.startsWith('Streaming_History_Audio_') && f.endsWith('.json'))
      .map(f => path.join(this.historyDir, f));
    if (files.length === 0) {
      throw new Error(`No Streaming_History_Audio_*.json files found in ${this.historyDir}`);
    }
    return files;
  }

  private readStreamingHistoryFile(filePath: string): StreamingHistoryEntry[] {
    const data = fs.readFileSync(filePath, 'utf8');
    const rawEntries = JSON.parse(data);
    if (!Array.isArray(rawEntries)) {
      throw new Error(`Invalid format: expected array in ${filePath}`);
    }
    const entries: StreamingHistoryEntry[] = rawEntries
      .filter((raw: Record<string, unknown>) =>
        raw.spotify_track_uri &&
        String(raw.spotify_track_uri).startsWith('spotify:track:') &&
        Number(raw.ms_played) > 10000 &&
        !raw.episode_name &&
        !raw.episode_show_name &&
        !raw.spotify_episode_uri
      )
      .map((raw: Record<string, unknown>) => ({
        ts: String(raw.ts),
        platform: String(raw.platform ?? ''),
        ms_played: Number(raw.ms_played),
        conn_country: String(raw.conn_country ?? ''),
        master_metadata_track_name: String(raw.master_metadata_track_name ?? ''),
        master_metadata_album_artist_name: String(raw.master_metadata_album_artist_name ?? ''),
        master_metadata_album_album_name: String(raw.master_metadata_album_album_name ?? ''),
        spotify_track_uri: String(raw.spotify_track_uri)
      }));
    return entries;
  }

  /**
   * Consolidate raw entries by song (same as merge-streaming-history).
   */
  private consolidateBySong(entries: StreamingHistoryEntry[]): Array<{
      songId: string;
      name: string;
      duration_ms: number;
      artists: string[];
      album: { id: string; name: string; images: Array<{ height: number; url: string; width: number }> };
      artist: { name: string; genres: string[] };
      external_urls: { spotify: string };
      preview_url: string | null;
      playCount: number;
      totalListeningTime: number;
      listeningEvents: ListeningEvent[];
    }> {
    const songMap = new Map<string, {
      songId: string;
      name: string;
      duration_ms: number;
      artists: string[];
      album: { id: string; name: string; images: Array<{ height: number; url: string; width: number }> };
      artist: { name: string; genres: string[] };
      external_urls: { spotify: string };
      preview_url: string | null;
      playCount: number;
      totalListeningTime: number;
      listeningEvents: ListeningEvent[];
    }>();

    entries.forEach(entry => {
      const songId = extractTrackId(entry.spotify_track_uri);
      const artistName = entry.master_metadata_album_artist_name || 'Unknown Artist';
      const albumName = entry.master_metadata_album_album_name || 'Unknown Album';

      if (songMap.has(songId)) {
        const existing = songMap.get(songId)!;
        existing.playCount += 1;
        existing.totalListeningTime += entry.ms_played;
        existing.listeningEvents.push({
          playedAt: entry.ts,
          msPlayed: entry.ms_played,
          conn_country: entry.conn_country
        });
      } else {
        songMap.set(songId, {
          songId,
          name: entry.master_metadata_track_name,
          duration_ms: 0,
          artists: [artistName],
          album: { id: '', name: albumName, images: [] },
          artist: { name: artistName, genres: [] },
          external_urls: { spotify: entry.spotify_track_uri },
          preview_url: null,
          playCount: 1,
          totalListeningTime: entry.ms_played,
          listeningEvents: [{
            playedAt: entry.ts,
            msPlayed: entry.ms_played,
            conn_country: entry.conn_country
          }]
        });
      }
    });

    songMap.forEach(song => {
      song.listeningEvents.sort((a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime());
    });

    return Array.from(songMap.values()) as Array<{
      songId: string;
      name: string;
      duration_ms: number;
      artists: string[];
      album: { id: string; name: string; images: Array<{ height: number; url: string; width: number }> };
      artist: { name: string; genres: string[] };
      external_urls: { spotify: string };
      preview_url: string | null;
      playCount: number;
      totalListeningTime: number;
      listeningEvents: ListeningEvent[];
    }>;
  }

  /**
   * Dedupe listening events by playedAt (keep one per timestamp).
   */
  private dedupeEvents(events: ListeningEvent[]): ListeningEvent[] {
    const seen = new Set<string>();
    return events.filter(e => {
      if (seen.has(e.playedAt)) return false;
      seen.add(e.playedAt);
      return true;
    });
  }

  /**
   * Build albums and artists maps from a list of "complete" songs (with inline album/artist),
   * and convert songs to SongRecord with albumId/artistId refs. Uses consolidation for album keys.
   */
  private buildDeduplicatedStructure(
    completeSongs: Array<{
      songId: string;
      name: string;
      duration_ms: number;
      artists: string[];
      album: { id: string; name: string; images: Array<{ height: number; url: string; width: number }> };
      artist: { name: string; genres: string[] };
      external_urls: { spotify: string };
      preview_url: string | null;
      playCount: number;
      totalListeningTime: number;
      listeningEvents: ListeningEvent[];
    }>
  ): { albums: Record<string, AlbumRecord>; artists: Record<string, ArtistRecord>; songs: SongRecord[] } {
    const albums: Record<string, AlbumRecord> = {};
    const artists: Record<string, ArtistRecord> = {};
    const songs: SongRecord[] = [];

    completeSongs.forEach(song => {
      const artistName = song.artist.name || song.artists[0] || 'Unknown Artist';
      const albumName = song.album.name || 'Unknown Album';
      const aKeyNorm = normalizedArtistKeyForDedup(artistName);
      const albKeyNorm = this.normalizedAlbumKey(albumName, artistName);
      const displayAlbumName = this.baseAlbumName(albumName, artistName);

      if (!artists[aKeyNorm]) {
        artists[aKeyNorm] = {
          id: '',
          name: artistName,
          genres: song.artist.genres?.length ? [...song.artist.genres] : []
        };
      }
      if (!albums[albKeyNorm]) {
        albums[albKeyNorm] = {
          id: song.album.id || '',
          name: displayAlbumName,
          albumName,
          artistName,
          images: song.album.images?.length ? [...song.album.images] : []
        };
      } else {
        if (song.album.id && !albums[albKeyNorm].id) albums[albKeyNorm].id = song.album.id;
        if (song.album.images?.length && albums[albKeyNorm].images.length === 0) {
          albums[albKeyNorm].images = [...song.album.images];
        }
      }

      const events = this.dedupeEvents(song.listeningEvents);
      const totalMs = events.reduce((sum, e) => sum + e.msPlayed, 0);

      songs.push({
        songId: song.songId,
        name: song.name,
        albumId: albKeyNorm,
        artistId: aKeyNorm,
        duration_ms: song.duration_ms,
        playCount: events.length,
        totalListeningTime: totalMs,
        listeningEvents: events,
        external_urls: song.external_urls,
        preview_url: song.preview_url
      });
    });

    return { albums, artists, songs };
  }

  /**
   * Build from data/spotify-history/ and write deduplicated file.
   */
  buildFromSpotifyHistory(): DeduplicatedHistory {
    console.log('🎵 Building deduplicated history from data/spotify-history/...');
    const files = this.getStreamingHistoryFiles();
    const allEntries: StreamingHistoryEntry[] = [];
    const processedFiles: string[] = [];

    for (const file of files) {
      const entries = this.readStreamingHistoryFile(file);
      allEntries.push(...entries);
      processedFiles.push(path.basename(file));
    }

    allEntries.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    const earliest = allEntries[0]?.ts ?? '';
    const latest = allEntries[allEntries.length - 1]?.ts ?? '';

    const completeSongs = this.consolidateBySong(allEntries);
    const { albums, artists, songs } = this.buildDeduplicatedStructure(completeSongs);

    const totalListeningTime = songs.reduce((sum, s) => sum + s.totalListeningTime, 0);
    const totalEvents = songs.reduce((sum, s) => sum + s.listeningEvents.length, 0);

    const result: DeduplicatedHistory = {
      metadata: {
        totalSongs: songs.length,
        totalListeningEvents: totalEvents,
        totalListeningTime,
        dateRange: { earliest, latest },
        filesProcessed: processedFiles,
        timestamp: new Date().toISOString(),
        source: 'Spotify Extended Streaming History (deduplicated)'
      },
      albums,
      artists,
      songs
    };

    console.log(`✅ Built ${songs.length} songs, ${Object.keys(albums).length} unique albums, ${Object.keys(artists).length} unique artists`);
    return result;
  }

  /**
   * Load existing deduplicated file (or legacy merged file and convert to deduplicated format).
   */
  loadExistingDeduplicated(filePath: string): DeduplicatedHistory {
    const data = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(data);
    if (parsed.albums && parsed.artists && parsed.songs && Array.isArray(parsed.songs)) {
      return parsed as DeduplicatedHistory;
    }
    if (parsed.songs && Array.isArray(parsed.songs) && !parsed.albums) {
      return this.convertLegacyMergedToDeduplicated(parsed);
    }
    throw new Error('Invalid format: expected deduplicated or legacy merged history');
  }

  /**
   * Convert legacy merged-streaming-history (songs with inline album/artist) to deduplicated format.
   */
  private convertLegacyMergedToDeduplicated(legacy: {
    songs: Array<{
      songId: string;
      name: string;
      duration_ms?: number;
      artists?: string[];
      album: { id?: string; name: string; images?: Array<{ height: number; url: string; width: number }> };
      artist: { name: string; genres?: string[] };
      external_urls?: { spotify: string };
      preview_url?: string | null;
      playCount?: number;
      totalListeningTime?: number;
      listeningEvents: ListeningEvent[];
    }>;
    metadata?: { dateRange?: { earliest?: string; latest?: string }; totalSongs?: number };
  }): DeduplicatedHistory {
    const completeSongs = legacy.songs.map(s => ({
      songId: s.songId,
      name: s.name,
      duration_ms: s.duration_ms ?? 0,
      artists: s.artists ?? [s.artist.name],
      album: {
        id: s.album.id ?? '',
        name: s.album.name ?? 'Unknown Album',
        images: s.album.images ?? []
      },
      artist: { name: s.artist.name, genres: s.artist.genres ?? [] },
      external_urls: s.external_urls ?? { spotify: `spotify:track:${s.songId}` },
      preview_url: s.preview_url ?? null,
      playCount: s.playCount ?? s.listeningEvents.length,
      totalListeningTime: s.totalListeningTime ?? s.listeningEvents.reduce((sum, e) => sum + e.msPlayed, 0),
      listeningEvents: s.listeningEvents
    }));
    const { albums, artists, songs } = this.buildDeduplicatedStructure(completeSongs);
    const totalListeningTime = songs.reduce((sum, s) => sum + s.totalListeningTime, 0);
    const totalEvents = songs.reduce((sum, s) => sum + s.listeningEvents.length, 0);
    const dateRange = legacy.metadata?.dateRange ?? { earliest: '', latest: '' };
    return {
      metadata: {
        totalSongs: songs.length,
        totalListeningEvents: totalEvents,
        totalListeningTime,
        dateRange: { earliest: dateRange.earliest ?? '', latest: dateRange.latest ?? '' },
        timestamp: new Date().toISOString(),
        source: 'Merged Streaming History (converted to deduplicated)'
      },
      albums,
      artists,
      songs
    };
  }

  /**
   * Build maps from normalized keys to explicit keys for existing albums/artists (for append).
   */
  private buildNormToExplicitMaps(albums: Record<string, AlbumRecord>, artists: Record<string, ArtistRecord>): {
    album: Record<string, string>;
    artist: Record<string, string>;
  } {
    const normToExplicitAlbum: Record<string, string> = {};
    const normToExplicitArtist: Record<string, string> = {};
    for (const [key, rec] of Object.entries(albums)) {
      const albumName = rec.albumName ?? (key.includes('|') ? key.slice(0, key.lastIndexOf('|')).trim() : rec.name);
      const artistName = rec.artistName ?? (key.includes('|') ? key.slice(key.lastIndexOf('|') + 1).trim() : 'Unknown Artist');
      normToExplicitAlbum[this.normalizedAlbumKey(albumName, artistName)] = key;
    }
    for (const [key, rec] of Object.entries(artists)) {
      const name = rec.name ?? key;
      normToExplicitArtist[normalizedArtistKeyForDedup(name)] = key;
    }
    return { album: normToExplicitAlbum, artist: normToExplicitArtist };
  }

  /**
   * Append recent plays to an existing deduplicated history.
   */
  appendRecentPlays(existing: DeduplicatedHistory, recentPlays: RecentPlayData[]): DeduplicatedHistory {
    const albums = { ...existing.albums };
    const artists = { ...existing.artists };
    const songMap = new Map<string, SongRecord>();
    existing.songs.forEach(s => songMap.set(s.songId, { ...s, listeningEvents: [...s.listeningEvents] }));

    const { album: normToExplicitAlbum, artist: normToExplicitArtist } = this.buildNormToExplicitMaps(albums, artists);

    let duplicatesSkipped = 0;
    let updated = 0;
    let added = 0;

    recentPlays.forEach(play => {
      const artistName = play.artists[0] || 'Unknown Artist';
      const albumName = play.album?.name || 'Unknown Album';
      const albKeyNorm = this.normalizedAlbumKey(albumName, artistName);
      const aKeyNorm = normalizedArtistKeyForDedup(artistName);
      const albKey = normToExplicitAlbum[albKeyNorm] ?? this.explicitAlbumKey(albumName, artistName);
      const aKey = normToExplicitArtist[aKeyNorm] ?? (artistName.trim() || 'Unknown Artist');
      const displayAlbumName = this.baseAlbumName(albumName, artistName);

      if (!artists[aKey]) {
        artists[aKey] = { id: '', name: artistName, genres: [] };
      }
      if (!albums[albKey]) {
        albums[albKey] = {
          id: play.album?.id ?? '',
          name: displayAlbumName,
          albumName,
          artistName,
          images: play.album?.images ?? []
        };
        normToExplicitAlbum[albKeyNorm] = albKey;
      } else {
        if (play.album?.id && !albums[albKey].id) albums[albKey].id = play.album.id;
        if (play.album?.images?.length && albums[albKey].images.length === 0) {
          albums[albKey].images = [...play.album.images];
        }
      }

      const existingSong = songMap.get(play.id);
      if (existingSong) {
        const hasDup = existingSong.listeningEvents.some(e => e.playedAt === play.played_at);
        if (hasDup) {
          duplicatesSkipped++;
          return;
        }
        existingSong.listeningEvents.push({
          playedAt: play.played_at,
          msPlayed: play.duration_ms
        });
        existingSong.listeningEvents.sort((a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime());
        existingSong.playCount = existingSong.listeningEvents.length;
        existingSong.totalListeningTime = existingSong.listeningEvents.reduce((s, e) => s + e.msPlayed, 0);
        if (play.duration_ms && !existingSong.duration_ms) existingSong.duration_ms = play.duration_ms;
        updated++;
      } else {
        songMap.set(play.id, {
          songId: play.id,
          name: play.name,
          albumId: albKey,
          artistId: aKey,
          duration_ms: play.duration_ms,
          playCount: 1,
          totalListeningTime: play.duration_ms,
          listeningEvents: [{ playedAt: play.played_at, msPlayed: play.duration_ms }],
          external_urls: play.external_urls,
          preview_url: play.preview_url
        });
        added++;
      }
    });

    const songs = Array.from(songMap.values());
    const totalListeningTime = songs.reduce((sum, s) => sum + s.totalListeningTime, 0);
    const totalEvents = songs.reduce((sum, s) => sum + s.listeningEvents.length, 0);
    let earliest = existing.metadata.dateRange.earliest;
    let latest = existing.metadata.dateRange.latest;
    for (const s of songs) {
      for (const e of s.listeningEvents) {
        const t = e.playedAt;
        if (!earliest || t < earliest) earliest = t;
        if (!latest || t > latest) latest = t;
      }
    }

    console.log(`📊 Append: ${updated} updated, ${added} new songs, ${duplicatesSkipped} duplicates skipped`);
    return {
      metadata: {
        totalSongs: songs.length,
        totalListeningEvents: totalEvents,
        totalListeningTime,
        dateRange: { earliest: earliest ?? '', latest: latest ?? '' },
        timestamp: new Date().toISOString(),
        source: existing.metadata.source
      },
      albums,
      artists,
      songs
    };
  }

  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Re-key albums and artists to explicit keys (albumName|artistName, artist name) and update song refs.
   * Backfills albumName/artistName from key if missing (old format).
   */
  rekeyToExplicitKeys(data: DeduplicatedHistory): DeduplicatedHistory {
    const newAlbums: Record<string, AlbumRecord> = {};
    const newArtists: Record<string, ArtistRecord> = {};
    const normToExplicitAlbum: Record<string, string> = {};
    const normToExplicitArtist: Record<string, string> = {};

    for (const [key, rec] of Object.entries(data.albums)) {
      const album = { ...rec } as AlbumRecord & { albumName?: string; artistName?: string };
      if (!album.albumName && key.includes('|')) {
        const i = key.lastIndexOf('|');
        album.albumName = key.slice(0, i).trim() || album.name;
        album.artistName = key.slice(i + 1).trim() || 'Unknown Artist';
      } else if (!album.albumName) {
        album.albumName = album.name;
        album.artistName = 'Unknown Artist';
      }
      const explicitKey = this.explicitAlbumKey(album.albumName, album.artistName);
      if (!newAlbums[explicitKey]) newAlbums[explicitKey] = album as AlbumRecord;
      normToExplicitAlbum[key] = explicitKey;
    }
    for (const [key, rec] of Object.entries(data.artists)) {
      const artist = { ...rec };
      if (!artist.name) artist.name = key;
      const explicitKey = artist.name.trim() || 'Unknown Artist';
      if (!newArtists[explicitKey]) newArtists[explicitKey] = artist;
      normToExplicitArtist[key] = explicitKey;
    }

    const songs = data.songs.map(s => ({
      ...s,
      albumId: normToExplicitAlbum[s.albumId] ?? s.albumId,
      artistId: normToExplicitArtist[s.artistId] ?? s.artistId
    }));

    return { ...data, albums: newAlbums, artists: newArtists, songs };
  }

  /**
   * Write deduplicated history to a timestamped file. Re-keys to explicit albumName|artistName before saving.
   */
  save(data: DeduplicatedHistory): string {
    this.ensureOutputDir();
    const rekeyed = this.rekeyToExplicitKeys(data);
    const ts = Date.now();
    const filename = `${DEDUP_FILENAME_PREFIX}-${ts}.json`;
    const filePath = path.join(this.outputDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(rekeyed, null, 2));
    console.log(`💾 Saved ${filePath}`);
    return filePath;
  }

  /**
   * Find latest deduplicated or legacy merged file in output dir.
   */
  findLatestMergedOrDeduplicatedFile(): string | null {
    if (!fs.existsSync(this.outputDir)) return null;
    const files = fs.readdirSync(this.outputDir)
      .filter(f => (f.startsWith(DEDUP_FILENAME_PREFIX) || f.startsWith('merged-streaming-history-')) && f.endsWith('.json'))
      .map(f => ({ name: f, path: path.join(this.outputDir, f), ts: parseInt(f.replace(/\D/g, ''), 10) || 0 }))
      .sort((a, b) => b.ts - a.ts);
    return files.length > 0 ? files[0].path : null;
  }

  /**
   * Remove old deduplicated files, keeping only the latest.
   */
  cleanupOldDeduplicatedFiles(keepPath: string): void {
    if (!fs.existsSync(this.outputDir)) return;
    const keepName = path.basename(keepPath);
    const files = fs.readdirSync(this.outputDir)
      .filter(f => f.startsWith(DEDUP_FILENAME_PREFIX) && f.endsWith('.json') && f !== keepName);
    files.forEach(f => {
      try {
        fs.unlinkSync(path.join(this.outputDir, f));
        console.log(`   🧹 Deleted old ${f}`);
      } catch (e) {
        console.warn('   ⚠️  Could not delete ' + f, e);
      }
    });
  }

  /**
   * Enrich albums and artists with Spotify metadata (id, images, release_date for albums; id, images for artists).
   * Only enriches entries that are missing id or images (or album release_date). Requires Spotify tokens.
   */
  async enrichFromSpotify(data: DeduplicatedHistory): Promise<DeduplicatedHistory> {
    let tokenManager: SpotifyTokenManager;
    try {
      tokenManager = new SpotifyTokenManager();
    } catch {
      console.log('⚠️  Skipping enrichment (Spotify tokens not set). Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN for --enrich.');
      return data;
    }
    const spotifyClient = new SpotifyApiClient();
    const songById = new Map<string, SongRecord>();
    data.songs.forEach(s => songById.set(s.songId, s));
    const toEnrich: string[] = [];
    for (const song of data.songs) {
      const album = data.albums[song.albumId];
      const artist = data.artists[song.artistId];
      const albumNeeds = album && (!album.id || !album.images?.length || !album.release_date);
      const artistNeeds = artist && (!artist.id || !artist.images?.length);
      if (albumNeeds || artistNeeds) {
        toEnrich.push(song.songId);
      }
    }
    if (toEnrich.length === 0) {
      console.log('✅ No albums/artists missing metadata; skipping enrichment.');
      return data;
    }
    const limit = process.env.ENRICH_BATCH_LIMIT ? parseInt(process.env.ENRICH_BATCH_LIMIT, 10) : 500;
    const toProcess = limit > 0 ? toEnrich.slice(0, limit) : toEnrich;
    console.log(`🎵 Enriching ${toProcess.length} songs with Spotify metadata (${toEnrich.length} total still need enrichment)...`);
    if (limit > 0 && toEnrich.length > limit) {
      console.log(`   💡 Re-run to enrich more, or set ENRICH_BATCH_LIMIT=0 to do all in one run.`);
    }
    const accessToken = await tokenManager.getValidAccessToken();
    const albums = { ...data.albums };
    const artists = { ...data.artists };
    const enrichedAlbumKeys = new Set<string>();
    const enrichedArtistKeys = new Set<string>();
    const batchSize = 50;
    const totalBatches = Math.ceil(toProcess.length / batchSize);
    for (let i = 0; i < toProcess.length; i += batchSize) {
      const batchIndex = Math.floor(i / batchSize) + 1;
      const batch = toProcess.slice(i, i + batchSize);
      process.stdout.write(`   Batch ${batchIndex}/${totalBatches}: fetching tracks...`);
      const tracks = await spotifyClient.fetchTracks(accessToken, batch);
      process.stdout.write(` got ${tracks.filter(Boolean).length} tracks.`);
      const artistIds = new Set<string>();
      for (const track of tracks) {
        if (!track) continue;
        const song = songById.get(track.id);
        if (!song) continue;
        const albumKey = song.albumId;
        const artistKey = song.artistId;
        if (track.album && albums[albumKey]) {
          const al = albums[albumKey];
          const needsId = !al.id;
          const needsImages = !al.images?.length;
          const needsReleaseDate = !al.release_date;
          if (needsId || needsImages || needsReleaseDate) {
            albums[albumKey] = {
              ...al,
              id: track.album.id || al.id,
              name: al.name,
              albumName: al.albumName,
              artistName: al.artistName,
              images: track.album.images?.length ? track.album.images : al.images,
              release_date: track.album.release_date ?? al.release_date,
              release_date_precision: track.album.release_date_precision ?? al.release_date_precision
            };
            enrichedAlbumKeys.add(albumKey);
          }
        }
        if (track.artists?.[0]) {
          if (artists[artistKey] && !artists[artistKey].id) {
            artists[artistKey] = {
              ...artists[artistKey],
              id: track.artists[0].id,
              name: artists[artistKey].name
            };
          }
          artistIds.add(track.artists[0].id);
        }
      }
      if (artistIds.size > 0) {
        const artistIdList = Array.from(artistIds);
        process.stdout.write(` Fetching ${artistIdList.length} artists...`);
        const spotifyArtists = await spotifyClient.fetchArtists(accessToken, artistIdList);
        process.stdout.write(` got ${spotifyArtists.size}.`);
        for (const track of tracks) {
          if (!track?.artists?.[0]) continue;
          const song = songById.get(track.id);
          if (!song) continue;
          const artistKey = song.artistId;
          const spotifyArtist = spotifyArtists.get(track.artists[0].id);
          if (spotifyArtist && artists[artistKey] && (!artists[artistKey].images?.length || !artists[artistKey].id)) {
            artists[artistKey] = {
              ...artists[artistKey],
              id: artists[artistKey].id || spotifyArtist.id,
              name: artists[artistKey].name,
              genres: artists[artistKey].genres?.length ? artists[artistKey].genres : (spotifyArtist.genres ?? []),
              images: spotifyArtist.images?.length ? spotifyArtist.images : (artists[artistKey].images ?? [])
            };
            enrichedArtistKeys.add(artistKey);
          }
        }
      }
      console.log(` Enriched so far: ${enrichedAlbumKeys.size} albums, ${enrichedArtistKeys.size} artists.`);
      if (i + batchSize < toProcess.length) {
        await new Promise(r => setTimeout(r, 150));
      }
    }
    console.log(`✅ Enriched ${enrichedAlbumKeys.size} album entries, ${enrichedArtistKeys.size} artist entries from Spotify.`);
    return { ...data, albums, artists };
  }

  /**
   * Load recent plays from temp dir (same as merge-recent-data).
   */
  loadRecentPlays(): RecentPlayData[] | null {
    if (!fs.existsSync(TEMP_DIR)) return null;
    const files = fs.readdirSync(TEMP_DIR)
      .filter(f => f.startsWith('temp-recent-plays-') && f.endsWith('.json'))
      .sort()
      .reverse();
    if (files.length === 0) return null;
    const data = fs.readFileSync(path.join(TEMP_DIR, files[0]), 'utf8');
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) return parsed;
    if (parsed.plays && Array.isArray(parsed.plays)) return parsed.plays;
    return null;
  }
}

// ----- CLI -----
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const appendOnly = args.includes('--append');
  const doEnrich = args.includes('--enrich');
  const builder = new DeduplicatedHistoryBuilder();

  if (appendOnly) {
    const latestFile = builder.findLatestMergedOrDeduplicatedFile();
    if (!latestFile) {
      console.error('❌ No existing merged or deduplicated file found. Run without --append first.');
      process.exit(1);
    }
    const recentPlays = builder.loadRecentPlays();
    if (!recentPlays || recentPlays.length === 0) {
      console.log('⚠️  No recent plays in temp/. Skipping append.');
      return;
    }
    console.log(`📁 Loading ${path.basename(latestFile)} and appending ${recentPlays.length} recent plays...`);
    let existing = builder.loadExistingDeduplicated(latestFile);
    const merged = builder.appendRecentPlays(existing, recentPlays);
    let savedPath: string;
    if (doEnrich) {
      const enriched = await builder.enrichFromSpotify(merged);
      savedPath = builder.save(enriched);
    } else {
      savedPath = builder.save(merged);
    }
    const cleanedDataDir = path.join(process.cwd(), 'data', 'cleaned-data');
    await buildMasterAlbumList(savedPath, cleanedDataDir);
    return;
  }

  const existingFile = builder.findLatestMergedOrDeduplicatedFile();
  const existingIsDeduplicated = existingFile && path.basename(existingFile).startsWith(DEDUP_FILENAME_PREFIX);
  let data: DeduplicatedHistory;

  if (doEnrich && existingIsDeduplicated) {
    console.log(`📁 Loading latest deduplicated file (${path.basename(existingFile!)}) to enrich only what's still missing...`);
    data = builder.loadExistingDeduplicated(existingFile!);
  } else if (args.includes('--from-merged') && existingFile) {
    console.log(`📁 Converting existing ${path.basename(existingFile)} to deduplicated format...`);
    data = builder.loadExistingDeduplicated(existingFile);
  } else {
    data = builder.buildFromSpotifyHistory();
  }

  if (doEnrich) {
    data = await builder.enrichFromSpotify(data);
  }

  let finalDedupPath = builder.save(data);

  const recentPlays = builder.loadRecentPlays();
  if (recentPlays && recentPlays.length > 0) {
    console.log(`📎 Appending ${recentPlays.length} recent plays...`);
    const merged = builder.appendRecentPlays(data, recentPlays);
    finalDedupPath = builder.save(merged);
  }

  const cleanedDataDir = path.join(process.cwd(), 'data', 'cleaned-data');
  const masterListPath = await buildMasterAlbumList(finalDedupPath, cleanedDataDir);
  console.log('🎉 Done. Dedup output: ' + finalDedupPath + ' | Master album list: ' + masterListPath);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

export { DeduplicatedHistoryBuilder, type DeduplicatedHistory, type SongRecord, type AlbumRecord, type ArtistRecord };
