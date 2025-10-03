import * as fs from 'fs';
import { glob } from 'glob';

interface CompleteSong {
  songId: string;
  name: string;
  duration_ms: number;
  artists: string[];
  album: {
    id: string;
    name: string;
    images: Array<{
      height: number;
      url: string;
      width: number;
    }>;
  };
  artist: {
    name: string;
    genres: string[];
  };
  external_urls: {
    spotify: string;
  };
  preview_url: string | null;
  playCount: number;
  totalListeningTime: number;
  listeningEvents: Array<{
    playedAt: string;
    msPlayed: number;
  }>;
}

interface CompleteListeningHistory {
  metadata: {
    totalSongs: number;
    totalListeningEvents: number;
    totalListeningTime: number;
    dateRange: {
      earliest: string;
      latest: string;
    };
    timestamp: string;
    source: string;
  };
  songs: CompleteSong[];
}

// Output types (matching existing format)
interface CleanedSong {
  duration_ms: number;
  count: number;
  songId: string;
  song: {
    name: string;
    preview_url: string | null;
    external_urls: Record<string, string>;
  };
  album: {
    name: string;
    images: Array<{
      height: number;
      url: string;
      width: number;
    }>;
  };
  artist: {
    name: string;
    genres: string[];
  };
  consolidated_count: number;
  original_songIds: string[];
}

interface CleanedAlbum {
  duration_ms: number;
  count: number;
  differents: number;
  primaryAlbumId: string;
  total_count: number;
  total_duration_ms: number;
  album: {
    name: string;
    album_type: string;
    artists: string[];
    release_date: string;
    release_date_precision: string;
    popularity: number;
    images: Array<{
      height: number;
      url: string;
      width: number;
    }>;
    external_urls: Record<string, string>;
    genres: string[];
  };
  consolidated_count: number;
  original_albumIds: string[];
}

interface CleanedArtist {
  duration_ms: number;
  count: number;
  differents: number;
  primaryArtistId: string;
  total_count: number;
  total_duration_ms: number;
  artist: {
    name: string;
    genres: string[];
    popularity: number;
    followers: {
      total: number;
    };
    images: Array<{
      height: number;
      url: string;
      width: number;
    }>;
    external_urls: Record<string, string>;
  };
  consolidated_count: number;
  original_artistIds: string[];
}

// Song within album (for detailed album view)
interface AlbumSong {
  songId: string;
  name: string;
  duration_ms: number;
  track_number: number;
  disc_number: number;
  explicit: boolean;
  preview_url: string | null;
  external_urls: Record<string, string>;
  play_count: number;
  total_listening_time_ms: number;
  artists: string[];
}

interface AlbumWithSongs extends CleanedAlbum {
  total_songs: number;
  played_songs: number;
  unplayed_songs: number;
  songs: AlbumSong[];
}

class CleanedFilesGenerator {
  /**
   * Find the most recent complete listening history file
   */
  private findLatestCompleteHistoryFile(): string | null {
    const files = glob.sync('complete-listening-history/complete-listening-history-*.json');
    if (files.length === 0) {
      console.log('⚠️  No complete listening history files found');
      return null;
    }
    
    // Sort by timestamp (newest first)
    files.sort((a, b) => {
      const timestampA = parseInt(a.match(/complete-listening-history-(\d+)\.json/)?.[1] || '0');
      const timestampB = parseInt(b.match(/complete-listening-history-(\d+)\.json/)?.[1] || '0');
      return timestampB - timestampA;
    });
    
    return files[0];
  }

  /**
   * Load complete listening history
   */
  private loadCompleteHistory(filename: string): CompleteListeningHistory {
    try {
      const content = fs.readFileSync(filename, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load complete history file: ${error}`);
    }
  }

  /**
   * Consolidate songs by name and artist (same logic as consolidate-all-mongodb-data.ts)
   */
  private consolidateSongs(songs: CleanedSong[]): CleanedSong[] {
    console.log('🔄 Consolidating songs...');
    
    const consolidationMap = new Map<string, CleanedSong>();
    let duplicatesRemoved = 0;
    
    songs.forEach(song => {
      const key = `${song.song.name.toLowerCase().trim()}|${song.artist.name.toLowerCase().trim()}`;
      
      if (consolidationMap.has(key)) {
        const existing = consolidationMap.get(key)!;
        
        existing.count += song.count;
        existing.consolidated_count += song.count;
        existing.duration_ms += song.duration_ms;
        existing.original_songIds.push(song.songId);
        
        duplicatesRemoved++;
      } else {
        consolidationMap.set(key, {
          ...song,
          consolidated_count: song.count
        });
      }
    });
    
    const consolidatedSongs = Array.from(consolidationMap.values())
      .sort((a, b) => b.count - a.count);
    
    console.log(`📊 Songs: ${songs.length} → ${consolidatedSongs.length} (${duplicatesRemoved} duplicates removed)`);
    return consolidatedSongs;
  }

  /**
   * Consolidate albums by name and first artist
   */
  private consolidateAlbums(albums: CleanedAlbum[]): CleanedAlbum[] {
    console.log('🔄 Consolidating albums...');
    
    const consolidationMap = new Map<string, CleanedAlbum>();
    let duplicatesRemoved = 0;
    
    albums.forEach(album => {
      const firstArtist = album.album.artists[0] || 'Unknown Artist';
      const key = `${album.album.name.toLowerCase().trim()}|${firstArtist.toLowerCase().trim()}`;
      
      if (consolidationMap.has(key)) {
        const existing = consolidationMap.get(key)!;
        
        existing.count += album.count;
        existing.total_count += album.total_count;
        existing.duration_ms += album.duration_ms;
        existing.total_duration_ms += album.total_duration_ms;
        existing.differents += album.differents;
        existing.consolidated_count += album.count;
        existing.original_albumIds.push(album.primaryAlbumId);
        
        duplicatesRemoved++;
      } else {
        consolidationMap.set(key, {
          ...album,
          consolidated_count: album.count
        });
      }
    });
    
    const consolidatedAlbums = Array.from(consolidationMap.values())
      .sort((a, b) => b.count - a.count);
    
    console.log(`📊 Albums: ${albums.length} → ${consolidatedAlbums.length} (${duplicatesRemoved} duplicates removed)`);
    return consolidatedAlbums;
  }

  /**
   * Consolidate artists by name
   */
  private consolidateArtists(artists: CleanedArtist[]): CleanedArtist[] {
    console.log('🔄 Consolidating artists...');
    
    const consolidationMap = new Map<string, CleanedArtist>();
    let duplicatesRemoved = 0;
    
    artists.forEach(artist => {
      const key = artist.artist.name.toLowerCase().trim();
      
      if (consolidationMap.has(key)) {
        const existing = consolidationMap.get(key)!;
        
        existing.count += artist.count;
        existing.total_count += artist.total_count;
        existing.duration_ms += artist.duration_ms;
        existing.total_duration_ms += artist.total_duration_ms;
        existing.differents += artist.differents;
        existing.consolidated_count += artist.count;
        existing.original_artistIds.push(artist.primaryArtistId);
        
        duplicatesRemoved++;
      } else {
        consolidationMap.set(key, {
          ...artist,
          consolidated_count: artist.count
        });
      }
    });
    
    const consolidatedArtists = Array.from(consolidationMap.values())
      .sort((a, b) => b.count - a.count);
    
    console.log(`📊 Artists: ${artists.length} → ${consolidatedArtists.length} (${duplicatesRemoved} duplicates removed)`);
    return consolidatedArtists;
  }

  /**
   * Generate cleaned songs from complete history
   */
  private generateCleanedSongs(history: CompleteListeningHistory): CleanedSong[] {
    console.log('🎵 Generating cleaned songs...');

    // Convert complete songs to cleaned format
    const songs: CleanedSong[] = history.songs.map(song => ({
      duration_ms: song.totalListeningTime, // Total listening time
      count: song.playCount,
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
      original_songIds: [song.songId]
    }));

    // Consolidate songs
    return this.consolidateSongs(songs);
  }

  /**
   * Generate cleaned albums from complete history
   */
  private generateCleanedAlbums(history: CompleteListeningHistory): CleanedAlbum[] {
    console.log('💿 Generating cleaned albums...');

    // Group songs by album
    const albumMap = new Map<string, {
      songs: CompleteSong[];
      totalPlayCount: number;
      totalListeningTime: number;
      differentSongs: Set<string>;
    }>();

    history.songs.forEach(song => {
      const albumId = song.album.id;
      
      if (!albumMap.has(albumId)) {
        albumMap.set(albumId, {
          songs: [],
          totalPlayCount: 0,
          totalListeningTime: 0,
          differentSongs: new Set()
        });
      }
      
      const albumData = albumMap.get(albumId)!;
      albumData.songs.push(song);
      albumData.totalPlayCount += song.playCount;
      albumData.totalListeningTime += song.totalListeningTime;
      albumData.differentSongs.add(song.songId);
    });

    // Convert to cleaned album format
    const albums: CleanedAlbum[] = Array.from(albumMap.entries()).map(([albumId, data]) => {
      const firstSong = data.songs[0];
      
      return {
        duration_ms: data.totalListeningTime,
        count: data.totalPlayCount,
        differents: data.differentSongs.size,
        primaryAlbumId: albumId,
        total_count: data.totalPlayCount,
        total_duration_ms: data.totalListeningTime,
        album: {
          name: firstSong.album.name,
          album_type: 'album', // We don't have this info in complete history
          artists: firstSong.artists,
          release_date: '', // We don't have this info
          release_date_precision: 'day',
          popularity: 0, // We don't have this info
          images: firstSong.album.images,
          external_urls: {}, // We don't have this info
          genres: firstSong.artist.genres
        },
        consolidated_count: data.totalPlayCount,
        original_albumIds: [albumId]
      };
    });

    // Sort by play count (descending) before consolidation
    albums.sort((a, b) => b.count - a.count);
    
    // Consolidate albums
    return this.consolidateAlbums(albums);
  }

  /**
   * Generate cleaned artists from complete history
   */
  private generateCleanedArtists(history: CompleteListeningHistory): CleanedArtist[] {
    console.log('👤 Generating cleaned artists...');

    // Group songs by artist
    const artistMap = new Map<string, {
      songs: CompleteSong[];
      totalPlayCount: number;
      totalListeningTime: number;
      differentSongs: Set<string>;
    }>();

    history.songs.forEach(song => {
      const artistName = song.artist.name;
      
      if (!artistMap.has(artistName)) {
        artistMap.set(artistName, {
          songs: [],
          totalPlayCount: 0,
          totalListeningTime: 0,
          differentSongs: new Set()
        });
      }
      
      const artistData = artistMap.get(artistName)!;
      artistData.songs.push(song);
      artistData.totalPlayCount += song.playCount;
      artistData.totalListeningTime += song.totalListeningTime;
      artistData.differentSongs.add(song.songId);
    });

    // Convert to cleaned artist format
    const artists: CleanedArtist[] = Array.from(artistMap.entries()).map(([artistName, data]) => {
      const firstSong = data.songs[0];
      
      return {
        duration_ms: data.totalListeningTime,
        count: data.totalPlayCount,
        differents: data.differentSongs.size,
        primaryArtistId: firstSong.songId, // Use first song ID as artist ID
        total_count: data.totalPlayCount,
        total_duration_ms: data.totalListeningTime,
        artist: {
          name: artistName,
          genres: firstSong.artist.genres,
          popularity: 0, // We don't have this info
          followers: {
            total: 0 // We don't have this info
          },
          images: [], // We don't have this info
          external_urls: {} // We don't have this info
        },
        consolidated_count: data.totalPlayCount,
        original_artistIds: [firstSong.songId]
      };
    });

    // Sort by play count (descending) before consolidation
    artists.sort((a, b) => b.count - a.count);
    
    // Consolidate artists
    return this.consolidateArtists(artists);
  }

  /**
   * Consolidate albums with songs (same logic as consolidate-albums-with-songs.ts)
   */
  private consolidateAlbumsWithSongs(albums: AlbumWithSongs[]): AlbumWithSongs[] {
    console.log('🔄 Consolidating albums with songs...');
    
    const consolidationMap = new Map<string, AlbumWithSongs>();
    let duplicatesRemoved = 0;
    
    albums.forEach(album => {
      const firstArtist = album.album.artists[0] || 'Unknown Artist';
      const key = `${album.album.name.toLowerCase().trim()}|${firstArtist.toLowerCase().trim()}`;
      
      if (consolidationMap.has(key)) {
        const existing = consolidationMap.get(key)!;
        
        // Merge album statistics
        existing.count += album.count;
        existing.total_duration_ms += album.total_duration_ms;
        existing.consolidated_count += album.consolidated_count;
        existing.original_albumIds.push(...album.original_albumIds);
        
        // Merge songs (consolidate by song name)
        const songMap = new Map<string, AlbumSong>();
        
        // Add existing songs
        existing.songs.forEach(song => {
          const songKey = `${song.name.toLowerCase().trim()}|${song.artists.join(', ').toLowerCase()}`;
          songMap.set(songKey, song);
        });
        
        // Add new songs
        album.songs.forEach(song => {
          const songKey = `${song.name.toLowerCase().trim()}|${song.artists.join(', ').toLowerCase()}`;
          
          if (songMap.has(songKey)) {
            const existingSong = songMap.get(songKey)!;
            existingSong.play_count += song.play_count;
            existingSong.total_listening_time_ms += song.total_listening_time_ms;
          } else {
            songMap.set(songKey, song);
          }
        });
        
        existing.songs = Array.from(songMap.values()).sort((a, b) => b.play_count - a.play_count);
        
        // Recalculate song counts after merging
        existing.total_songs = existing.songs.length;
        existing.played_songs = existing.songs.filter(song => song.play_count > 0).length;
        existing.unplayed_songs = existing.songs.filter(song => song.play_count === 0).length;
        
        duplicatesRemoved++;
      } else {
        // Sort songs by play count
        album.songs = album.songs.sort((a, b) => b.play_count - a.play_count);
        consolidationMap.set(key, album);
      }
    });
    
    const consolidatedAlbums = Array.from(consolidationMap.values())
      .sort((a, b) => b.count - a.count);
    
    console.log(`📊 Albums with songs: ${albums.length} → ${consolidatedAlbums.length} (${duplicatesRemoved} duplicates removed)`);
    return consolidatedAlbums;
  }

  /**
   * Generate albums with songs from complete history
   */
  private generateAlbumsWithSongs(history: CompleteListeningHistory): { albums: AlbumWithSongs[], originalCount: number } {
    console.log('💿🎵 Generating albums with songs...');

    // Group songs by album
    const albumMap = new Map<string, CompleteSong[]>();
    history.songs.forEach(song => {
      const albumId = song.album.id;
      if (!albumMap.has(albumId)) {
        albumMap.set(albumId, []);
      }
      albumMap.get(albumId)!.push(song);
    });

    // Convert to albums with songs format
    const albumsWithSongs: AlbumWithSongs[] = Array.from(albumMap.entries()).map(([albumId, songs]) => {
      const firstSong = songs[0];
      const totalPlayCount = songs.reduce((sum, song) => sum + song.playCount, 0);
      const totalListeningTime = songs.reduce((sum, song) => sum + song.totalListeningTime, 0);
      const playedSongs = songs.filter(song => song.playCount > 0).length;

      // Convert songs to album song format
      const albumSongs: AlbumSong[] = songs.map(song => ({
        songId: song.songId,
        name: song.name,
        duration_ms: song.duration_ms,
        track_number: 1, // We don't have this info
        disc_number: 1, // We don't have this info
        explicit: false, // We don't have this info
        preview_url: song.preview_url,
        external_urls: song.external_urls,
        play_count: song.playCount,
        total_listening_time_ms: song.totalListeningTime,
        artists: song.artists
      }));

      return {
        duration_ms: totalListeningTime,
        count: totalPlayCount,
        differents: songs.length,
        primaryAlbumId: albumId,
        total_count: totalPlayCount,
        total_duration_ms: totalListeningTime,
        album: {
          name: firstSong.album.name,
          album_type: 'album',
          artists: firstSong.artists,
          release_date: '',
          release_date_precision: 'day',
          popularity: 0,
          images: firstSong.album.images,
          external_urls: {},
          genres: firstSong.artist.genres
        },
        consolidated_count: totalPlayCount,
        original_albumIds: [albumId],
        total_songs: songs.length,
        played_songs: playedSongs,
        unplayed_songs: songs.length - playedSongs,
        songs: albumSongs.sort((a, b) => b.play_count - a.play_count)
      };
    });

    // Sort by play count (descending) and take top 100 before consolidation
    albumsWithSongs.sort((a, b) => b.count - a.count);
    const top100Albums = albumsWithSongs.slice(0, 100);
    
    const originalCount = albumsWithSongs.length;
    const consolidatedAlbums = this.consolidateAlbumsWithSongs(top100Albums);
    
    return { albums: consolidatedAlbums, originalCount };
  }

  /**
   * Save all cleaned files
   */
  private saveCleanedFiles(
    songs: CleanedSong[],
    albums: CleanedAlbum[],
    artists: CleanedArtist[],
    albumsWithSongs: AlbumWithSongs[],
    originalAlbumsCount: number,
    history: CompleteListeningHistory
  ): void {
    // Ensure directory exists
    if (!fs.existsSync('cleaned-data')) {
      fs.mkdirSync('cleaned-data');
    }
    
    const timestamp = Date.now();
    
    // Save songs
    const songsFile = `cleaned-data/cleaned-songs-${timestamp}.json`;
    fs.writeFileSync(songsFile, JSON.stringify({
      metadata: {
        originalTotalSongs: history.metadata.totalSongs,
        consolidatedTotalSongs: songs.length,
        duplicatesRemoved: history.metadata.totalSongs - songs.length,
        consolidationRate: Math.round(((history.metadata.totalSongs - songs.length) / history.metadata.totalSongs) * 100 * 100) / 100,
        timestamp: new Date().toISOString(),
        source: 'Complete Listening History',
        totalListeningEvents: history.metadata.totalListeningEvents
      },
      songs: songs.slice(0, 500) // Top 500
    }, null, 2));

    // Save albums
    const albumsFile = `cleaned-data/cleaned-albums-${timestamp}.json`;
    fs.writeFileSync(albumsFile, JSON.stringify({
      metadata: {
        originalTotalAlbums: albums.length,
        consolidatedTotalAlbums: albums.length,
        duplicatesRemoved: 0,
        consolidationRate: 0,
        timestamp: new Date().toISOString(),
        source: 'Complete Listening History',
        totalListeningEvents: history.metadata.totalListeningEvents
      },
      albums: albums.slice(0, 500) // Top 500
    }, null, 2));

    // Save artists
    const artistsFile = `cleaned-data/cleaned-artists-${timestamp}.json`;
    fs.writeFileSync(artistsFile, JSON.stringify({
      metadata: {
        originalTotalArtists: artists.length,
        consolidatedTotalArtists: artists.length,
        duplicatesRemoved: 0,
        consolidationRate: 0,
        timestamp: new Date().toISOString(),
        source: 'Complete Listening History',
        totalListeningEvents: history.metadata.totalListeningEvents
      },
      artists: artists.slice(0, 500) // Top 500
    }, null, 2));

    // Save albums with songs
    const albumsWithSongsFile = `cleaned-data/cleaned-albums-with-songs-${timestamp}.json`;
    fs.writeFileSync(albumsWithSongsFile, JSON.stringify({
      metadata: {
        originalTotalAlbums: originalAlbumsCount,
        consolidatedTotalAlbums: albumsWithSongs.length,
        duplicatesRemoved: originalAlbumsCount - albumsWithSongs.length,
        consolidationRate: Math.round(((originalAlbumsCount - albumsWithSongs.length) / originalAlbumsCount) * 100 * 100) / 100,
        timestamp: new Date().toISOString(),
        source: 'Complete Listening History with Song Breakdown',
        totalListeningEvents: history.metadata.totalListeningEvents
      },
      albums: albumsWithSongs.slice(0, 100) // Top 100 albums with songs
    }, null, 2));

    console.log(`\n📁 All cleaned files saved:`);
    console.log(`- Songs: ${songsFile}`);
    console.log(`- Albums: ${albumsFile}`);
    console.log(`- Artists: ${artistsFile}`);
    console.log(`- Albums with Songs: ${albumsWithSongsFile}`);
  }

  /**
   * Main function to generate all cleaned files
   */
  async generateCleanedFiles(): Promise<void> {
    try {
      console.log('🚀 Generating All Cleaned Files from Complete Listening History');
      console.log('================================================================');
      
      // Find latest complete history file
      const historyFile = this.findLatestCompleteHistoryFile();
      if (!historyFile) {
        console.log('⚠️  No complete listening history found');
        return;
      }
      
      console.log(`📁 Loading complete history from: ${historyFile}`);
      
      // Load complete history
      const history = this.loadCompleteHistory(historyFile);
      
      // Generate all cleaned files
      const songs = this.generateCleanedSongs(history);
      const albums = this.generateCleanedAlbums(history);
      const artists = this.generateCleanedArtists(history);
      const albumsWithSongsResult = this.generateAlbumsWithSongs(history);
      
      // Save all files
      this.saveCleanedFiles(songs, albums, artists, albumsWithSongsResult.albums, albumsWithSongsResult.originalCount, history);
      
      console.log('');
      console.log('🎉 All cleaned files generated successfully!');
      console.log('');
      console.log('📊 Summary:');
      console.log(`- Total songs in history: ${history.metadata.totalSongs.toLocaleString()}`);
      console.log(`- Top 500 songs generated: ${Math.min(songs.length, 500)}`);
      console.log(`- Top 500 albums generated: ${Math.min(albums.length, 500)}`);
      console.log(`- Top 500 artists generated: ${Math.min(artists.length, 500)}`);
      console.log(`- Top 100 albums with songs: ${Math.min(albumsWithSongsResult.albums.length, 100)}`);
      console.log(`- Total listening events: ${history.metadata.totalListeningEvents.toLocaleString()}`);
      
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
