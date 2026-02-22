import * as fs from 'fs';
import { glob } from 'glob';
import type { CompleteListeningHistory, CompleteSong, CleanedSong, CleanedAlbum, CleanedArtist, AlbumWithSongs, DetailedStats, YearlyTopItems, TopSong, TopArtist } from './types';

/**
 * File operations for loading and saving cleaned data files
 */
export class FileOperations {
  /**
   * Find the most recent complete listening history file
   */
  findLatestCompleteHistoryFile(): string | null {
    let files = glob.sync('data/merged-streaming-history/merged-streaming-history-*.json');
    
    if (files.length === 0) {
      files = glob.sync('data/complete-listening-history/complete-listening-history-*.json');
    }
    
    if (files.length === 0) {
      console.log('⚠️  No complete listening history files found');
      return null;
    }
    
    files.sort((a, b) => {
      const timestampA = parseInt(a.match(/(?:merged-streaming-history-|complete-listening-history-)(\d+)\.json/)?.[1] || '0');
      const timestampB = parseInt(b.match(/(?:merged-streaming-history-|complete-listening-history-)(\d+)\.json/)?.[1] || '0');
      return timestampB - timestampA;
    });
    
    return files[0];
  }

  /**
   * Load complete listening history (handles both formats)
   */
  loadCompleteHistory(filename: string): CompleteListeningHistory {
    try {
      const content = fs.readFileSync(filename, 'utf8');
      const data = JSON.parse(content);
      
      if (data.metadata && data.metadata.totalPlayEvents !== undefined) {
        return {
          metadata: {
            totalSongs: data.metadata.totalSongs,
            totalListeningEvents: data.metadata.totalPlayEvents,
            totalListeningTime: data.songs.reduce((sum: number, song: CompleteSong) => sum + song.totalListeningTime, 0),
            dateRange: data.metadata.dateRange,
            timestamp: data.metadata.timestamp,
            source: data.metadata.source
          },
          songs: data.songs
        };
      }
      
      if (data.metadata && data.metadata.totalListeningEvents === undefined && data.songs) {
        const totalListeningEvents = data.songs.reduce((sum: number, song: CompleteSong) => sum + (song.listeningEvents?.length || 0), 0);
        return {
          ...data,
          metadata: {
            ...data.metadata,
            totalListeningEvents
          }
        };
      }
      
      return data;
    } catch (error) {
      throw new Error(`Failed to load complete history file: ${error}`);
    }
  }

  /**
   * Load existing cleaned files to preserve images
   */
  loadExistingCleanedFiles(): {
    songs: Map<string, CleanedSong>;
    albums: Map<string, CleanedAlbum>;
    artists: Map<string, CleanedArtist>;
    albumsWithSongs: Map<string, AlbumWithSongs>;
  } {
    const result = {
      songs: new Map<string, CleanedSong>(),
      albums: new Map<string, CleanedAlbum>(),
      artists: new Map<string, CleanedArtist>(),
      albumsWithSongs: new Map<string, AlbumWithSongs>()
    };

    try {
      const songsFiles = glob.sync('data/cleaned-data/cleaned-songs-*.json');
      const artistsFiles = glob.sync('data/cleaned-data/cleaned-artists-*.json');
      const albumsWithSongsFiles = glob.sync('data/cleaned-data/cleaned-albums-with-songs-*.json');

      if (songsFiles.length > 0) {
        songsFiles.sort((a, b) => {
          const tsA = parseInt(a.match(/cleaned-songs-(\d+)\.json/)?.[1] || '0');
          const tsB = parseInt(b.match(/cleaned-songs-(\d+)\.json/)?.[1] || '0');
          return tsB - tsA;
        });
        const data = JSON.parse(fs.readFileSync(songsFiles[0], 'utf8'));
        if (data.songs) {
          data.songs.forEach((song: CleanedSong) => {
            result.songs.set(song.songId, song);
          });
        }
      }

      if (artistsFiles.length > 0) {
        artistsFiles.sort((a, b) => {
          const tsA = parseInt(a.match(/cleaned-artists-(\d+)\.json/)?.[1] || '0');
          const tsB = parseInt(b.match(/cleaned-artists-(\d+)\.json/)?.[1] || '0');
          return tsB - tsA;
        });
        const data = JSON.parse(fs.readFileSync(artistsFiles[0], 'utf8'));
        if (data.artists) {
          data.artists.forEach((artist: CleanedArtist) => {
            const nameKey = artist.artist.name.toLowerCase().trim();
            result.artists.set(nameKey, artist);
            if (artist.primaryArtistId) {
              result.artists.set(artist.primaryArtistId, artist);
            }
          });
        }
      }

      if (albumsWithSongsFiles.length > 0) {
        albumsWithSongsFiles.sort((a, b) => {
          const tsA = parseInt(a.match(/cleaned-albums-with-songs-(\d+)\.json/)?.[1] || '0');
          const tsB = parseInt(b.match(/cleaned-albums-with-songs-(\d+)\.json/)?.[1] || '0');
          return tsB - tsA;
        });
        const data = JSON.parse(fs.readFileSync(albumsWithSongsFiles[0], 'utf8'));
        if (data.albums) {
          data.albums.forEach((album: AlbumWithSongs) => {
            const nameKey = `${album.album.name.toLowerCase().trim()}|${(album.album.artists[0] || '').toLowerCase().trim()}`;
            result.albumsWithSongs.set(nameKey, album);
            if (album.primaryAlbumId) {
              result.albumsWithSongs.set(album.primaryAlbumId, album);
            }
          });
        }
      }
    } catch (error) {
      console.log('⚠️  Could not load existing cleaned files for image preservation');
    }

    return result;
  }

  /**
   * Clean up old cleaned data files
   */
  cleanupOldCleanedFiles(): void {
    try {
      const cleanedDataDir = 'data/cleaned-data';
      if (!fs.existsSync(cleanedDataDir)) {
        return;
      }

      const files = fs.readdirSync(cleanedDataDir);
      const patterns = [
        /^cleaned-songs-\d+\.json$/,
        /^cleaned-artists-\d+\.json$/,
        /^cleaned-albums-with-songs-\d+\.json$/,
        /^detailed-stats-\d+\.json$/,
        /^all-artists-genres-\d+\.json$/,
        /^album-variations-by-artist-\d+\.json$/
      ];

      let deletedCount = 0;
      files.forEach(file => {
        if (patterns.some(pattern => pattern.test(file))) {
          const filePath = `${cleanedDataDir}/${file}`;
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      });

    } catch (error) {
      console.error('⚠️  Error cleaning up old files:', error);
    }
  }

  /**
   * Save all cleaned files to disk
   */
  async saveCleanedFiles(
    songsResult: { songs: CleanedSong[], originalCount: number, consolidatedCount: number },
    artistsResult: { artists: CleanedArtist[], originalCount: number, consolidatedCount: number },
    albumsWithSongs: AlbumWithSongs[],
    originalAlbumsCount: number,
    history: CompleteListeningHistory,
    detailedStats: DetailedStats,
    allArtistsGenres: Array<{ name: string; play_count: number; genres: string[] }>,
    timestamp?: number,
    albumVariationsByArtist?: Record<string, { albumName: string; count: number }[]>
  ): Promise<number> {
    if (!fs.existsSync('data/cleaned-data')) {
      fs.mkdirSync('data/cleaned-data', { recursive: true });
    }
    
    this.cleanupOldCleanedFiles();
    
    const fileTimestamp = timestamp || Date.now();
    
    const songsFile = `data/cleaned-data/cleaned-songs-${fileTimestamp}.json`;
    fs.writeFileSync(songsFile, JSON.stringify({
      metadata: {
        originalTotalSongs: songsResult.originalCount,
        consolidatedTotalSongs: songsResult.consolidatedCount,
        duplicatesRemoved: songsResult.originalCount - songsResult.consolidatedCount,
        consolidationRate: Math.round(((songsResult.originalCount - songsResult.consolidatedCount) / songsResult.originalCount) * 100 * 100) / 100,
        timestamp: new Date().toISOString(),
        source: 'Merged Streaming History',
        totalListeningEvents: history.metadata.totalListeningEvents
      },
      songs: songsResult.songs.slice(0, 500)
    }, null, 2));

    const artistsFile = `data/cleaned-data/cleaned-artists-${fileTimestamp}.json`;
    fs.writeFileSync(artistsFile, JSON.stringify({
      metadata: {
        originalTotalArtists: artistsResult.originalCount,
        consolidatedTotalArtists: artistsResult.consolidatedCount,
        duplicatesRemoved: artistsResult.originalCount - artistsResult.consolidatedCount,
        consolidationRate: Math.round(((artistsResult.originalCount - artistsResult.consolidatedCount) / artistsResult.originalCount) * 100 * 100) / 100,
        timestamp: new Date().toISOString(),
        source: 'Merged Streaming History',
        totalListeningEvents: history.metadata.totalListeningEvents
      },
      artists: artistsResult.artists.slice(0, 500)
    }, null, 2));

    const albumsWithSongsFile = `data/cleaned-data/cleaned-albums-with-songs-${fileTimestamp}.json`;
    fs.writeFileSync(albumsWithSongsFile, JSON.stringify({
      metadata: {
        originalTotalAlbums: originalAlbumsCount,
        consolidatedTotalAlbums: albumsWithSongs.length,
        duplicatesRemoved: originalAlbumsCount - albumsWithSongs.length,
        consolidationRate: Math.round(((originalAlbumsCount - albumsWithSongs.length) / originalAlbumsCount) * 100 * 100) / 100,
        timestamp: new Date().toISOString(),
        source: 'Merged Streaming History with Song Breakdown',
        totalListeningEvents: history.metadata.totalListeningEvents
      },
      albums: albumsWithSongs.slice(0, 500)
    }, null, 2));

    // Save detailed stats file
    const statsFile = `data/cleaned-data/detailed-stats-${fileTimestamp}.json`;
    fs.writeFileSync(statsFile, JSON.stringify({
      metadata: {
        timestamp: new Date().toISOString(),
        source: 'Merged Streaming History'
      },
      stats: detailedStats
    }, null, 2));

    // Save all artists genres file (lightweight for network analysis)
    const allArtistsGenresFile = `data/cleaned-data/all-artists-genres-${fileTimestamp}.json`;
    fs.writeFileSync(allArtistsGenresFile, JSON.stringify({
      metadata: {
        totalArtists: allArtistsGenres.length,
        minPlayCount: 10,
        timestamp: new Date().toISOString(),
        source: 'Merged Streaming History'
      },
      artists: allArtistsGenres
    }, null, 2));

    if (albumVariationsByArtist && Object.keys(albumVariationsByArtist).length > 0) {
      const albumVariationsFile = `data/cleaned-data/album-variations-by-artist-${fileTimestamp}.json`;
      fs.writeFileSync(albumVariationsFile, JSON.stringify(albumVariationsByArtist, null, 2));
      console.log(`- Album variations by artist: ${albumVariationsFile}`);
    }
    
    // Verify detailed stats file
    let songsWithImages = 0;
    let artistsWithImages = 0;
    detailedStats.yearlyTopItems.forEach((yearData: YearlyTopItems) => {
      yearData.topSongs.forEach((song: TopSong) => {
        if (song.images && song.images.length > 0) {
          songsWithImages++;
        }
      });
      yearData.topArtists.forEach((artist: TopArtist) => {
        if (artist.images && artist.images.length > 0) {
          artistsWithImages++;
        }
      });
    });
    
    const totalSongs = detailedStats.yearlyTopItems.reduce((sum: number, year: YearlyTopItems) => sum + year.topSongs.length, 0);
    const totalArtists = detailedStats.yearlyTopItems.reduce((sum: number, year: YearlyTopItems) => sum + year.topArtists.length, 0);
    
    console.log(`\n📁 All cleaned files saved:`);
    console.log(`- Songs: ${songsFile}`);
    console.log(`- Artists: ${artistsFile}`);
    console.log(`- Albums with Songs: ${albumsWithSongsFile}`);
    console.log(`- Detailed Stats: ${statsFile}`);
    console.log(`- All Artists Genres: ${allArtistsGenresFile}`);

    return fileTimestamp;
  }

}

