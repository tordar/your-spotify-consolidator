import { SpotifyTokenManager } from '../spotify-token-manager';
import { SpotifyApiClient, RateLimitSkipEnrichmentError } from './utils/spotify-api-client';
// import { MusicBrainzApiClient } from './utils/musicbrainz-api-client';
import { ConsolidationRulesManager, Consolidator } from './utils/consolidation';
import { FileOperations } from './utils/file-operations';
import type {
  CompleteListeningHistory,
  CompleteSong,
  CleanedSong,
  CleanedAlbum,
  CleanedArtist,
  AlbumWithSongs,
  AlbumSong,
  SpotifyTrack,
  SpotifyAlbum,
  SpotifyArtist,
  DetailedStats,
  YearlyListeningTime,
  YearlyTopItems,
  TopSong,
  TopArtist,
  TopAlbum,
  HourlyListeningDistribution,
  CountryListeningData,
  ArtistTopSong,
  ArtistTopAlbum
} from './utils/types';

class CleanedFilesGenerator {
  private tokenManager: SpotifyTokenManager | null = null;
  private spotifyApiClient: SpotifyApiClient;
  private consolidator: Consolidator;
  private fileOps: FileOperations;

  constructor() {
    this.spotifyApiClient = new SpotifyApiClient();
    this.consolidator = new Consolidator(new ConsolidationRulesManager());
    this.fileOps = new FileOperations();
  }

  /**
   * Copy images from source to target if source has images
   */
  private copyImagesIfAvailable(
    target: { images: Array<{ height: number; url: string; width: number }> | undefined },
    source: { images: Array<{ height: number; url: string; width: number }> | undefined } | undefined | null
  ): void {
    if (source?.images && source.images.length > 0) {
      target.images = source.images;
    }
  }

  /**
   * Generate cleaned songs from complete history
   */
  private generateCleanedSongs(history: CompleteListeningHistory): { songs: CleanedSong[], originalCount: number, consolidatedCount: number } {
    console.log('🎵 Generating cleaned songs...');

    // Calculate cutoff date for 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffTimestamp = thirtyDaysAgo.getTime();

    // Create a map of songId -> CompleteSong for later lookup
    const songIdToCompleteSong = new Map<string, CompleteSong>();
    history.songs.forEach(song => {
      songIdToCompleteSong.set(song.songId, song);
    });

    const songs: CleanedSong[] = history.songs.map(song => {
      // Filter events from 30+ days ago
      const events30DaysAgo = song.listeningEvents.filter(event => {
        const eventDate = new Date(event.playedAt).getTime();
        return eventDate < cutoffTimestamp;
      });
      const count30DaysAgo = events30DaysAgo.length;

      // Calculate yearly play time
      const yearlyPlayTimeMap = new Map<string, number>();
      if (song.listeningEvents && song.listeningEvents.length > 0) {
        song.listeningEvents.forEach(event => {
          if (event.playedAt) {
            const eventDate = new Date(event.playedAt);
            const year = eventDate.getFullYear().toString();
            yearlyPlayTimeMap.set(year, (yearlyPlayTimeMap.get(year) || 0) + event.msPlayed);
          }
        });
      }
      
      // Convert yearly play time map to sorted array
      const yearlyPlayTime = Array.from(yearlyPlayTimeMap.entries())
        .map(([year, totalListeningTimeMs]) => ({
          year,
          totalListeningTimeMs
        }))
        .sort((a, b) => a.year.localeCompare(b.year));

      return {
        rank: 0,
        duration_ms: song.totalListeningTime,
        count: song.playCount,
        count_30_days_ago: count30DaysAgo,
        songId: song.songId,
        song: {
          name: song.name,
          preview_url: song.preview_url,
          external_urls: song.external_urls
        },
        album: {
          name: song.album.name,
          images: song.album.images
        },
        artist: {
          name: song.artist.name,
          genres: song.artist.genres
        },
        consolidated_count: song.playCount,
        original_songIds: [song.songId],
        yearly_play_time: yearlyPlayTime.length > 0 ? yearlyPlayTime : undefined
      };
    });

    songs.sort((a, b) => b.count - a.count);
    const consolidatedSongs = this.consolidator.consolidateSongs(songs);
    
    // Update consolidated songs to use the most recently played song's metadata
    const updatedConsolidatedSongs = consolidatedSongs.map(consolidatedSong => {
      // Find the most recently played song from all original_songIds
      let mostRecentSong: CompleteSong | null = null;
      let mostRecentPlayTime = 0;
      
      // Check all original song IDs (including the primary songId)
      const allSongIds = [consolidatedSong.songId, ...consolidatedSong.original_songIds];
      for (const songId of allSongIds) {
        const completeSong = songIdToCompleteSong.get(songId);
        if (completeSong && completeSong.listeningEvents && completeSong.listeningEvents.length > 0) {
          // Events are sorted (earliest first), so the last event is the most recent
          const lastEvent = completeSong.listeningEvents[completeSong.listeningEvents.length - 1];
          const lastEventTime = new Date(lastEvent.playedAt).getTime();
          
          if (lastEventTime > mostRecentPlayTime) {
            mostRecentPlayTime = lastEventTime;
            mostRecentSong = completeSong;
          }
        }
      }
      
      // If we found a more recent song, update the metadata
      if (mostRecentSong !== null && mostRecentSong.songId !== consolidatedSong.songId) {
        return {
          ...consolidatedSong,
          songId: mostRecentSong.songId,
          song: {
            name: mostRecentSong.name,
            preview_url: mostRecentSong.preview_url,
            external_urls: mostRecentSong.external_urls
          },
          album: {
            name: mostRecentSong.album.name,
            images: mostRecentSong.album.images
          },
          artist: {
            name: mostRecentSong.artist.name,
            genres: mostRecentSong.artist.genres
          }
        };
      }
      
      return consolidatedSong;
    });
    
    // Calculate 30-days-ago rankings
    // Create a copy of consolidated songs with 30-days-ago counts for ranking
    const songs30DaysAgo = updatedConsolidatedSongs
      .map(song => ({
        ...song,
        count: song.count_30_days_ago || 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 500);
    
    // Create a map of songId -> rank for 30 days ago
    const rankMap30DaysAgo = new Map<string, number>();
    songs30DaysAgo.forEach((song, index) => {
      // For consolidated songs, we need to check all original_songIds
      song.original_songIds.forEach(songId => {
        rankMap30DaysAgo.set(songId, index + 1);
      });
      // Also use the primary songId
      rankMap30DaysAgo.set(song.songId, index + 1);
    });
    
    // Assign current ranks and add 30-days-ago ranks
    const topSongs = updatedConsolidatedSongs.slice(0, 500).map((song, index) => {
      // Find the rank 30 days ago by checking the songId or any of its original_songIds
      let rank30DaysAgo: number | undefined;
      if (rankMap30DaysAgo.has(song.songId)) {
        rank30DaysAgo = rankMap30DaysAgo.get(song.songId);
      } else {
        // Check original_songIds
        for (const originalId of song.original_songIds) {
          if (rankMap30DaysAgo.has(originalId)) {
            rank30DaysAgo = rankMap30DaysAgo.get(originalId);
            break;
          }
        }
      }
      
      return {
        ...song,
        rank: index + 1,
        rank_30_days_ago: rank30DaysAgo
      };
    });
    
    return {
      songs: topSongs,
      originalCount: songs.length,
      consolidatedCount: updatedConsolidatedSongs.length
    };
  }

  /**
   * Generate cleaned artists from complete history
   */
  private generateCleanedArtists(history: CompleteListeningHistory): { artists: CleanedArtist[], originalCount: number, consolidatedCount: number } {
    console.log('👤 Generating cleaned artists...');

    // Calculate cutoff date for 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffTimestamp = thirtyDaysAgo.getTime();

    const artistMap = new Map<string, {
      songs: CompleteSong[];
      totalPlayCount: number;
      totalListeningTime: number;
      totalPlayCount30DaysAgo: number;
      differentSongs: Set<string>;
    }>();

    history.songs.forEach(song => {
      const artistName = song.artist.name;
      
      // Calculate play count 30 days ago for this song
      const events30DaysAgo = song.listeningEvents.filter(event => {
        const eventDate = new Date(event.playedAt).getTime();
        return eventDate < cutoffTimestamp;
      });
      const count30DaysAgo = events30DaysAgo.length;
      
      if (!artistMap.has(artistName)) {
        artistMap.set(artistName, {
          songs: [],
          totalPlayCount: 0,
          totalListeningTime: 0,
          totalPlayCount30DaysAgo: 0,
          differentSongs: new Set()
        });
      }
      
      const artistData = artistMap.get(artistName)!;
      artistData.songs.push(song);
      artistData.totalPlayCount += song.playCount;
      artistData.totalListeningTime += song.totalListeningTime;
      artistData.totalPlayCount30DaysAgo += count30DaysAgo;
      artistData.differentSongs.add(song.songId);
    });

    const artists: CleanedArtist[] = Array.from(artistMap.entries()).map(([artistName, data]) => {
      // Find the song with the most recent listening event to use as the representative song
      // This avoids issues with old tracks that may have incorrect metadata (e.g., covers now filed under "Various Artists")
      // We combine this with the yearly play time calculation to avoid an extra iteration
      let representativeSong = data.songs[0]; // Fallback to first song
      let mostRecentPlayTime = 0;
      const yearlyPlayTimeMap = new Map<string, number>();
      
      data.songs.forEach(song => {
        if (song.listeningEvents && song.listeningEvents.length > 0) {
          // Events are sorted (earliest first), so the last event is the most recent
          const lastEvent = song.listeningEvents[song.listeningEvents.length - 1];
          const lastEventTime = new Date(lastEvent.playedAt).getTime();
          
          // Track the most recent song for artist metadata lookup
          if (lastEventTime > mostRecentPlayTime) {
            mostRecentPlayTime = lastEventTime;
            representativeSong = song;
          }
          
          // Calculate yearly play time (already iterating, so do it here)
          song.listeningEvents.forEach(event => {
            if (event.playedAt) {
              const eventDate = new Date(event.playedAt);
              const year = eventDate.getFullYear().toString();
              yearlyPlayTimeMap.set(year, (yearlyPlayTimeMap.get(year) || 0) + event.msPlayed);
            }
          });
        }
      });
      
      const firstSong = representativeSong; // Keep variable name for compatibility with rest of code
      
      // Convert yearly play time map to sorted array
      const yearlyPlayTime = Array.from(yearlyPlayTimeMap.entries())
        .map(([year, totalListeningTimeMs]) => ({
          year,
          totalListeningTimeMs
        }))
        .sort((a, b) => a.year.localeCompare(b.year));
      
      // Calculate top songs for this artist (consolidated by song name)
      const songMap = new Map<string, {
        songId: string;
        name: string;
        playCount: number;
        totalListeningTime: number;
        album: {
          name: string;
          images: Array<{ height: number; url: string; width: number }>;
        };
      }>();
      
      data.songs.forEach(song => {
        const songKey = song.name.toLowerCase().trim();
        if (songMap.has(songKey)) {
          const existing = songMap.get(songKey)!;
          existing.playCount += song.playCount;
          existing.totalListeningTime += song.totalListeningTime;
          // Use song with more plays as representative
          if (song.playCount > existing.playCount || 
              (song.album.images && song.album.images.length > 0 && (!existing.album.images || existing.album.images.length === 0))) {
            existing.songId = song.songId;
            existing.name = song.name;
            if (song.album.images && song.album.images.length > 0) {
              existing.album.images = song.album.images;
            }
          }
        } else {
          songMap.set(songKey, {
            songId: song.songId,
            name: song.name,
            playCount: song.playCount,
            totalListeningTime: song.totalListeningTime,
            album: {
              name: song.album.name,
              images: song.album.images || []
            }
          });
        }
      });
      
      const topSongs: ArtistTopSong[] = Array.from(songMap.values())
        .sort((a, b) => b.totalListeningTime - a.totalListeningTime)
        .slice(0, 5)
        .map(song => ({
          songId: song.songId,
          name: song.name,
          play_count: song.playCount,
          total_listening_time_ms: song.totalListeningTime,
          album: {
            name: song.album.name,
            images: song.album.images
          }
        }));
      
      // Calculate top albums for this artist (consolidated by album name using consolidation rules)
      const albumMap = new Map<string, {
        primaryAlbumId: string;
        name: string;
        playCount: number;
        totalListeningTime: number;
        images: Array<{ height: number; url: string; width: number }>;
        artists: string[];
      }>();
      
      data.songs.forEach(song => {
        if (!song.album.name || song.album.name.trim() === '') {
          return;
        }
        
        const albumName = song.album.name.trim();
        // Normalize album name using consolidation rules
        const normalizedAlbumName = this.consolidator.normalizeAlbumNameForGrouping(albumName, artistName);
        const albumKey = normalizedAlbumName.toLowerCase();
        
        if (albumMap.has(albumKey)) {
          const existing = albumMap.get(albumKey)!;
          existing.playCount += song.playCount;
          existing.totalListeningTime += song.totalListeningTime;
          // Use album with more plays or better images as representative
          if (song.playCount > existing.playCount || 
              (song.album.images && song.album.images.length > 0 && (!existing.images || existing.images.length === 0))) {
            existing.primaryAlbumId = song.songId; // Use songId as album identifier
            const baseName = this.consolidator.getBaseAlbumNameForGrouping(albumName, artistName);
            existing.name = baseName || albumName;
            if (song.album.images && song.album.images.length > 0) {
              existing.images = song.album.images;
            }
          }
        } else {
          const baseName = this.consolidator.getBaseAlbumNameForGrouping(albumName, artistName);
          albumMap.set(albumKey, {
            primaryAlbumId: song.songId,
            name: baseName || albumName,
            playCount: song.playCount,
            totalListeningTime: song.totalListeningTime,
            images: song.album.images || [],
            artists: song.artists.length > 0 ? song.artists : [artistName]
          });
        }
      });
      
      const topAlbums: ArtistTopAlbum[] = Array.from(albumMap.values())
        .sort((a, b) => b.totalListeningTime - a.totalListeningTime)
        .slice(0, 5)
        .map(album => ({
          primaryAlbumId: album.primaryAlbumId,
          name: album.name,
          play_count: album.playCount,
          total_listening_time_ms: album.totalListeningTime,
          images: album.images,
          artists: album.artists
        }));
      
      return {
        rank: 0,
        duration_ms: data.songs.reduce((sum, song) => sum + song.duration_ms, 0),
        count: data.totalPlayCount,
        count_30_days_ago: data.totalPlayCount30DaysAgo,
        differents: data.differentSongs.size,
        primaryArtistId: firstSong.songId,
        total_count: data.totalPlayCount,
        total_duration_ms: data.totalListeningTime,
        artist: {
          name: artistName,
          genres: firstSong.artist.genres,
          popularity: 0,
          followers: {
            total: 0
          },
          images: [],
          external_urls: {}
        },
        consolidated_count: data.totalPlayCount,
        original_artistIds: [firstSong.songId],
        yearly_play_time: yearlyPlayTime.length > 0 ? yearlyPlayTime : undefined,
        top_songs: topSongs.length > 0 ? topSongs : undefined,
        top_albums: topAlbums.length > 0 ? topAlbums : undefined
      };
    });

    artists.sort((a, b) => b.count - a.count);
    const consolidatedArtists = this.consolidator.consolidateArtists(artists);
    
    // Update consolidated artists to use the most recently played artist's metadata
    // Create a map of primaryArtistId -> CleanedArtist for lookup
    const primaryArtistIdToArtist = new Map<string, CleanedArtist>();
    artists.forEach(artist => {
      primaryArtistIdToArtist.set(artist.primaryArtistId, artist);
    });
    
    // Create a map of songId -> CompleteSong for finding most recent play time
    const songIdToCompleteSong = new Map<string, CompleteSong>();
    history.songs.forEach(song => {
      songIdToCompleteSong.set(song.songId, song);
    });
    
    const updatedConsolidatedArtists = consolidatedArtists.map(consolidatedArtist => {
      // Find the most recently played artist from all original_artistIds
      let mostRecentArtist: CleanedArtist | null = null;
      let mostRecentPlayTime = 0;
      
      // Check all original artist IDs (including the primaryArtistId)
      const allArtistIds = [consolidatedArtist.primaryArtistId, ...(consolidatedArtist.original_artistIds || [])];
      for (const artistId of allArtistIds) {
        const originalArtist = primaryArtistIdToArtist.get(artistId);
        if (originalArtist) {
          // Find the most recent play time from the representative song
          const completeSong = songIdToCompleteSong.get(originalArtist.primaryArtistId);
          if (completeSong && completeSong.listeningEvents && completeSong.listeningEvents.length > 0) {
            // Events are sorted (earliest first), so the last event is the most recent
            const lastEvent = completeSong.listeningEvents[completeSong.listeningEvents.length - 1];
            const lastEventTime = new Date(lastEvent.playedAt).getTime();
            
            if (lastEventTime > mostRecentPlayTime) {
              mostRecentPlayTime = lastEventTime;
              mostRecentArtist = originalArtist;
            }
          }
        }
      }
      
      // If we found a more recent artist, update the metadata
      if (mostRecentArtist !== null && mostRecentArtist.primaryArtistId !== consolidatedArtist.primaryArtistId) {
        return {
          ...consolidatedArtist,
          primaryArtistId: mostRecentArtist.primaryArtistId,
          artist: {
            ...consolidatedArtist.artist,
            name: mostRecentArtist.artist.name,
            genres: mostRecentArtist.artist.genres.length > 0 ? mostRecentArtist.artist.genres : consolidatedArtist.artist.genres,
            images: mostRecentArtist.artist.images.length > 0 ? mostRecentArtist.artist.images : consolidatedArtist.artist.images,
            external_urls: Object.keys(mostRecentArtist.artist.external_urls).length > 0 ? mostRecentArtist.artist.external_urls : consolidatedArtist.artist.external_urls,
            popularity: mostRecentArtist.artist.popularity || consolidatedArtist.artist.popularity,
            followers: mostRecentArtist.artist.followers || consolidatedArtist.artist.followers
          },
          // Also update top_songs and top_albums if the most recent artist has them
          top_songs: mostRecentArtist.top_songs || consolidatedArtist.top_songs,
          top_albums: mostRecentArtist.top_albums || consolidatedArtist.top_albums
        };
      }
      
      return consolidatedArtist;
    });
    
    // Calculate 30-days-ago rankings
    const artists30DaysAgo = updatedConsolidatedArtists
      .map(artist => ({
        ...artist,
        count: artist.count_30_days_ago || 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 500);
    
    // Create a map of artist name -> rank for 30 days ago
    const rankMap30DaysAgo = new Map<string, number>();
    artists30DaysAgo.forEach((artist, index) => {
      const artistNameKey = artist.artist.name.toLowerCase().trim();
      rankMap30DaysAgo.set(artistNameKey, index + 1);
      // Also check by primaryArtistId
      if (artist.primaryArtistId) {
        rankMap30DaysAgo.set(artist.primaryArtistId, index + 1);
      }
    });
    
    // Assign current ranks and add 30-days-ago ranks
    const topArtists = updatedConsolidatedArtists.slice(0, 500).map((artist, index) => {
      const artistNameKey = artist.artist.name.toLowerCase().trim();
      let rank30DaysAgo: number | undefined;
      
      if (rankMap30DaysAgo.has(artistNameKey)) {
        rank30DaysAgo = rankMap30DaysAgo.get(artistNameKey);
      } else if (artist.primaryArtistId && rankMap30DaysAgo.has(artist.primaryArtistId)) {
        rank30DaysAgo = rankMap30DaysAgo.get(artist.primaryArtistId);
      }
      
      return {
        ...artist,
        rank: index + 1,
        rank_30_days_ago: rank30DaysAgo
      };
    });
    
    return {
      artists: topArtists,
      originalCount: artists.length,
      consolidatedCount: updatedConsolidatedArtists.length
    };
  }

  /**
   * Generate lightweight artist-genre data for network analysis
   * Includes all artists with play count >= minPlayCount
   */
  private generateAllArtistsGenres(
    history: CompleteListeningHistory,
    minPlayCount: number = 10
  ): Array<{ name: string; play_count: number; genres: string[]; songId: string }> {
    console.log(`🎵 Generating all artists genres (min ${minPlayCount} plays)...`);

    const artistMap = new Map<string, { 
      playCount: number; 
      genres: Set<string>;
      representativeSongId: string;
      mostRecentPlayTime: number;
    }>();

    history.songs.forEach(song => {
      const artistName = song.artist.name;
      
      if (!artistMap.has(artistName)) {
        // Find most recent play time for this song
        let mostRecentTime = 0;
        if (song.listeningEvents && song.listeningEvents.length > 0) {
          const lastEvent = song.listeningEvents[song.listeningEvents.length - 1];
          mostRecentTime = new Date(lastEvent.playedAt).getTime();
        }
        
        artistMap.set(artistName, {
          playCount: 0,
          genres: new Set(song.artist.genres || []),
          representativeSongId: song.songId,
          mostRecentPlayTime: mostRecentTime
        });
      }
      
      const artistData = artistMap.get(artistName)!;
      artistData.playCount += song.playCount;
      
      // Merge genres from all songs by this artist
      if (song.artist.genres && song.artist.genres.length > 0) {
        song.artist.genres.forEach(genre => artistData.genres.add(genre));
      }
      
      // Update representative song if this one is more recent
      if (song.listeningEvents && song.listeningEvents.length > 0) {
        const lastEvent = song.listeningEvents[song.listeningEvents.length - 1];
        const lastEventTime = new Date(lastEvent.playedAt).getTime();
        if (lastEventTime > artistData.mostRecentPlayTime) {
          artistData.mostRecentPlayTime = lastEventTime;
          artistData.representativeSongId = song.songId;
        }
      }
    });

    const allArtists = Array.from(artistMap.entries())
      .filter(([_, data]) => data.playCount >= minPlayCount)
      .map(([name, data]) => ({
        name,
        play_count: data.playCount,
        genres: Array.from(data.genres),
        songId: data.representativeSongId
      }))
      .sort((a, b) => b.play_count - a.play_count);

    console.log(`✅ Generated ${allArtists.length} artists (min ${minPlayCount} plays)`);
    return allArtists;
  }

  /**
   * Enrich all artists genres with metadata from Spotify API
   */
  private async enrichAllArtistsGenres(
    artists: Array<{ name: string; play_count: number; genres: string[]; songId: string }>,
    existingArtists: Map<string, CleanedArtist>
  ): Promise<Array<{ name: string; play_count: number; genres: string[] }>> {
    if (!this.tokenManager) {
      console.log('ℹ️  Skipping genre enrichment (Spotify tokens not available)');
      return artists.map(({ songId, ...rest }) => rest);
    }

    console.log('\n📥 Enriching all artists genres from Spotify API...');
    
    // Filter artists that need enrichment (empty genres or not in existing)
    const artistsNeedingEnrichment = artists.filter(artist => {
      const nameKey = artist.name.toLowerCase().trim();
      const existing = existingArtists.get(nameKey);
      return !existing || !existing.artist.genres || existing.artist.genres.length === 0;
    });

    if (artistsNeedingEnrichment.length === 0) {
      console.log('✅ All artists already have genres, skipping API calls');
      return artists.map(({ songId, ...rest }) => rest);
    }

    // First, try to copy genres from existing artists
    artists.forEach(artist => {
      const nameKey = artist.name.toLowerCase().trim();
      const existing = existingArtists.get(nameKey);
      if (existing && existing.artist.genres && existing.artist.genres.length > 0) {
        artist.genres = existing.artist.genres;
      }
    });

    // Get remaining artists that still need enrichment
    const stillNeedingEnrichment = artistsNeedingEnrichment.filter(artist => 
      !artist.genres || artist.genres.length === 0
    );

    if (stillNeedingEnrichment.length === 0) {
      console.log('✅ All artists enriched from existing data');
      return artists.map(({ songId, ...rest }) => rest);
    }

    const accessToken = await this.tokenManager.getValidAccessToken();
    const songIds = stillNeedingEnrichment.map(artist => artist.songId).filter(id => id);
    const uniqueSongIds = Array.from(new Set(songIds));

    console.log(`   Fetching ${uniqueSongIds.length} unique tracks to get artist IDs (${artists.length - uniqueSongIds.length} already have genres)...`);
    
    // Fetch tracks in batches
    const trackMap = new Map<string, SpotifyTrack>();
    const batchSize = 50;
    for (let i = 0; i < uniqueSongIds.length; i += batchSize) {
      const batch = uniqueSongIds.slice(i, i + batchSize);
      const tracks = await this.spotifyApiClient.fetchTracks(accessToken, batch);
      tracks.forEach(track => trackMap.set(track.id, track));
      
      if (i + batchSize < uniqueSongIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`✅ Fetched ${trackMap.size} tracks`);

    // Extract artist IDs from tracks
    const artistIds = new Set<string>();
    const songIdToArtistId = new Map<string, string>();
    trackMap.forEach(track => {
      if (track.artists && track.artists.length > 0) {
        const artistId = track.artists[0].id;
        if (artistId) {
          artistIds.add(artistId);
          songIdToArtistId.set(track.id, artistId);
        }
      }
    });

    console.log(`   Found ${artistIds.size} unique artist IDs, fetching artist metadata...`);
    
    // Fetch artists in batches
    const artistsMap = new Map<string, SpotifyArtist>();
    const artistIdsArray = Array.from(artistIds);
    for (let i = 0; i < artistIdsArray.length; i += batchSize) {
      const batch = artistIdsArray.slice(i, i + batchSize);
      const batchArtists = await this.spotifyApiClient.fetchArtists(accessToken, batch);
      batchArtists.forEach((artist, id) => artistsMap.set(id, artist));
      
      if (i + batchSize < artistIdsArray.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`✅ Fetched ${artistsMap.size} artists`);

    // Update artists with genres
    let enrichedCount = 0;
    artists.forEach(artist => {
      if (!artist.genres || artist.genres.length === 0) {
        const artistId = songIdToArtistId.get(artist.songId);
        const spotifyArtist = artistId ? artistsMap.get(artistId) : null;
        
        if (spotifyArtist && spotifyArtist.genres && spotifyArtist.genres.length > 0) {
          artist.genres = spotifyArtist.genres;
          enrichedCount++;
        }
      }
    });

    console.log(`✅ Enriched ${enrichedCount} artists with genres from Spotify`);

    // MusicBrainz enrichment as fallback for artists with few or no genres
    // COMMENTED OUT: MusicBrainz integration temporarily disabled
    /*
    const artistsNeedingMoreGenres = artists.filter(artist => 
      !artist.genres || artist.genres.length < 3 // Only enrich if < 3 genres
    );

    if (artistsNeedingMoreGenres.length > 0) {
      console.log(`\n📥 Enriching ${artistsNeedingMoreGenres.length} artists with MusicBrainz (artists with < 3 genres)...`);
      
      const mbClient = new MusicBrainzApiClient();
      const artistNames = artistsNeedingMoreGenres.map(a => a.name);
      const mbGenres = await mbClient.searchArtistsGenres(artistNames);
      
      // Merge MusicBrainz genres with existing Spotify genres
      let mbEnrichedCount = 0;
      artists.forEach(artist => {
        const nameKey = artist.name.toLowerCase().trim();
        const mbGenresForArtist = mbGenres.get(nameKey);
        
        if (mbGenresForArtist && mbGenresForArtist.length > 0) {
          // Merge genres, avoiding duplicates
          const existingGenres = new Set((artist.genres || []).map(g => g.toLowerCase()));
          let addedGenres = 0;
          
          mbGenresForArtist.forEach(genre => {
            if (!existingGenres.has(genre)) {
              artist.genres = artist.genres || [];
              artist.genres.push(genre);
              existingGenres.add(genre);
              addedGenres++;
            }
          });
          
          if (addedGenres > 0) {
            mbEnrichedCount++;
          }
        }
      });
      
      console.log(`✅ MusicBrainz enriched ${mbEnrichedCount} artists with additional genres`);
    }
    */

    return artists.map(({ songId, ...rest }) => rest);
  }

  /**
   * Generate albums with songs from complete history
   */
  private generateAlbumsWithSongs(history: CompleteListeningHistory): { albums: AlbumWithSongs[], originalCount: number } {
    console.log('💿🎵 Generating albums with songs...');

    // Calculate cutoff date for 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffTimestamp = thirtyDaysAgo.getTime();

    const albumMap = new Map<string, CompleteSong[]>();
    history.songs.forEach(song => {
      if (!song.album.name || song.album.name.trim() === '') {
        return;
      }
      
      const albumName = song.album.name.trim();
      const songArtist = (song.artists[0] || song.artist.name || 'Unknown Artist').trim();
      // Normalize album name using consolidation rules before grouping
      const normalizedAlbumName = this.consolidator.normalizeAlbumNameForGrouping(albumName, songArtist);
      const albumKey = `${normalizedAlbumName}|${songArtist.toLowerCase()}`;
      
      if (!albumMap.has(albumKey)) {
        albumMap.set(albumKey, []);
      }
      albumMap.get(albumKey)!.push(song);
    });

    const albumsWithSongs: AlbumWithSongs[] = Array.from(albumMap.entries()).map(([albumKey, songs]) => {
      const artistCounts = new Map<string, number>();
      songs.forEach(song => {
        const artist = (song.artists[0] || song.artist.name || '').trim();
        if (artist) {
          artistCounts.set(artist.toLowerCase(), (artistCounts.get(artist.toLowerCase()) || 0) + 1);
        }
      });
      
      let mostCommonArtist = '';
      let maxCount = 0;
      artistCounts.forEach((count, artist) => {
        if (count > maxCount) {
          maxCount = count;
          mostCommonArtist = artist;
        }
      });
      
      // Find the most recently played song to use as representative
      let representativeSong: CompleteSong = songs[0];
      let mostRecentPlayTime = 0;
      
      songs.forEach(song => {
        if (song.listeningEvents && song.listeningEvents.length > 0) {
          // Events are sorted (earliest first), so the last event is the most recent
          const lastEvent = song.listeningEvents[song.listeningEvents.length - 1];
          const lastEventTime = new Date(lastEvent.playedAt).getTime();
          
          if (lastEventTime > mostRecentPlayTime) {
            mostRecentPlayTime = lastEventTime;
            representativeSong = song;
          }
        }
      });
      
      const matchingSongs = songs.filter(song => {
        const songArtist = (song.artists[0] || song.artist.name || '').toLowerCase().trim();
        return songArtist === mostCommonArtist || songArtist === '';
      });
      
      const validSongs = matchingSongs.length > 0 ? matchingSongs : songs;
      const totalPlayCount = validSongs.reduce((sum, song) => sum + song.playCount, 0);
      const totalListeningTime = validSongs.reduce((sum, song) => sum + song.totalListeningTime, 0);
      const playedSongs = validSongs.filter(song => song.playCount > 0).length;
      
      // Calculate play count 30 days ago for this album
      let totalPlayCount30DaysAgo = 0;
      validSongs.forEach(song => {
        if (song.listeningEvents && song.listeningEvents.length > 0) {
          const events30DaysAgo = song.listeningEvents.filter(event => {
            const eventDate = new Date(event.playedAt).getTime();
            return eventDate < cutoffTimestamp;
          });
          totalPlayCount30DaysAgo += events30DaysAgo.length;
        }
      });
      
      // Find the earliest play time across all listening events for this album
      let earliestPlayedAt: string | undefined;
      // Calculate yearly play time
      const yearlyPlayTimeMap = new Map<string, number>();
      validSongs.forEach(song => {
        if (song.listeningEvents && song.listeningEvents.length > 0) {
          song.listeningEvents.forEach(event => {
            if (event.playedAt) {
              if (!earliestPlayedAt || event.playedAt < earliestPlayedAt) {
                earliestPlayedAt = event.playedAt;
              }
              // Extract year from playedAt timestamp
              const eventDate = new Date(event.playedAt);
              const year = eventDate.getFullYear().toString();
              // Sum msPlayed for each year
              yearlyPlayTimeMap.set(year, (yearlyPlayTimeMap.get(year) || 0) + event.msPlayed);
            }
          });
        }
      });
      
      // Convert yearly play time map to sorted array
      const yearlyPlayTime = Array.from(yearlyPlayTimeMap.entries())
        .map(([year, totalListeningTimeMs]) => ({
          year,
          totalListeningTimeMs
        }))
        .sort((a, b) => a.year.localeCompare(b.year));

      const albumSongs: AlbumSong[] = validSongs.map(song => ({
        songId: song.songId,
        name: song.name,
        duration_ms: song.duration_ms,
        track_number: 1,
        disc_number: 1,
        explicit: false,
        preview_url: song.preview_url,
        external_urls: song.external_urls,
        play_count: song.playCount,
        total_listening_time_ms: song.totalListeningTime,
        artists: song.artists
      }));

      const albumArtists = validSongs
        .map(s => s.artists[0] || s.artist.name)
        .filter((artist, index, arr) => arr.indexOf(artist) === index && artist)
        .slice(0, 1);

      // Get the base album name from consolidation rules if available
      const firstSongArtist = validSongs[0]?.artists[0] || validSongs[0]?.artist.name || 'Unknown Artist';
      const baseAlbumName = this.consolidator.getBaseAlbumNameForGrouping(
        validSongs[0]?.album.name || '', 
        firstSongArtist
      );
      
      // If we have a base name from rules, use it; otherwise use most common name
      let finalAlbumName: string;
      if (baseAlbumName) {
        finalAlbumName = baseAlbumName;
      } else {
        const albumNameCounts = new Map<string, number>();
        validSongs.forEach(song => {
          const albumName = (song.album.name || '').trim();
          if (albumName) {
            albumNameCounts.set(albumName.toLowerCase(), (albumNameCounts.get(albumName.toLowerCase()) || 0) + 1);
          }
        });
        
        let mostCommonAlbumName = '';
        let maxAlbumCount = 0;
        albumNameCounts.forEach((count, albumName) => {
          if (count > maxAlbumCount) {
            maxAlbumCount = count;
            mostCommonAlbumName = albumName;
          }
        });
        
        const representativeSongForAlbum = validSongs.find(song => 
          (song.album.name || '').toLowerCase().trim() === mostCommonAlbumName
        ) || representativeSong;
        
        finalAlbumName = mostCommonAlbumName 
          ? validSongs.find(s => (s.album.name || '').toLowerCase().trim() === mostCommonAlbumName)?.album.name || representativeSongForAlbum.album.name
          : representativeSongForAlbum.album.name;
      }
      
      // Find the most recently played song that matches the final album name, or use the most recent overall
      let representativeSongForAlbum: CompleteSong = representativeSong;
      let mostRecentPlayTimeForAlbum = 0;
      
      // First try to find most recent song matching the final album name
      for (const song of validSongs) {
        if ((song.album.name || '').toLowerCase().trim() === finalAlbumName.toLowerCase().trim()) {
          if (song.listeningEvents && song.listeningEvents.length > 0) {
            const lastEvent = song.listeningEvents[song.listeningEvents.length - 1];
            const lastEventTime = new Date(lastEvent.playedAt).getTime();
            if (lastEventTime > mostRecentPlayTimeForAlbum) {
              mostRecentPlayTimeForAlbum = lastEventTime;
              representativeSongForAlbum = song;
            }
          }
        }
      }
      
      // If we didn't find a match, use the most recently played song overall
      if (representativeSongForAlbum === representativeSong) {
        let mostRecentPlayTimeOverall = 0;
        for (const song of validSongs) {
          if (song.listeningEvents && song.listeningEvents.length > 0) {
            const lastEvent = song.listeningEvents[song.listeningEvents.length - 1];
            const lastEventTime = new Date(lastEvent.playedAt).getTime();
            if (lastEventTime > mostRecentPlayTimeOverall) {
              mostRecentPlayTimeOverall = lastEventTime;
              representativeSongForAlbum = song;
            }
          }
        }
      }
      
      // Fallback to first song if no events found
      if (!representativeSongForAlbum) {
        representativeSongForAlbum = validSongs[0] || representativeSong;
      }

      return {
        rank: 0,
        duration_ms: totalListeningTime,
        count: totalPlayCount,
        count_30_days_ago: totalPlayCount30DaysAgo,
        differents: validSongs.length,
        primaryAlbumId: representativeSongForAlbum.songId || validSongs[0]?.songId || '',
        total_count: totalPlayCount,
        total_duration_ms: totalListeningTime,
        album: {
          name: finalAlbumName.trim(),
          album_type: 'album',
          artists: albumArtists.length > 0 ? albumArtists : [representativeSong.artists[0] || representativeSong.artist.name || 'Unknown Artist'],
          release_date: '',
          release_date_precision: 'day',
          popularity: 0,
          images: representativeSongForAlbum.album.images,
          external_urls: {},
          genres: representativeSong.artist.genres
        },
        consolidated_count: totalPlayCount,
        original_albumIds: validSongs.map(song => song.album.id).filter(id => id !== ''),
        total_songs: validSongs.length,
        played_songs: playedSongs,
        unplayed_songs: validSongs.length - playedSongs,
        songs: albumSongs.sort((a, b) => b.play_count - a.play_count),
        earliest_played_at: earliestPlayedAt,
        yearly_play_time: yearlyPlayTime.length > 0 ? yearlyPlayTime : undefined
      };
    });

    albumsWithSongs.sort((a, b) => b.count - a.count);
    const originalCount = albumsWithSongs.length;
    const consolidatedAlbums = this.consolidator.consolidateAlbumsWithSongs(albumsWithSongs);
    
    // Update consolidated albums to use the most recently played album's metadata
    // Create a map of primaryAlbumId -> AlbumWithSongs for lookup
    const primaryAlbumIdToAlbum = new Map<string, AlbumWithSongs>();
    albumsWithSongs.forEach(album => {
      primaryAlbumIdToAlbum.set(album.primaryAlbumId, album);
    });
    
    // Create a map of songId -> CompleteSong for finding most recent play time
    const songIdToCompleteSong = new Map<string, CompleteSong>();
    history.songs.forEach(song => {
      songIdToCompleteSong.set(song.songId, song);
    });
    
    const updatedConsolidatedAlbums = consolidatedAlbums.map(consolidatedAlbum => {
      // Find the most recently played album from all original_albumIds
      let mostRecentAlbum: AlbumWithSongs | null = null;
      let mostRecentPlayTime = 0;
      
      // Check all original album IDs (including the primaryAlbumId)
      const allAlbumIds = [consolidatedAlbum.primaryAlbumId, ...(consolidatedAlbum.original_albumIds || [])];
      for (const albumId of allAlbumIds) {
        // primaryAlbumId is actually a songId, so we can use it directly
        const originalAlbum = primaryAlbumIdToAlbum.get(albumId);
        if (originalAlbum) {
          // Find the most recent play time from all songs in this album
          let albumMostRecentTime = 0;
          for (const albumSong of originalAlbum.songs) {
            const completeSong = songIdToCompleteSong.get(albumSong.songId);
            if (completeSong && completeSong.listeningEvents && completeSong.listeningEvents.length > 0) {
              const lastEvent = completeSong.listeningEvents[completeSong.listeningEvents.length - 1];
              const lastEventTime = new Date(lastEvent.playedAt).getTime();
              if (lastEventTime > albumMostRecentTime) {
                albumMostRecentTime = lastEventTime;
              }
            }
          }
          
          if (albumMostRecentTime > mostRecentPlayTime) {
            mostRecentPlayTime = albumMostRecentTime;
            mostRecentAlbum = originalAlbum;
          }
        }
      }
      
      // If we found a more recent album, update the metadata
      if (mostRecentAlbum !== null && mostRecentAlbum.primaryAlbumId !== consolidatedAlbum.primaryAlbumId) {
        const firstArtist = consolidatedAlbum.album.artists[0] || mostRecentAlbum.album.artists[0] || 'Unknown Artist';
        let albumName = mostRecentAlbum.album.name;
        
        // Apply base name rule if it exists (to ensure we use the canonical name, not a variation)
        const baseName = this.consolidator.getBaseAlbumNameForGrouping(albumName, firstArtist) ||
                        this.consolidator.getBaseAlbumNameForGrouping(
                          this.consolidator.normalizeAlbumNameForGrouping(albumName, firstArtist), 
                          firstArtist
                        );
        if (baseName) {
          albumName = baseName;
        }
        
        // Prefer older release_date when updating with most recent album metadata
        let finalReleaseDate = consolidatedAlbum.album.release_date;
        const mostRecentReleaseDate = mostRecentAlbum.album.release_date;
        
        if (mostRecentReleaseDate && mostRecentReleaseDate !== '') {
          if (finalReleaseDate && finalReleaseDate !== '') {
            // Compare dates: prefer the older one
            const consolidatedDate = new Date(finalReleaseDate).getTime();
            const mostRecentDate = new Date(mostRecentReleaseDate).getTime();
            if (!isNaN(consolidatedDate) && !isNaN(mostRecentDate)) {
              // Keep the older release_date
              if (consolidatedDate < mostRecentDate) {
                // Keep consolidated (older) date
                finalReleaseDate = consolidatedAlbum.album.release_date;
              } else {
                // Most recent date is older, use it
                finalReleaseDate = mostRecentReleaseDate;
              }
            } else {
              // If date parsing fails, prefer most recent
              finalReleaseDate = mostRecentReleaseDate || finalReleaseDate;
            }
          } else {
            // No consolidated date, use most recent
            finalReleaseDate = mostRecentReleaseDate;
          }
        }
        
        return {
          ...consolidatedAlbum,
          primaryAlbumId: mostRecentAlbum.primaryAlbumId,
          album: {
            ...consolidatedAlbum.album,
            name: albumName,
            images: mostRecentAlbum.album.images.length > 0 ? mostRecentAlbum.album.images : consolidatedAlbum.album.images,
            external_urls: Object.keys(mostRecentAlbum.album.external_urls).length > 0 ? mostRecentAlbum.album.external_urls : consolidatedAlbum.album.external_urls,
            release_date: finalReleaseDate,
            genres: mostRecentAlbum.album.genres || consolidatedAlbum.album.genres
          }
        };
      }
      
      return consolidatedAlbum;
    });
    
    // Calculate 30-days-ago rankings
    const albums30DaysAgo = updatedConsolidatedAlbums
      .map(album => ({
        ...album,
        count: album.count_30_days_ago || 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 500);
    
    // Create a map of album key -> rank for 30 days ago
    const rankMap30DaysAgo = new Map<string, number>();
    albums30DaysAgo.forEach((album, index) => {
      const albumKey = `${album.album.name.toLowerCase().trim()}|${(album.album.artists[0] || '').toLowerCase().trim()}`;
      rankMap30DaysAgo.set(albumKey, index + 1);
      // Also check by primaryAlbumId
      if (album.primaryAlbumId) {
        rankMap30DaysAgo.set(album.primaryAlbumId, index + 1);
      }
    });
    
    // Assign current ranks and add 30-days-ago ranks
    const rankedAlbums = updatedConsolidatedAlbums.slice(0, 500).map((album, index) => {
      const albumKey = `${album.album.name.toLowerCase().trim()}|${(album.album.artists[0] || '').toLowerCase().trim()}`;
      let rank30DaysAgo: number | undefined;
      
      if (rankMap30DaysAgo.has(albumKey)) {
        rank30DaysAgo = rankMap30DaysAgo.get(albumKey);
      } else if (album.primaryAlbumId && rankMap30DaysAgo.has(album.primaryAlbumId)) {
        rank30DaysAgo = rankMap30DaysAgo.get(album.primaryAlbumId);
      }
      
      return {
        ...album,
        rank: index + 1,
        rank_30_days_ago: rank30DaysAgo
      };
    });
    
    return { albums: rankedAlbums, originalCount };
  }

  /**
   * Initialize Spotify token manager
   */
  private async initializeSpotifyToken(): Promise<void> {
    if (!this.tokenManager) {
      try {
        this.tokenManager = new SpotifyTokenManager();
        const accessToken = await this.tokenManager.getValidAccessToken();
        const isValid = await this.tokenManager.testToken(accessToken);
        if (!isValid) {
          throw new Error('Invalid access token');
        }
        console.log('✅ Spotify token initialized');
      } catch (error) {
        console.log('ℹ️  Spotify tokens not available. Continuing without metadata enrichment.');
        console.log('   (This is optional - all cleaned files will still be generated successfully)');
        console.log('   To enable metadata enrichment, set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REFRESH_TOKEN.');
        this.tokenManager = null;
      }
    }
  }

  /**
   * Enrich cleaned songs with metadata from Spotify API
   */
  private async enrichSongsWithMetadata(songs: CleanedSong[], existingSongs: Map<string, CleanedSong>): Promise<CleanedSong[]> {
    if (!this.tokenManager) {
      console.log('ℹ️  Skipping song metadata enrichment (Spotify tokens not available)');
      return songs;
    }

    console.log('\n📥 Fetching song metadata from Spotify API...');
    
    const songsNeedingMetadata = songs.filter(song => {
      const existing = existingSongs.get(song.songId);
      // Copy images from existing if available
      this.copyImagesIfAvailable(song.album, existing?.album);
      // Check if we have all metadata (from existing or already in song)
      const hasAllMetadata = existing 
        ? (existing.song.preview_url && existing.song.external_urls && Object.keys(existing.song.external_urls).length > 0 && 
           existing.album.images && existing.album.images.length > 0)
        : (song.song.preview_url && song.song.external_urls && Object.keys(song.song.external_urls).length > 0 && 
           song.album.images && song.album.images.length > 0);
      return !hasAllMetadata;
    });

    if (songsNeedingMetadata.length === 0) {
      console.log('✅ All songs already have metadata, skipping API calls');
      return songs;
    }

    const accessToken = await this.tokenManager.getValidAccessToken();
    const songIds = songsNeedingMetadata.map(song => song.songId).filter(id => id);
    const uniqueSongIds = Array.from(new Set(songIds));

    console.log(`   Fetching ${uniqueSongIds.length} unique tracks (${songs.length - uniqueSongIds.length} already have metadata)...`);
    const tracks = await this.spotifyApiClient.fetchTracks(accessToken, uniqueSongIds);
    console.log(`✅ Fetched ${tracks.length} tracks`);

    const trackMap = new Map<string, SpotifyTrack>();
    tracks.forEach(track => trackMap.set(track.id, track));

    let enrichedCount = 0;
    songs.forEach(song => {
      const existing = existingSongs.get(song.songId);
      
      // Copy all metadata from existing if available
      if (existing) {
        this.copyImagesIfAvailable(song.album, existing.album);
        if (existing.song.preview_url) {
          song.song.preview_url = existing.song.preview_url;
        }
        if (existing.song.external_urls && Object.keys(existing.song.external_urls).length > 0) {
          song.song.external_urls = existing.song.external_urls;
        }
      }

      const track = trackMap.get(song.songId);
      if (track) {
        song.song.preview_url = track.preview_url;
        song.song.external_urls = track.external_urls;
        if (!song.album.images || song.album.images.length === 0) {
          song.album.images = track.album.images;
        }
        enrichedCount++;
      }
    });

    console.log(`✅ Enriched ${enrichedCount} songs with metadata`);
    return songs;
  }

  /**
   * Enrich cleaned albums with metadata from Spotify API
   */
  private async enrichAlbumsWithMetadata(albums: CleanedAlbum[], existingAlbums: Map<string, CleanedAlbum>): Promise<CleanedAlbum[]> {
    if (!this.tokenManager) {
      console.log('ℹ️  Skipping album metadata enrichment (Spotify tokens not available)');
      return albums;
    }

    console.log('\n📥 Fetching album metadata from Spotify API...');
    
    const albumsNeedingMetadata = albums.filter(album => {
      const nameKey = `${album.album.name.toLowerCase().trim()}|${(album.album.artists[0] || '').toLowerCase().trim()}`;
      let existing = existingAlbums.get(nameKey);
      if (!existing && album.primaryAlbumId) {
        existing = existingAlbums.get(album.primaryAlbumId);
      }
      // Copy images from existing if available
      this.copyImagesIfAvailable(album.album, existing?.album);
      // Check if we have all metadata (from existing or already in album)
      // IMPORTANT: Always require release_date to be non-empty
      const hasAllMetadata = existing
        ? (existing.album.images && existing.album.images.length > 0 &&
           existing.album.external_urls && Object.keys(existing.album.external_urls).length > 0 &&
           existing.album.release_date && existing.album.release_date !== '')
        : (album.album.images && album.album.images.length > 0 &&
           album.album.external_urls && Object.keys(album.album.external_urls).length > 0 &&
           album.album.release_date && album.album.release_date !== '');
      // Always include albums missing release_date, even if they have other metadata
      const needsReleaseDate = !album.album.release_date || album.album.release_date === '';
      return !hasAllMetadata || needsReleaseDate;
    });

    if (albumsNeedingMetadata.length === 0) {
      console.log('✅ All albums already have metadata, skipping API calls');
      return albums;
    }

    const accessToken = await this.tokenManager.getValidAccessToken();
    const songIds = albumsNeedingMetadata.map(album => album.primaryAlbumId).filter(id => id);
    const uniqueSongIds = Array.from(new Set(songIds));

    console.log(`   Fetching ${uniqueSongIds.length} unique tracks to get album IDs (${albums.length - uniqueSongIds.length} already have metadata)...`);
    const tracks = await this.spotifyApiClient.fetchTracks(accessToken, uniqueSongIds);
    console.log(`✅ Fetched ${tracks.length} tracks`);

    const albumIds = new Set<string>();
    const songIdToAlbumId = new Map<string, string>();
    tracks.forEach(track => {
      if (track.album && track.album.id) {
        albumIds.add(track.album.id);
        songIdToAlbumId.set(track.id, track.album.id);
      }
    });

    console.log(`   Found ${albumIds.size} unique album IDs`);
    const albumsMap = await this.spotifyApiClient.fetchAlbums(accessToken, Array.from(albumIds));
    console.log(`✅ Fetched ${albumsMap.size} albums`);

    const trackMap = new Map<string, SpotifyTrack>();
    tracks.forEach(track => trackMap.set(track.id, track));

    let enrichedCount = 0;
    albums.forEach(album => {
      const nameKey = `${album.album.name.toLowerCase().trim()}|${(album.album.artists[0] || '').toLowerCase().trim()}`;
      let existing = existingAlbums.get(nameKey);
      if (!existing && album.primaryAlbumId) {
        existing = existingAlbums.get(album.primaryAlbumId);
      }
      
      // Copy all metadata from existing if available
      if (existing) {
        this.copyImagesIfAvailable(album.album, existing.album);
        if (existing.album.external_urls && Object.keys(existing.album.external_urls).length > 0) {
          album.album.external_urls = existing.album.external_urls;
        }
        // Copy release_date from existing if it's valid (we'll prefer older dates later)
        if (existing.album.release_date && existing.album.release_date !== '') {
          album.album.release_date = existing.album.release_date;
          if (existing.album.release_date_precision) {
            album.album.release_date_precision = existing.album.release_date_precision;
          }
        }
      }
      
      // Store existing release_date for comparison (to preserve oldest date)
      const existingReleaseDate = album.album.release_date;

      const track = trackMap.get(album.primaryAlbumId);
      const albumId = songIdToAlbumId.get(album.primaryAlbumId);
      const spotifyAlbum = albumId ? albumsMap.get(albumId) : null;

      if (track || spotifyAlbum) {
        if (albumId) {
          album.primaryAlbumId = albumId;
        }

        if (spotifyAlbum) {
          let albumName = spotifyAlbum.name;
          const firstArtist = spotifyAlbum.artists[0]?.name || album.album.artists[0] || 'Unknown Artist';
          
          // Apply base name rule if it exists (to ensure we use the canonical name, not a variation)
          const baseName = this.consolidator.getBaseAlbumNameForGrouping(albumName, firstArtist) ||
                          this.consolidator.getBaseAlbumNameForGrouping(
                            this.consolidator.normalizeAlbumNameForGrouping(albumName, firstArtist), 
                            firstArtist
                          );
          if (baseName) {
            albumName = baseName;
          }
          
          album.album.name = albumName;
          album.album.artists = spotifyAlbum.artists.map(a => a.name);
          album.album.album_type = spotifyAlbum.album_type;
          // Prefer older release_date (preserve original release dates over deluxe/anniversary editions)
          if (spotifyAlbum.release_date && spotifyAlbum.release_date !== '') {
            if (existingReleaseDate && existingReleaseDate !== '') {
              // Compare dates: prefer the older one
              const existingDate = new Date(existingReleaseDate).getTime();
              const spotifyDate = new Date(spotifyAlbum.release_date).getTime();
              if (!isNaN(existingDate) && !isNaN(spotifyDate)) {
                // Keep the older release_date
                if (existingDate < spotifyDate) {
                  // Keep existing (older) date - already set from existing
                } else {
                  // Spotify date is older, use it
                  album.album.release_date = spotifyAlbum.release_date;
                  album.album.release_date_precision = spotifyAlbum.release_date_precision;
                }
              } else {
                // If date parsing fails, use Spotify's date
                album.album.release_date = spotifyAlbum.release_date;
                album.album.release_date_precision = spotifyAlbum.release_date_precision;
              }
            } else {
              // No existing date, use Spotify's
              album.album.release_date = spotifyAlbum.release_date;
              album.album.release_date_precision = spotifyAlbum.release_date_precision;
            }
          }
          album.album.popularity = spotifyAlbum.popularity;
          if (!album.album.images || album.album.images.length === 0) {
            album.album.images = spotifyAlbum.images;
          }
          album.album.external_urls = spotifyAlbum.external_urls;
          album.album.genres = spotifyAlbum.genres;
        } else if (track) {
          let albumName = track.album.name;
          const firstArtist = track.album.artists[0]?.name || album.album.artists[0] || 'Unknown Artist';
          
          // Apply base name rule if it exists (to ensure we use the canonical name, not a variation)
          const baseName = this.consolidator.getBaseAlbumNameForGrouping(albumName, firstArtist) ||
                          this.consolidator.getBaseAlbumNameForGrouping(
                            this.consolidator.normalizeAlbumNameForGrouping(albumName, firstArtist), 
                            firstArtist
                          );
          if (baseName) {
            albumName = baseName;
          }
          
          album.album.name = albumName;
          album.album.artists = track.album.artists.map(a => a.name);
          album.album.album_type = track.album.album_type;
          // Prefer older release_date (preserve original release dates over deluxe/anniversary editions)
          if (track.album.release_date && track.album.release_date !== '') {
            if (existingReleaseDate && existingReleaseDate !== '') {
              // Compare dates: prefer the older one
              const existingDate = new Date(existingReleaseDate).getTime();
              const trackDate = new Date(track.album.release_date).getTime();
              if (!isNaN(existingDate) && !isNaN(trackDate)) {
                // Keep the older release_date
                if (existingDate < trackDate) {
                  // Keep existing (older) date - already set from existing
                } else {
                  // Track date is older, use it
                  album.album.release_date = track.album.release_date;
                  album.album.release_date_precision = track.album.release_date_precision;
                }
              } else {
                // If date parsing fails, use track's date
                album.album.release_date = track.album.release_date;
                album.album.release_date_precision = track.album.release_date_precision;
              }
            } else {
              // No existing date, use track's
              album.album.release_date = track.album.release_date;
              album.album.release_date_precision = track.album.release_date_precision;
            }
          }
          if (!album.album.images || album.album.images.length === 0) {
            album.album.images = track.album.images;
          }
          album.album.external_urls = track.album.external_urls;
        }

        if (albumId) {
          album.original_albumIds = [albumId];
        }

        enrichedCount++;
      } else {
        // Even if API call failed, try to get release_date from existing if we don't have it
        if ((!album.album.release_date || album.album.release_date === '') && existing) {
          if (existing.album.release_date && existing.album.release_date !== '') {
            album.album.release_date = existing.album.release_date;
            if (existing.album.release_date_precision) {
              album.album.release_date_precision = existing.album.release_date_precision;
            }
          }
        }
      }
    });

    // Check for albums still missing release_date
    const albumsMissingReleaseDate = albums.filter(album => 
      !album.album.release_date || album.album.release_date === ''
    );
    
    if (albumsMissingReleaseDate.length > 0) {
      console.log(`⚠️  ${albumsMissingReleaseDate.length} albums still missing release_date after enrichment`);
      // Log first few examples for debugging
      albumsMissingReleaseDate.slice(0, 5).forEach(album => {
        console.log(`   - "${album.album.name}" by ${album.album.artists[0] || 'Unknown'} (ID: ${album.primaryAlbumId})`);
      });
    }
    
    console.log(`✅ Enriched ${enrichedCount} albums with metadata`);
    return albums;
  }

  /**
   * Enrich albums with songs with metadata from Spotify API
   */
  private async enrichAlbumsWithSongsMetadata(albums: AlbumWithSongs[], existingAlbums: Map<string, AlbumWithSongs>): Promise<AlbumWithSongs[]> {
    if (!this.tokenManager) {
      console.log('ℹ️  Skipping albums with songs metadata enrichment (Spotify tokens not available)');
      return albums;
    }

    const existingCleanedAlbums = new Map<string, CleanedAlbum>();
    existingAlbums.forEach((album, key) => {
      existingCleanedAlbums.set(key, {
        rank: album.rank,
        duration_ms: album.duration_ms,
        count: album.count,
        differents: album.differents,
        primaryAlbumId: album.primaryAlbumId,
        total_count: album.total_count,
        total_duration_ms: album.total_duration_ms,
        album: album.album,
        consolidated_count: album.consolidated_count,
        original_albumIds: album.original_albumIds
      });
    });

    const cleanedAlbums: CleanedAlbum[] = albums.map(album => ({
      rank: album.rank,
      duration_ms: album.duration_ms,
      count: album.count,
      differents: album.differents,
      primaryAlbumId: album.primaryAlbumId,
      total_count: album.total_count,
      total_duration_ms: album.total_duration_ms,
      album: album.album,
      consolidated_count: album.consolidated_count,
      original_albumIds: album.original_albumIds
    }));

    const enrichedAlbums = await this.enrichAlbumsWithMetadata(cleanedAlbums, existingCleanedAlbums);

    const enrichedMap = new Map<string, CleanedAlbum>();
    cleanedAlbums.forEach((original, index) => {
      const originalSongId = original.primaryAlbumId;
      if (enrichedAlbums[index]) {
        enrichedMap.set(originalSongId, enrichedAlbums[index]);
      }
    });

    const albumsWithEnrichedMetadata = albums.map(album => {
      const enriched = enrichedMap.get(album.primaryAlbumId);
      if (enriched) {
        return {
          ...album,
          primaryAlbumId: enriched.primaryAlbumId,
          album: enriched.album,
          original_albumIds: enriched.original_albumIds
        };
      }
      return album;
    });

    return await this.enrichAndConsolidateAlbumSongs(albumsWithEnrichedMetadata, existingAlbums);
  }

  /**
   * Enrich songs within albums with track numbers and consolidate duplicates.
   * Reuses track_number/disc_number (and related fields) from existing album songs to avoid re-fetching.
   */
  private async enrichAndConsolidateAlbumSongs(albums: AlbumWithSongs[], existingAlbums?: Map<string, AlbumWithSongs>): Promise<AlbumWithSongs[]> {
    if (!this.tokenManager) {
      return albums.map(album => ({
        ...album,
        songs: this.consolidator.consolidateSongsInAlbum(album.songs)
      }));
    }

    console.log('\n📥 Fetching track metadata for album songs...');

    // Build a cache of track metadata from existing albums so we don't re-fetch
    const trackMap = new Map<string, SpotifyTrack>();
    if (existingAlbums && existingAlbums.size > 0) {
      existingAlbums.forEach(album => {
        album.songs.forEach(song => {
          if (song.songId && typeof song.track_number === 'number' && typeof song.disc_number === 'number') {
            // Reuse as minimal SpotifyTrack-like shape for enrichment
            trackMap.set(song.songId, {
              id: song.songId,
              name: song.name,
              track_number: song.track_number,
              disc_number: song.disc_number,
              explicit: song.explicit,
              preview_url: song.preview_url,
              external_urls: song.external_urls as { spotify: string },
              artists: [],
              album: { id: '', name: '', album_type: '', images: [], release_date: '', release_date_precision: '', artists: [], external_urls: { spotify: '' } }
            });
          }
        });
      });
    }

    const allSongIds = new Set<string>();
    albums.forEach(album => {
      album.songs.forEach(song => {
        if (song.songId) {
          allSongIds.add(song.songId);
        }
      });
    });

    const uniqueSongIds = Array.from(allSongIds);
    const songIdsToFetch = uniqueSongIds.filter(id => !trackMap.has(id));
    const alreadyHad = uniqueSongIds.length - songIdsToFetch.length;

    if (songIdsToFetch.length === 0) {
      console.log(`✅ All ${uniqueSongIds.length} album songs already have track metadata from existing file, skipping API calls`);
    } else {
      console.log(`   Fetching ${songIdsToFetch.length} unique tracks for track numbers (${alreadyHad} already have metadata from existing file)...`);
    }

    if (songIdsToFetch.length > 0) {
      const accessToken = await this.tokenManager.getValidAccessToken();
      const batchSize = 50;
      for (let i = 0; i < songIdsToFetch.length; i += batchSize) {
        const batch = songIdsToFetch.slice(i, i + batchSize);
        const tracks = await this.spotifyApiClient.fetchTracks(accessToken, batch);
        tracks.forEach(track => trackMap.set(track.id, track));
        if (i + batchSize < songIdsToFetch.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
    console.log(`✅ Fetched ${trackMap.size} tracks total`);

    return albums.map(album => {
      const consolidatedSongs = this.consolidator.consolidateSongsInAlbum(album.songs);
      
      const enrichedSongs = consolidatedSongs.map(song => {
        const track = trackMap.get(song.songId);
        if (track) {
          return {
            ...song,
            track_number: track.track_number,
            disc_number: track.disc_number,
            explicit: track.explicit,
            preview_url: track.preview_url || song.preview_url,
            external_urls: track.external_urls || song.external_urls
          };
        }
        return song;
      });
      
      enrichedSongs.sort((a, b) => {
        if (a.disc_number !== b.disc_number) {
          return a.disc_number - b.disc_number;
        }
        if (a.track_number !== b.track_number) {
          return a.track_number - b.track_number;
        }
        return b.play_count - a.play_count;
      });

      const playedSongs = enrichedSongs.filter(song => song.play_count > 0).length;
      
      return {
        ...album,
        songs: enrichedSongs,
        total_songs: enrichedSongs.length,
        played_songs: playedSongs,
        unplayed_songs: enrichedSongs.length - playedSongs
      };
    });
  }

  /**
   * Enrich cleaned artists with metadata from Spotify API
   */
  private async enrichArtistsWithMetadata(artists: CleanedArtist[], existingArtists: Map<string, CleanedArtist>): Promise<CleanedArtist[]> {
    if (!this.tokenManager) {
      console.log('ℹ️  Skipping artist metadata enrichment (Spotify tokens not available)');
      return artists;
    }

    console.log('\n📥 Fetching artist metadata from Spotify API...');
    
    const artistsNeedingMetadata = artists.filter(artist => {
      const nameKey = artist.artist.name.toLowerCase().trim();
      let existing = existingArtists.get(nameKey);
      if (!existing && artist.primaryArtistId) {
        existing = existingArtists.get(artist.primaryArtistId);
      }
      // Copy images from existing if available
      this.copyImagesIfAvailable(artist.artist, existing?.artist);
      // Check if we have all metadata (from existing or already in artist)
      const hasAllMetadata = existing
        ? (existing.artist.images && existing.artist.images.length > 0 &&
           existing.artist.external_urls && Object.keys(existing.artist.external_urls).length > 0 &&
           existing.artist.popularity !== 0)
        : (artist.artist.images && artist.artist.images.length > 0 &&
           artist.artist.external_urls && Object.keys(artist.artist.external_urls).length > 0 &&
           artist.artist.popularity !== 0);
      return !hasAllMetadata;
    });

    if (artistsNeedingMetadata.length === 0) {
      console.log('✅ All artists already have metadata, skipping API calls');
      return artists;
    }

    const accessToken = await this.tokenManager.getValidAccessToken();
    const songIds = artistsNeedingMetadata.map(artist => artist.primaryArtistId).filter(id => id);
    const uniqueSongIds = Array.from(new Set(songIds));

    console.log(`   Fetching ${uniqueSongIds.length} unique tracks to get artist IDs (${artists.length - uniqueSongIds.length} already have metadata)...`);
    const tracks = await this.spotifyApiClient.fetchTracks(accessToken, uniqueSongIds);
    console.log(`✅ Fetched ${tracks.length} tracks`);

    const artistIds = new Set<string>();
    const songIdToArtistId = new Map<string, string>();
    tracks.forEach(track => {
      if (track.artists && track.artists.length > 0) {
        const artistId = track.artists[0].id;
        if (artistId) {
          artistIds.add(artistId);
          songIdToArtistId.set(track.id, artistId);
        }
      }
    });

    console.log(`   Found ${artistIds.size} unique artist IDs`);
    const artistsMap = await this.spotifyApiClient.fetchArtists(accessToken, Array.from(artistIds));
    console.log(`✅ Fetched ${artistsMap.size} artists`);

    let enrichedCount = 0;
    artists.forEach(artist => {
      const nameKey = artist.artist.name.toLowerCase().trim();
      let existing = existingArtists.get(nameKey);
      if (!existing && artist.primaryArtistId) {
        existing = existingArtists.get(artist.primaryArtistId);
      }
      
      // Copy all metadata from existing if available
      if (existing) {
        this.copyImagesIfAvailable(artist.artist, existing.artist);
        if (existing.artist.external_urls && Object.keys(existing.artist.external_urls).length > 0) {
          artist.artist.external_urls = existing.artist.external_urls;
        }
        if (existing.artist.popularity !== 0) {
          artist.artist.popularity = existing.artist.popularity;
        }
        if (existing.artist.followers && existing.artist.followers.total > 0) {
          artist.artist.followers = existing.artist.followers;
        }
        if (existing.artist.genres && existing.artist.genres.length > 0) {
          artist.artist.genres = existing.artist.genres;
        }
        // Copy top_songs and top_albums images from existing if available
        if (existing.top_songs && artist.top_songs) {
          existing.top_songs.forEach((existingSong, index) => {
            if (index < artist.top_songs!.length && 
                existingSong.songId === artist.top_songs![index].songId &&
                existingSong.album.images && existingSong.album.images.length > 0 &&
                (!artist.top_songs![index].album.images || artist.top_songs![index].album.images.length === 0)) {
              artist.top_songs![index].album.images = existingSong.album.images;
            }
          });
        }
        if (existing.top_albums && artist.top_albums) {
          existing.top_albums.forEach((existingAlbum, index) => {
            if (index < artist.top_albums!.length && 
                existingAlbum.primaryAlbumId === artist.top_albums![index].primaryAlbumId &&
                existingAlbum.images && existingAlbum.images.length > 0 &&
                (!artist.top_albums![index].images || artist.top_albums![index].images.length === 0)) {
              artist.top_albums![index].images = existingAlbum.images;
            }
          });
        }
      }

      const artistId = songIdToArtistId.get(artist.primaryArtistId);
      const spotifyArtist = artistId ? artistsMap.get(artistId) : null;

      if (spotifyArtist) {
        artist.primaryArtistId = artistId!;
        artist.original_artistIds = [artistId!];
        artist.artist.popularity = spotifyArtist.popularity;
        artist.artist.followers = spotifyArtist.followers;
        if (!artist.artist.images || artist.artist.images.length === 0) {
          artist.artist.images = spotifyArtist.images;
        }
        artist.artist.external_urls = spotifyArtist.external_urls;
        artist.artist.genres = spotifyArtist.genres;
        enrichedCount++;
      }
    });

    console.log(`✅ Enriched ${enrichedCount} artists with metadata`);
    return artists;
  }

  /**
   * Enrich top songs and albums for artists with album images from Spotify API
   */
  private async enrichArtistTopSongsAndAlbums(artists: CleanedArtist[], existingArtists: Map<string, CleanedArtist>): Promise<CleanedArtist[]> {
    if (!this.tokenManager) {
      console.log('ℹ️  Skipping artist top songs/albums enrichment (Spotify tokens not available)');
      return artists;
    }

    console.log('\n📥 Enriching artist top songs and albums with album images...');
    
    // First, copy images from existing artists if available
    artists.forEach(artist => {
      const nameKey = artist.artist.name.toLowerCase().trim();
      let existing = existingArtists.get(nameKey);
      if (!existing && artist.primaryArtistId) {
        existing = existingArtists.get(artist.primaryArtistId);
      }
      
      if (existing) {
        // Copy top_songs images from existing if available
        if (existing.top_songs && artist.top_songs) {
          existing.top_songs.forEach((existingSong, index) => {
            if (index < artist.top_songs!.length && 
                existingSong.songId === artist.top_songs![index].songId &&
                existingSong.album.images && existingSong.album.images.length > 0 &&
                (!artist.top_songs![index].album.images || artist.top_songs![index].album.images.length === 0)) {
              artist.top_songs![index].album.images = existingSong.album.images;
            }
          });
        }
        // Copy top_albums images from existing if available
        if (existing.top_albums && artist.top_albums) {
          existing.top_albums.forEach((existingAlbum, index) => {
            if (index < artist.top_albums!.length && 
                existingAlbum.primaryAlbumId === artist.top_albums![index].primaryAlbumId &&
                existingAlbum.images && existingAlbum.images.length > 0 &&
                (!artist.top_albums![index].images || artist.top_albums![index].images.length === 0)) {
              artist.top_albums![index].images = existingAlbum.images;
            }
          });
        }
      }
    });
    
    // Collect all song IDs from top_songs and album IDs (which might be song IDs) from top_albums
    const songIdsToFetch = new Set<string>();
    
    artists.forEach(artist => {
      if (artist.top_songs) {
        artist.top_songs.forEach(song => {
          // Only fetch if images are still missing after copying from existing
          if (!song.album.images || song.album.images.length === 0) {
            songIdsToFetch.add(song.songId);
          }
        });
      }
      if (artist.top_albums) {
        artist.top_albums.forEach(album => {
          // Only fetch if images are still missing after copying from existing
          if (!album.images || album.images.length === 0) {
            // primaryAlbumId might be a song ID, so we'll fetch it as a track first
            songIdsToFetch.add(album.primaryAlbumId);
          }
        });
      }
    });

    if (songIdsToFetch.size === 0) {
      console.log('✅ All top songs and albums already have images, skipping API calls');
      return artists;
    }

    const accessToken = await this.tokenManager.getValidAccessToken();
    const uniqueSongIds = Array.from(songIdsToFetch);
    
    console.log(`   Fetching ${uniqueSongIds.length} tracks to get album images...`);
    
    // Fetch tracks in batches
    const trackMap = new Map<string, SpotifyTrack>();
    const batchSize = 50;
    for (let i = 0; i < uniqueSongIds.length; i += batchSize) {
      const batch = uniqueSongIds.slice(i, i + batchSize);
      const tracks = await this.spotifyApiClient.fetchTracks(accessToken, batch);
      tracks.forEach(track => trackMap.set(track.id, track));
      
      if (i + batchSize < uniqueSongIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`✅ Fetched ${trackMap.size} tracks`);

    // Collect album IDs from tracks for top_albums
    const albumIdSet = new Set<string>();
    const songIdToAlbumId = new Map<string, string>();
    trackMap.forEach(track => {
      if (track.album && track.album.id) {
        albumIdSet.add(track.album.id);
        songIdToAlbumId.set(track.id, track.album.id);
      }
    });

    // Fetch albums if we have album IDs
    const albumsMap = new Map<string, SpotifyAlbum>();
    if (albumIdSet.size > 0) {
      console.log(`   Fetching ${albumIdSet.size} albums...`);
      const fetchedAlbums = await this.spotifyApiClient.fetchAlbums(accessToken, Array.from(albumIdSet));
      fetchedAlbums.forEach((album, id) => albumsMap.set(id, album));
      console.log(`✅ Fetched ${albumsMap.size} albums`);
    }

    // Update artists with enriched images
    let enrichedSongsCount = 0;
    let enrichedAlbumsCount = 0;
    
    artists.forEach(artist => {
      // Enrich top_songs
      if (artist.top_songs) {
        artist.top_songs.forEach(song => {
          if (!song.album.images || song.album.images.length === 0) {
            const track = trackMap.get(song.songId);
            if (track && track.album && track.album.images && track.album.images.length > 0) {
              song.album.images = track.album.images;
              enrichedSongsCount++;
            }
          }
        });
      }

      // Enrich top_albums
      if (artist.top_albums) {
        artist.top_albums.forEach(album => {
          if (!album.images || album.images.length === 0) {
            // Try to get album ID from the track first
            const track = trackMap.get(album.primaryAlbumId);
            let albumId: string | undefined;
            
            if (track && track.album && track.album.id) {
              albumId = track.album.id;
            } else {
              // primaryAlbumId might already be an album ID
              albumId = album.primaryAlbumId;
            }

            // Try to get images from album first, then from track
            if (albumId) {
              const spotifyAlbum = albumsMap.get(albumId);
              if (spotifyAlbum && spotifyAlbum.images && spotifyAlbum.images.length > 0) {
                album.images = spotifyAlbum.images;
                enrichedAlbumsCount++;
              } else if (track && track.album && track.album.images && track.album.images.length > 0) {
                album.images = track.album.images;
                enrichedAlbumsCount++;
              }
            } else if (track && track.album && track.album.images && track.album.images.length > 0) {
              album.images = track.album.images;
              enrichedAlbumsCount++;
            }
          }
        });
      }
    });

    console.log(`✅ Enriched ${enrichedSongsCount} top songs with album images`);
    console.log(`✅ Enriched ${enrichedAlbumsCount} top albums with images`);
    return artists;
  }

  /**
   * Calculate detailed statistics from listening history
   */
  private calculateDetailedStats(history: CompleteListeningHistory): DetailedStats {
    console.log('📊 Calculating detailed statistics...');
    
    // Maps to track yearly data
    const yearlyMap = new Map<string, { totalMs: number; playCount: number }>();
    const yearlySongsMap = new Map<string, Map<string, { playCount: number; totalMs: number; name: string; artist: string; images: Array<{ height: number; url: string; width: number }> }>>();
    const yearlyArtistsMap = new Map<string, Map<string, { playCount: number; totalMs: number; uniqueSongs: Set<string>; images: Array<{ height: number; url: string; width: number }>; representativeSongId: string | null }>>();
    const yearlyAlbumsMap = new Map<string, Map<string, { playCount: number; totalMs: number; albumName: string; artist: string; uniqueSongs: Set<string>; images: Array<{ height: number; url: string; width: number }> }>>();
    
    // Array to track hourly listening distribution (0-23 hours)
    const hourlyMap = new Map<number, { totalMs: number; playCount: number }>();
    // Initialize all 24 hours
    for (let hour = 0; hour < 24; hour++) {
      hourlyMap.set(hour, { totalMs: 0, playCount: 0 });
    }
    
    // Map to track country listening data
    const countryMap = new Map<string, {
      totalMs: number;
      playCount: number;
      firstPlayedAt: string | null;
      lastPlayedAt: string | null;
    }>();
    
    history.songs.forEach(song => {
      song.listeningEvents.forEach(event => {
        const eventDate = new Date(event.playedAt);
        const year = eventDate.getFullYear().toString();
        const hour = eventDate.getHours();
        
        // Update hourly totals
        const hourData = hourlyMap.get(hour)!;
        hourData.totalMs += event.msPlayed;
        hourData.playCount += 1;
        
        // Update country totals if conn_country is available
        if (event.conn_country) {
          const countryCode = event.conn_country;
          if (!countryMap.has(countryCode)) {
            countryMap.set(countryCode, {
              totalMs: 0,
              playCount: 0,
              firstPlayedAt: null,
              lastPlayedAt: null
            });
          }
          const countryData = countryMap.get(countryCode)!;
          countryData.totalMs += event.msPlayed;
          countryData.playCount += 1;
          
          // Track first and last played dates
          if (!countryData.firstPlayedAt || event.playedAt < countryData.firstPlayedAt) {
            countryData.firstPlayedAt = event.playedAt;
          }
          if (!countryData.lastPlayedAt || event.playedAt > countryData.lastPlayedAt) {
            countryData.lastPlayedAt = event.playedAt;
          }
        }
        
        // Update yearly totals
        if (!yearlyMap.has(year)) {
          yearlyMap.set(year, { totalMs: 0, playCount: 0 });
        }
        const yearData = yearlyMap.get(year)!;
        yearData.totalMs += event.msPlayed;
        yearData.playCount += 1;
        
        // Track songs per year
        if (!yearlySongsMap.has(year)) {
          yearlySongsMap.set(year, new Map());
        }
        const yearSongsMap = yearlySongsMap.get(year)!;
        if (!yearSongsMap.has(song.songId)) {
          yearSongsMap.set(song.songId, {
            playCount: 0,
            totalMs: 0,
            name: song.name,
            artist: song.artist.name || song.artists[0] || 'Unknown Artist',
            images: song.album.images || []
          });
        }
        const songData = yearSongsMap.get(song.songId)!;
        songData.playCount += 1;
        songData.totalMs += event.msPlayed;
        // Update images if we get better ones (non-empty images)
        if (song.album.images && song.album.images.length > 0 && (!songData.images || songData.images.length === 0)) {
          songData.images = song.album.images;
        }
        
        // Track artists per year
        if (!yearlyArtistsMap.has(year)) {
          yearlyArtistsMap.set(year, new Map());
        }
        const yearArtistsMap = yearlyArtistsMap.get(year)!;
        const artistName = song.artist.name || song.artists[0] || 'Unknown Artist';
        if (!yearArtistsMap.has(artistName)) {
          yearArtistsMap.set(artistName, {
            playCount: 0,
            totalMs: 0,
            uniqueSongs: new Set(),
            images: [],
            representativeSongId: null
          });
        }
        const artistData = yearArtistsMap.get(artistName)!;
        artistData.playCount += 1;
        artistData.totalMs += event.msPlayed;
        artistData.uniqueSongs.add(song.songId);
        // Store a representative song ID for later artist lookup
        if (!artistData.representativeSongId && song.songId) {
          artistData.representativeSongId = song.songId;
        }
        // Use album images from the artist's songs (prefer images with higher resolution)
        if (song.album.images && song.album.images.length > 0) {
          // If we don't have images yet, or if this song's album has better images, update
          if (artistData.images.length === 0) {
            artistData.images = song.album.images;
          } else {
            // Prefer images with higher resolution (larger height)
            const currentMaxHeight = Math.max(...artistData.images.map(img => img.height));
            const newMaxHeight = Math.max(...song.album.images.map(img => img.height));
            if (newMaxHeight > currentMaxHeight) {
              artistData.images = song.album.images;
            }
          }
        }
        
        // Track albums per year
        if (!yearlyAlbumsMap.has(year)) {
          yearlyAlbumsMap.set(year, new Map());
        }
        const yearAlbumsMap = yearlyAlbumsMap.get(year)!;
        const albumName = song.album.name || 'Unknown Album';
        const albumArtist = song.artist.name || song.artists[0] || 'Unknown Artist';
        const albumKey = `${albumName}|${albumArtist}`;
        if (!yearAlbumsMap.has(albumKey)) {
          yearAlbumsMap.set(albumKey, {
            playCount: 0,
            totalMs: 0,
            albumName: albumName,
            artist: albumArtist,
            uniqueSongs: new Set(),
            images: song.album.images || []
          });
        }
        const albumData = yearAlbumsMap.get(albumKey)!;
        albumData.playCount += 1;
        albumData.totalMs += event.msPlayed;
        albumData.uniqueSongs.add(song.songId);
        // Update images if we get better ones (non-empty images)
        if (song.album.images && song.album.images.length > 0 && (!albumData.images || albumData.images.length === 0)) {
          albumData.images = song.album.images;
        } else if (song.album.images && song.album.images.length > 0) {
          // Prefer images with higher resolution (larger height)
          const currentMaxHeight = Math.max(...albumData.images.map(img => img.height));
          const newMaxHeight = Math.max(...song.album.images.map(img => img.height));
          if (newMaxHeight > currentMaxHeight) {
            albumData.images = song.album.images;
          }
        }
      });
    });
    
    // Convert to array and sort by year
    const yearlyListeningTime: YearlyListeningTime[] = Array.from(yearlyMap.entries())
      .map(([year, data]) => ({
        year,
        totalListeningTimeMs: data.totalMs,
        totalListeningHours: Math.round((data.totalMs / (1000 * 60 * 60)) * 100) / 100,
        playCount: data.playCount
      }))
      .sort((a, b) => a.year.localeCompare(b.year));
    
    // Calculate top songs, artists, and albums per year
    const yearlyTopItems: YearlyTopItems[] = Array.from(yearlySongsMap.keys())
      .sort()
      .map(year => {
        // Get top 5 songs for this year
        const songsMap = yearlySongsMap.get(year)!;
        const topSongs: TopSong[] = Array.from(songsMap.entries())
          .map(([songId, data]) => ({
            songId,
            name: data.name,
            artist: data.artist,
            playCount: data.playCount,
            totalListeningTimeMs: data.totalMs,
            images: data.images || []
          }))
          .sort((a, b) => b.playCount - a.playCount)
          .slice(0, 5);
        
        // Get top 5 artists for this year
        const artistsMap = yearlyArtistsMap.get(year)!;
        const topArtists: TopArtist[] = Array.from(artistsMap.entries())
          .map(([artistName, data]) => ({
            artistName,
            playCount: data.playCount,
            totalListeningTimeMs: data.totalMs,
            uniqueSongs: data.uniqueSongs.size,
            images: data.images || []
          }))
          .sort((a, b) => b.playCount - a.playCount)
          .slice(0, 5);
        
        // Get top 5 albums for this year
        const albumsMap = yearlyAlbumsMap.get(year)!;
        const topAlbums: TopAlbum[] = Array.from(albumsMap.entries())
          .map(([albumKey, data]) => ({
            albumName: data.albumName,
            artist: data.artist,
            playCount: data.playCount,
            totalListeningTimeMs: data.totalMs,
            uniqueSongs: data.uniqueSongs.size,
            images: data.images || []
          }))
          .sort((a, b) => b.playCount - a.playCount)
          .slice(0, 5);
        
        return {
          year,
          topSongs,
          topArtists,
          topAlbums
        };
      });
    
    // Calculate totals
    const totalListeningTimeMs = yearlyListeningTime.reduce((sum, year) => sum + year.totalListeningTimeMs, 0);
    const totalListeningHours = Math.round((totalListeningTimeMs / (1000 * 60 * 60)) * 100) / 100;
    const totalListeningDays = Math.round((totalListeningHours / 24) * 100) / 100;
    
    // Calculate total listening events (use metadata if available, otherwise count from events)
    const totalListeningEvents = history.metadata?.totalListeningEvents ?? 
      history.songs.reduce((sum, song) => sum + (song.listeningEvents?.length || 0), 0);
    
    // Convert hourly map to array sorted by hour (0-23)
    const hourlyListeningDistribution: HourlyListeningDistribution[] = Array.from(hourlyMap.entries())
      .map(([hour, data]) => ({
        hour,
        totalListeningTimeMs: data.totalMs,
        totalListeningHours: Math.round((data.totalMs / (1000 * 60 * 60)) * 100) / 100,
        playCount: data.playCount
      }))
      .sort((a, b) => a.hour - b.hour);
    
    // Convert country map to array and sort by totalMs (descending)
    const countryListeningData: CountryListeningData[] = Array.from(countryMap.entries())
      .map(([countryCode, data]) => ({
        countryCode,
        totalMsPlayed: data.totalMs,
        totalHours: Math.round((data.totalMs / (1000 * 60 * 60)) * 100) / 100,
        playCount: data.playCount,
        firstPlayedAt: data.firstPlayedAt || '',
        lastPlayedAt: data.lastPlayedAt || ''
      }))
      .sort((a, b) => b.totalMsPlayed - a.totalMsPlayed);
    
    return {
      yearlyListeningTime,
      yearlyTopItems,
      totalListeningHours,
      totalListeningDays,
      totalListeningEvents,
      hourlyListeningDistribution,
      countryListeningData
    };
  }

  /**
   * Enrich detailed stats with actual artist images from Spotify API
   */
  private async enrichDetailedStatsWithArtistImages(
    detailedStats: DetailedStats,
    existingArtists: Map<string, CleanedArtist>,
    history: CompleteListeningHistory
  ): Promise<DetailedStats> {
    if (!this.tokenManager) {
      console.log('ℹ️  Skipping artist image enrichment for detailed stats (Spotify tokens not available)');
      return detailedStats;
    }

    console.log('\n📥 Enriching detailed stats with artist images from Spotify API...');
    
    // Collect all unique artist names from yearly top items
    const artistNameToYearlyData = new Map<string, { year: string; artist: TopArtist }>();
    detailedStats.yearlyTopItems.forEach(yearData => {
      yearData.topArtists.forEach(artist => {
        const key = artist.artistName.toLowerCase().trim();
        if (!artistNameToYearlyData.has(key)) {
          artistNameToYearlyData.set(key, { year: yearData.year, artist });
        }
      });
    });

    // First, try to match with existing cleaned artists
    const artistNameToImages = new Map<string, Array<{ height: number; url: string; width: number }>>();
    const artistsNeedingLookup = new Map<string, { year: string; artist: TopArtist; representativeSongId?: string }>();

    artistNameToYearlyData.forEach((data, artistNameKey) => {
      // Try to find in existing cleaned artists
      let found = existingArtists.get(artistNameKey);
      if (!found) {
        // Try exact match
        for (const [key, artist] of existingArtists.entries()) {
          if (key.toLowerCase().trim() === artistNameKey) {
            found = artist;
            break;
          }
        }
      }

      if (found && found.artist.images && found.artist.images.length > 0) {
        artistNameToImages.set(artistNameKey, found.artist.images);
      } else {
        // Need to look up this artist
        artistsNeedingLookup.set(artistNameKey, data);
      }
    });

    console.log(`   Found ${artistNameToImages.size} artists in existing cleaned data`);
    console.log(`   Need to lookup ${artistsNeedingLookup.size} artists from Spotify API`);

    // For artists not found, we need to get their artist IDs
    // We'll need to find a representative song for each artist and get the artist ID from the track
    if (artistsNeedingLookup.size > 0) {
      // Create a map of artist name to song IDs from history
      const artistToSongIds = new Map<string, string[]>();
      history.songs.forEach(song => {
        const artistName = (song.artist.name || song.artists[0] || '').toLowerCase().trim();
        if (artistName && artistsNeedingLookup.has(artistName)) {
          if (!artistToSongIds.has(artistName)) {
            artistToSongIds.set(artistName, []);
          }
          if (song.songId) {
            artistToSongIds.get(artistName)!.push(song.songId);
          }
        }
      });

      // Get representative song IDs for each artist
      const songIdsToFetch = new Set<string>();
      const artistNameToSongId = new Map<string, string>();
      
      artistsNeedingLookup.forEach((data, artistNameKey) => {
        const songIds = artistToSongIds.get(artistNameKey);
        if (songIds && songIds.length > 0) {
          const songId = songIds[0]; // Use first available song
          songIdsToFetch.add(songId);
          artistNameToSongId.set(artistNameKey, songId);
        }
      });

      if (songIdsToFetch.size > 0) {
        const accessToken = await this.tokenManager.getValidAccessToken();
        console.log(`   Fetching ${songIdsToFetch.size} tracks to get artist IDs...`);
        const tracks = await this.spotifyApiClient.fetchTracks(accessToken, Array.from(songIdsToFetch));
        console.log(`✅ Fetched ${tracks.length} tracks`);

        // Extract artist IDs from tracks
        const artistIds = new Set<string>();
        const artistNameToArtistId = new Map<string, string>();
        
        tracks.forEach(track => {
          if (track.artists && track.artists.length > 0) {
            const artistId = track.artists[0].id;
            const artistName = track.artists[0].name.toLowerCase().trim();
            if (artistId) {
              artistIds.add(artistId);
              // Find which artist name this corresponds to
              for (const [nameKey, songId] of artistNameToSongId.entries()) {
                if (songId === track.id) {
                  artistNameToArtistId.set(nameKey, artistId);
                  break;
                }
              }
            }
          }
        });

        if (artistIds.size > 0) {
          console.log(`   Found ${artistIds.size} unique artist IDs, fetching artist metadata...`);
          const artistsMap = await this.spotifyApiClient.fetchArtists(accessToken, Array.from(artistIds));
          console.log(`✅ Fetched ${artistsMap.size} artists`);

          // Map artist IDs back to artist names and store images
          artistNameToArtistId.forEach((artistId, artistNameKey) => {
            const spotifyArtist = artistsMap.get(artistId);
            if (spotifyArtist && spotifyArtist.images && spotifyArtist.images.length > 0) {
              artistNameToImages.set(artistNameKey, spotifyArtist.images);
            }
          });
        }
      }
    }

    // Update detailed stats with enriched images
    let enrichedCount = 0;
    detailedStats.yearlyTopItems.forEach(yearData => {
      yearData.topArtists.forEach(artist => {
        const artistNameKey = artist.artistName.toLowerCase().trim();
        const images = artistNameToImages.get(artistNameKey);
        if (images && images.length > 0) {
          artist.images = images;
          enrichedCount++;
        }
      });
    });

    console.log(`✅ Enriched ${enrichedCount} artists with images from Spotify API`);
    return detailedStats;
  }

  /**
   * Enrich detailed stats with song and album images from Spotify API
   */
  private async enrichDetailedStatsWithSongImages(
    detailedStats: DetailedStats,
    existingSongs: Map<string, CleanedSong>,
    existingAlbums: Map<string, CleanedAlbum>
  ): Promise<DetailedStats> {
    if (!this.tokenManager) {
      console.log('ℹ️  Skipping song and album image enrichment for detailed stats (Spotify tokens not available)');
      return detailedStats;
    }

    console.log('\n📥 Enriching detailed stats with song and album images from Spotify API...');
    
    // Collect all unique song IDs from yearly top items
    const allSongIds = new Set<string>();
    detailedStats.yearlyTopItems.forEach(yearData => {
      yearData.topSongs.forEach(song => {
        allSongIds.add(song.songId);
      });
    });

    // Collect all unique albums from yearly top items
    const albumKeyToYearlyData = new Map<string, { year: string; album: TopAlbum }>();
    detailedStats.yearlyTopItems.forEach(yearData => {
      yearData.topAlbums.forEach(album => {
        const key = `${album.albumName.toLowerCase().trim()}|${album.artist.toLowerCase().trim()}`;
        if (!albumKeyToYearlyData.has(key)) {
          albumKeyToYearlyData.set(key, { year: yearData.year, album });
        }
      });
    });

    const totalSongs = allSongIds.size;
    console.log(`   Processing ${totalSongs} unique songs from top items`);
    console.log(`   Processing ${albumKeyToYearlyData.size} unique albums from top items`);
    console.log(`   Available songs in map: ${existingSongs.size}`);

    // First, try to match with existing cleaned songs
    const songIdToImages = new Map<string, Array<{ height: number; url: string; width: number }>>();
    const songsNeedingLookup = new Set<string>();
    let foundInMap = 0;
    let foundWithoutImages = 0;

    allSongIds.forEach(songId => {
      const existingSong = existingSongs.get(songId);
      if (existingSong) {
        foundInMap++;
        if (existingSong.album && existingSong.album.images && existingSong.album.images.length > 0) {
          songIdToImages.set(songId, existingSong.album.images);
        } else {
          foundWithoutImages++;
          songsNeedingLookup.add(songId);
        }
      } else {
        songsNeedingLookup.add(songId);
      }
    });

    // First, try to match albums with existing cleaned albums
    const albumKeyToImages = new Map<string, Array<{ height: number; url: string; width: number }>>();
    albumKeyToYearlyData.forEach((data, albumKey) => {
      // Try to find in existing cleaned albums
      let found = existingAlbums.get(albumKey);
      if (!found) {
        // Try exact match
        for (const [key, album] of existingAlbums.entries()) {
          const keyAlbumName = key.split('|')[0]?.toLowerCase().trim();
          const keyArtist = key.split('|')[1]?.toLowerCase().trim();
          const dataAlbumName = data.album.albumName.toLowerCase().trim();
          const dataArtist = data.album.artist.toLowerCase().trim();
          if (keyAlbumName === dataAlbumName && keyArtist === dataArtist) {
            found = album;
            break;
          }
        }
      }

      if (found && found.album.images && found.album.images.length > 0) {
        albumKeyToImages.set(albumKey, found.album.images);
      }
    });

    console.log(`   Found ${foundInMap} songs in map, ${foundWithoutImages} without images`);
    console.log(`   Found ${songIdToImages.size} songs in existing cleaned data`);
    console.log(`   Found ${albumKeyToImages.size} albums in existing cleaned data`);
    console.log(`   Need to lookup ${songsNeedingLookup.size} songs from Spotify API`);

    // For songs not found, fetch from Spotify API
    // We'll also extract album information from these tracks
    if (songsNeedingLookup.size > 0) {
      const accessToken = await this.tokenManager.getValidAccessToken();
      const songIdsArray = Array.from(songsNeedingLookup);
      console.log(`   Fetching ${songIdsArray.length} tracks from Spotify API...`);
      const tracks = await this.spotifyApiClient.fetchTracks(accessToken, songIdsArray);
      console.log(`✅ Fetched ${tracks.length} tracks`);

      // Extract album images from tracks for both songs and albums
      let tracksWithImages = 0;
      let tracksWithoutImages = 0;
      tracks.forEach(track => {
        if (track && track.album && track.album.images && track.album.images.length > 0) {
          // Store album images for songs
          songIdToImages.set(track.id, track.album.images);
          tracksWithImages++;
          
          // Also store album images for albums if this track's album matches a top album
          if (track.album.name && track.album.artists && track.album.artists.length > 0) {
            const albumName = track.album.name.toLowerCase().trim();
            const albumArtist = track.album.artists[0].name.toLowerCase().trim();
            const albumKey = `${albumName}|${albumArtist}`;
            
            // Check if this album is in our top albums list
            if (albumKeyToYearlyData.has(albumKey) && !albumKeyToImages.has(albumKey)) {
              albumKeyToImages.set(albumKey, track.album.images);
            }
          }
        } else {
          tracksWithoutImages++;
          // Log some examples of tracks without images for debugging
          if (tracksWithoutImages <= 3) {
            console.log(`   ⚠️  Track ${track?.id || 'unknown'} has no album images`);
          }
        }
      });
      console.log(`   Found images for ${tracksWithImages} tracks, ${tracksWithoutImages} without images`);
      
      // Check if we're missing any songs (API might return null for some tracks)
      const fetchedTrackIds = new Set(tracks.map(t => t.id));
      const missingTrackIds = songIdsArray.filter(id => !fetchedTrackIds.has(id));
      if (missingTrackIds.length > 0) {
        console.log(`   ⚠️  ${missingTrackIds.length} track IDs were not returned by API (may be invalid or unavailable)`);
      }
    }

    // Update detailed stats with enriched song images
    let enrichedSongCount = 0;
    let missingSongCount = 0;
    const missingSongIds: string[] = [];
    detailedStats.yearlyTopItems.forEach(yearData => {
      yearData.topSongs.forEach(song => {
        const images = songIdToImages.get(song.songId);
        if (images && images.length > 0) {
          song.images = images;
          enrichedSongCount++;
        } else {
          missingSongCount++;
          missingSongIds.push(song.songId);
          // Keep empty array if no images found
          if (!song.images) {
            song.images = [];
          }
        }
      });
    });

    // Update detailed stats with enriched album images
    let enrichedAlbumCount = 0;
    const albumsNeedingSearch: Array<{ album: TopAlbum; albumKey: string }> = [];
    
    detailedStats.yearlyTopItems.forEach(yearData => {
      yearData.topAlbums.forEach(album => {
        const albumKey = `${album.albumName.toLowerCase().trim()}|${album.artist.toLowerCase().trim()}`;
        const images = albumKeyToImages.get(albumKey);
        if (images && images.length > 0) {
          album.images = images;
          enrichedAlbumCount++;
        } else if (!album.images || album.images.length === 0) {
          albumsNeedingSearch.push({ album, albumKey });
        }
      });
    });

    // Fallback: search for albums missing images
    if (albumsNeedingSearch.length > 0) {
      console.log(`   Searching for ${albumsNeedingSearch.length} albums missing images...`);
      const accessToken = await this.tokenManager!.getValidAccessToken();
      let searchedCount = 0;
      
      for (const { album, albumKey } of albumsNeedingSearch) {
        const spotifyAlbum = await this.spotifyApiClient.searchAlbum(accessToken, album.albumName, album.artist);
        if (spotifyAlbum?.images && spotifyAlbum.images.length > 0) {
          album.images = spotifyAlbum.images;
          albumKeyToImages.set(albumKey, spotifyAlbum.images);
          enrichedAlbumCount++;
          searchedCount++;
        }
        await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
      }
      
      if (searchedCount > 0) {
        console.log(`   ✅ Found images for ${searchedCount} albums via search`);
      }
    }

    console.log(`✅ Enriched ${enrichedSongCount} songs with images`);
    console.log(`✅ Enriched ${enrichedAlbumCount} albums with images`);
    if (missingSongCount > 0) {
      console.log(`⚠️  ${missingSongCount} songs still missing images`);
      // Log first few missing song IDs for debugging
      if (missingSongIds.length > 0) {
        console.log(`   Example missing song IDs: ${missingSongIds.slice(0, 5).join(', ')}`);
      }
    }
    return detailedStats;
  }


  /**
   * Main function to generate all cleaned files
   */
  async generateCleanedFiles(): Promise<void> {
    try {
      console.log('🚀 Generating All Cleaned Files from Complete Listening History');
      console.log('================================================================');
      
      const historyFile = this.fileOps.findLatestCompleteHistoryFile();
      if (!historyFile) {
        console.log('⚠️  No complete listening history found');
        return;
      }
      
      console.log(`📁 Loading complete history from: ${historyFile}`);
      const history = this.fileOps.loadCompleteHistory(historyFile);
      
      // Calculate detailed statistics
      let detailedStats = this.calculateDetailedStats(history);
      
      const songsResult = this.generateCleanedSongs(history);
      const artistsResult = this.generateCleanedArtists(history);
      const albumsWithSongsResult = this.generateAlbumsWithSongs(history);
      const allArtistsGenresWithSongIds = this.generateAllArtistsGenres(history, 10);
      
      const existingFiles = this.fileOps.loadExistingCleanedFiles();
      
      await this.initializeSpotifyToken();
      
      let allArtistsGenres: Array<{ name: string; play_count: number; genres: string[] }>;
      
      if (this.tokenManager) {
        try {
          console.log('\n🎵 Enriching cleaned files with Spotify metadata...');
          songsResult.songs = await this.enrichSongsWithMetadata(songsResult.songs, existingFiles.songs);
          artistsResult.artists = await this.enrichArtistsWithMetadata(artistsResult.artists, existingFiles.artists);
          artistsResult.artists = await this.enrichArtistTopSongsAndAlbums(artistsResult.artists, existingFiles.artists);
          albumsWithSongsResult.albums = await this.enrichAlbumsWithSongsMetadata(albumsWithSongsResult.albums, existingFiles.albumsWithSongs);
          
          // Enrich all artists genres after top artists are enriched (to reuse existing data)
          allArtistsGenres = await this.enrichAllArtistsGenres(allArtistsGenresWithSongIds, existingFiles.artists);
          
          // Create a map of enriched albums for lookup (from albumsWithSongs) for detailed stats enrichment
          const enrichedAlbumsMap = new Map<string, CleanedAlbum>();
          albumsWithSongsResult.albums.forEach(album => {
            const nameKey = `${album.album.name.toLowerCase().trim()}|${(album.album.artists[0] || '').toLowerCase().trim()}`;
            const cleanedAlbum: CleanedAlbum = {
              rank: album.rank,
              duration_ms: album.duration_ms,
              count: album.count,
              differents: album.differents,
              primaryAlbumId: album.primaryAlbumId,
              total_count: album.total_count,
              total_duration_ms: album.total_duration_ms,
              album: album.album,
              consolidated_count: album.consolidated_count,
              original_albumIds: album.original_albumIds
            };
            enrichedAlbumsMap.set(nameKey, cleanedAlbum);
            if (album.primaryAlbumId) {
              enrichedAlbumsMap.set(album.primaryAlbumId, cleanedAlbum);
            }
          });
          // Also include existing albums from albumsWithSongs as fallback
          existingFiles.albumsWithSongs.forEach((album, key) => {
            if (!enrichedAlbumsMap.has(key)) {
              enrichedAlbumsMap.set(key, {
                rank: album.rank,
                duration_ms: album.duration_ms,
                count: album.count,
                differents: album.differents,
                primaryAlbumId: album.primaryAlbumId,
                total_count: album.total_count,
                total_duration_ms: album.total_duration_ms,
                album: album.album,
                consolidated_count: album.consolidated_count,
                original_albumIds: album.original_albumIds
              });
            }
          });
          
          // Enrich detailed stats with actual artist and song images
          // Use the newly enriched songs/artists, not just the existing files
          
          // Create a map of enriched artists for lookup
          const enrichedArtistsMap = new Map<string, CleanedArtist>();
          artistsResult.artists.forEach(artist => {
            const nameKey = artist.artist.name.toLowerCase().trim();
            enrichedArtistsMap.set(nameKey, artist);
            if (artist.primaryArtistId) {
              enrichedArtistsMap.set(artist.primaryArtistId, artist);
            }
          });
          // Also include existing artists as fallback
          existingFiles.artists.forEach((artist, key) => {
            if (!enrichedArtistsMap.has(key)) {
              enrichedArtistsMap.set(key, artist);
            }
          });
          
          let enrichedStats = await this.enrichDetailedStatsWithArtistImages(detailedStats, enrichedArtistsMap, history);
          
          // Create a map of enriched songs for lookup
          const enrichedSongsMap = new Map<string, CleanedSong>();
          songsResult.songs.forEach(song => {
            enrichedSongsMap.set(song.songId, song);
          });
          // Also include existing songs as fallback
          existingFiles.songs.forEach((song, songId) => {
            if (!enrichedSongsMap.has(songId)) {
              enrichedSongsMap.set(songId, song);
            }
          });
          
          enrichedStats = await this.enrichDetailedStatsWithSongImages(enrichedStats, enrichedSongsMap, enrichedAlbumsMap);
          detailedStats = enrichedStats;
        } catch (err) {
          if (err instanceof RateLimitSkipEnrichmentError) {
            console.log(`\n⚠️  Spotify rate limited (429). Retry-After ${err.waitTimeSeconds}s exceeds 600s — skipping enrichment and continuing with non-enriched data.\n`);
            allArtistsGenres = allArtistsGenresWithSongIds.map(({ songId, ...rest }) => rest);
          } else {
            throw err;
          }
        }
      } else {
        // If no token manager, just remove songId
        allArtistsGenres = allArtistsGenresWithSongIds.map(({ songId, ...rest }) => rest);
      }
      
      const timestamp = await this.fileOps.saveCleanedFiles(songsResult, artistsResult, albumsWithSongsResult.albums, albumsWithSongsResult.originalCount, history, detailedStats, allArtistsGenres);
      
      console.log('');
      console.log('🎉 All cleaned files generated successfully!');
      console.log('');
      console.log('📊 Summary:');
      console.log(`- Generated ${songsResult.songs.length} top songs (${songsResult.originalCount} → ${songsResult.consolidatedCount} consolidated)`);
      console.log(`- Generated ${albumsWithSongsResult.albums.length} albums with songs (${albumsWithSongsResult.originalCount} → ${albumsWithSongsResult.albums.length} consolidated)`);
      console.log(`- Generated ${artistsResult.artists.length} top artists (${artistsResult.originalCount} → ${artistsResult.consolidatedCount} consolidated)`);
      console.log(`- Total listening time: ${detailedStats.totalListeningHours.toLocaleString()} hours (${detailedStats.totalListeningDays.toLocaleString()} days)`);
      console.log(`- Processed ${history.metadata.totalListeningEvents.toLocaleString()} listening events`);

    } catch (error) {
      console.error('💥 Failed to generate cleaned files:', error);
      process.exit(1);
    }
  }
}

// Run the script if called directly
if (require.main === module) {
  const generator = new CleanedFilesGenerator();
  generator.generateCleanedFiles();
}

export { CleanedFilesGenerator };
