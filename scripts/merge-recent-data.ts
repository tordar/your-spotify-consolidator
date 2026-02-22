import fs from 'fs';
import path from 'path';

interface RecentPlayData {
  id: string;
  name: string;
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
  duration_ms: number;
  played_at: string;
  external_urls: {
    spotify: string;
  };
  preview_url: string | null;
}

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
    conn_country?: string;
  }>;
}

interface CompleteListeningHistory {
  songs: CompleteSong[];
  metadata: {
    totalSongs: number;
    totalListeningTime: number;
    dateRange: {
      earliest: string;
      latest: string;
    };
    source: string;
    lastUpdated: string;
  };
}

class DataMerger {
  private dataDir = 'data';
  private mergedDir = path.join(this.dataDir, 'merged-streaming-history');
  private tempDir = 'temp';

  constructor() {
    this.ensureDirectories();
  }

  /**
   * Ensure required directories exist
   */
  private ensureDirectories(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.mergedDir)) {
      fs.mkdirSync(this.mergedDir, { recursive: true });
    }
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Find the most recent recent-plays file
   */
  private findLatestRecentPlaysFile(): string | null {
    const files = fs.readdirSync(this.tempDir)
      .filter(file => file.startsWith('temp-recent-plays-') && file.endsWith('.json'))
      .sort()
      .reverse();

    return files.length > 0 ? path.join(this.tempDir, files[0]) : null;
  }

  /**
   * Find the most recent merged streaming history file
   */
  private findLatestMergedFile(): string | null {
    const files = fs.readdirSync(this.mergedDir)
      .filter(file => file.startsWith('merged-streaming-history-') && file.endsWith('.json'))
      .sort()
      .reverse();

    return files.length > 0 ? path.join(this.mergedDir, files[0]) : null;
  }

  /**
   * Load recent plays data
   */
  private loadRecentPlays(filePath: string): RecentPlayData[] {
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(data);
      
      // Handle both formats: direct array or wrapped with metadata
      if (Array.isArray(parsed)) {
        return parsed;
      } else if (parsed.plays && Array.isArray(parsed.plays)) {
        return parsed.plays;
      } else {
        throw new Error('Invalid recent plays file format');
      }
    } catch (error) {
      console.error(`❌ Error loading recent plays from ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Load existing merged data
   */
  private loadExistingData(filePath: string): CompleteListeningHistory {
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`❌ Error loading existing data from ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Merge recent plays with existing data
   */
  private mergeData(existingData: CompleteListeningHistory, recentPlays: RecentPlayData[]): CompleteListeningHistory {
    console.log('🔄 Merging recent plays with existing data...');
    
    // Create a map of existing songs for quick lookup by songId (unique per album)
    const existingSongsMap = new Map<string, CompleteSong>();
    
    existingData.songs.forEach(song => {
      existingSongsMap.set(song.songId, song);
    });

    // Clean up existing duplicates in the data
    let duplicatesRemoved = 0;
    existingSongsMap.forEach(song => {
      const originalCount = song.listeningEvents.length;
      const uniqueEvents = song.listeningEvents.filter((event, index, self) => 
        index === self.findIndex(e => e.playedAt === event.playedAt)
      );
      
      if (uniqueEvents.length !== originalCount) {
        duplicatesRemoved += (originalCount - uniqueEvents.length);
        song.listeningEvents = uniqueEvents;
        song.playCount = uniqueEvents.length;
        song.totalListeningTime = uniqueEvents.reduce((sum, event) => sum + event.msPlayed, 0);
      }
    });

    if (duplicatesRemoved > 0) {
      console.log(`🧹 Cleaned up ${duplicatesRemoved} duplicate listening events from existing data`);
    }

    let existingSongsUpdated = 0;
    let newSongsAdded = 0;
    let duplicatesSkipped = 0;
    const newSongs: CompleteSong[] = [];

    // Process each recent play
    recentPlays.forEach(play => {
      // Match by songId (unique per album)
      const existingSong = existingSongsMap.get(play.id);
      
      if (existingSong) {
        // Update existing song (maintains chronological position)
        
        // Check if this exact play time already exists to avoid duplicates
        const playTimeExists = existingSong.listeningEvents.some(event => event.playedAt === play.played_at);
        
        if (!playTimeExists) {
          existingSong.playCount += 1;
          existingSong.totalListeningTime += play.duration_ms;
          // Update duration_ms if it was missing (0) and we have it from recent plays
          if (existingSong.duration_ms === 0 && play.duration_ms > 0) {
            existingSong.duration_ms = play.duration_ms;
          }
          // Update album information from recent play (this is the actual album from Spotify API)
          // Since songId is unique per album, this ensures correct album association
          if (play.album) {
            existingSong.album.id = play.album.id;
            existingSong.album.name = play.album.name;
            // Update images if we have better ones
            if (play.album.images && play.album.images.length > 0) {
              existingSong.album.images = play.album.images;
            }
          }
          existingSong.listeningEvents.push({
            playedAt: play.played_at,
            msPlayed: play.duration_ms
          });
          existingSongsUpdated++;
          console.log(`🔄 Updated: "${play.name}" by ${play.artists[0]} (+1 play)`);
        } else {
          duplicatesSkipped++;
        }
      } else {
        // Add new song (will be appended to end)
        const newSong: CompleteSong = {
          songId: play.id,
          name: play.name,
          duration_ms: play.duration_ms,
          artists: play.artists,
          album: play.album,
          artist: {
            name: play.artists[0] || 'Unknown Artist',
            genres: [] // We don't have genre data from recent plays
          },
          external_urls: play.external_urls,
          preview_url: play.preview_url,
          playCount: 1,
          totalListeningTime: play.duration_ms,
          listeningEvents: [{
            playedAt: play.played_at,
            msPlayed: play.duration_ms
          }]
        };
        newSongs.push(newSong);
        newSongsAdded++;
        console.log(`➕ Added new song: "${play.name}" by ${play.artists[0]}`);
      }
    });

    // Combine existing songs with new songs
    const allSongs = [...existingData.songs, ...newSongs];

    // Calculate updated metadata
    const totalListeningTime = allSongs.reduce((sum, song) => sum + song.totalListeningTime, 0);
    
    // Calculate earliest and latest dates efficiently without spreading large arrays
    let earliestTime: number | null = null;
    let latestTime: number | null = null;
    
    for (const song of allSongs) {
      for (const event of song.listeningEvents) {
        const time = new Date(event.playedAt).getTime();
        if (earliestTime === null || time < earliestTime) {
          earliestTime = time;
        }
        if (latestTime === null || time > latestTime) {
          latestTime = time;
        }
      }
    }
    
    const earliest = earliestTime !== null ? new Date(earliestTime).toISOString() : existingData.metadata.dateRange.earliest;
    const latest = latestTime !== null ? new Date(latestTime).toISOString() : existingData.metadata.dateRange.latest;

    console.log(`📊 Merge summary:`);
    console.log(`- Existing songs updated: ${existingSongsUpdated}`);
    console.log(`- New songs added: ${newSongsAdded}`);
    if (duplicatesSkipped > 0) {
      console.log(`- Duplicates skipped: ${duplicatesSkipped}`);
    }
    console.log(`- Total recent plays processed: ${recentPlays.length}`);
    console.log(`- Total songs now: ${allSongs.length}`);

    return {
      songs: allSongs,
      metadata: {
        totalSongs: allSongs.length,
        totalListeningTime,
        dateRange: {
          earliest,
          latest
        },
        source: 'Merged Streaming History',
        lastUpdated: new Date().toISOString()
      }
    };
  }

  /**
   * Save merged data to file
   */
  private saveMergedData(data: CompleteListeningHistory): string {
    const timestamp = Date.now();
    const filename = `merged-streaming-history-${timestamp}.json`;
    const filePath = path.join(this.mergedDir, filename);

    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`💾 Saved merged data to: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error(`❌ Error saving merged data:`, error);
      throw error;
    }
  }

  /**
   * Clean up temporary recent-plays files
   */
  private cleanupTempFiles(): void {
    console.log('🧹 Cleaning up temporary recent-plays files...');
    
    try {
      const files = fs.readdirSync(this.tempDir)
        .filter(file => file.startsWith('temp-recent-plays-') && file.endsWith('.json'));

      files.forEach(file => {
        const filePath = path.join(this.tempDir, file);
        fs.unlinkSync(filePath);
        console.log(`   ✅ Deleted ${file}`);
      });
    } catch (error) {
      console.error(`⚠️  Error cleaning up temp files:`, error);
    }
  }

  /**
   * Clean up old merged streaming history files (keep only the latest)
   */
  private cleanupOldMergedFiles(keepFile: string): void {
    try {
      if (!fs.existsSync(this.mergedDir)) {
        return;
      }

      const files = fs.readdirSync(this.mergedDir)
        .filter(file => file.startsWith('merged-streaming-history-') && file.endsWith('.json'));

      const keepFileName = path.basename(keepFile);
      let deletedCount = 0;

      files.forEach(file => {
        if (file !== keepFileName) {
          const filePath = path.join(this.mergedDir, file);
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      });

      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} old merged streaming history file(s)`);
      }
    } catch (error) {
      console.error('⚠️  Error cleaning up old merged files:', error);
    }
  }

  /**
   * Main merge process
   */
  public async merge(): Promise<void> {
    try {
      console.log('🔄 Starting data merge process...');

      // Find latest recent plays file
      const recentPlaysFile = this.findLatestRecentPlaysFile();
      if (!recentPlaysFile) {
        console.error('❌ No recent-plays files found');
        console.error('❌ No recent plays data to merge');
        process.exit(1);
      }

      console.log(`📁 Loading recent plays from: ${recentPlaysFile}`);
      const recentPlays = this.loadRecentPlays(recentPlaysFile);

      // Find latest merged file
      const existingDataFile = this.findLatestMergedFile();
      if (!existingDataFile) {
        console.error('❌ No existing merged data found');
        console.error('❌ Cannot merge without existing data (run merge-streaming-history first or ensure repo has merged file)');
        process.exit(1);
      }

      console.log(`📁 Loading existing data from: ${existingDataFile}`);
      const existingData = this.loadExistingData(existingDataFile);

      // Merge the data
      const mergedData = this.mergeData(existingData, recentPlays);

      // Save merged data
      const savedFilePath = this.saveMergedData(mergedData);

      // Clean up old merged files (keep only the new one)
      this.cleanupOldMergedFiles(savedFilePath);

      // Clean up temp files
      this.cleanupTempFiles();

      console.log('🎉 Data merge completed successfully!');

    } catch (error) {
      console.error('❌ Merge process failed:', error);
      throw error;
    }
  }
}

// Run the merge process
const merger = new DataMerger();
merger.merge().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
