import * as fs from 'fs';
import { glob } from 'glob';

interface RecentPlayData {
  id: string;
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
  external_urls: {
    spotify: string;
  };
  preview_url: string | null;
  played_at: string;
}

interface RecentPlaysFile {
  metadata: {
    totalPlays: number;
    timestamp: string;
    source: string;
  };
  plays: RecentPlayData[];
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

class DataMerger {
  /**
   * Find the most recent recent-plays file
   */
  private findLatestRecentPlaysFile(): string | null {
    const files = glob.sync('recent-plays-*.json');
    if (files.length === 0) {
      console.log('⚠️  No recent-plays files found');
      return null;
    }
    
    // Sort by timestamp (newest first)
    files.sort((a, b) => {
      const timestampA = parseInt(a.match(/recent-plays-(\d+)\.json/)?.[1] || '0');
      const timestampB = parseInt(b.match(/recent-plays-(\d+)\.json/)?.[1] || '0');
      return timestampB - timestampA;
    });
    
    return files[0];
  }

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
   * Load recent plays data
   */
  private loadRecentPlays(filename: string): RecentPlaysFile {
    try {
      const content = fs.readFileSync(filename, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load recent plays file: ${error}`);
    }
  }

  /**
   * Load existing complete listening history
   */
  private loadExistingData(filename: string): CompleteListeningHistory {
    try {
      const content = fs.readFileSync(filename, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load existing data file: ${error}`);
    }
  }

  /**
   * Merge recent plays with existing data
   */
  private mergeData(existingData: CompleteListeningHistory, recentPlays: RecentPlayData[]): CompleteListeningHistory {
    console.log('🔄 Merging recent plays with existing data...');
    
    // Create a map of existing songs for quick lookup
    const existingSongsMap = new Map<string, CompleteSong>();
    existingData.songs.forEach(song => {
      const key = `${song.name.toLowerCase().trim()}|${song.artists[0]?.toLowerCase().trim() || 'unknown'}`;
      existingSongsMap.set(key, song);
    });

    let existingSongsUpdated = 0;
    let newSongsAdded = 0;
    const newSongs: CompleteSong[] = [];

    // Process each recent play
    recentPlays.forEach(play => {
      const key = `${play.name.toLowerCase().trim()}|${play.artists[0]?.toLowerCase().trim() || 'unknown'}`;
      
      if (existingSongsMap.has(key)) {
        // Update existing song (maintains chronological position)
        const existingSong = existingSongsMap.get(key)!;
        existingSong.playCount += 1;
        existingSong.totalListeningTime += play.duration_ms;
        existingSong.listeningEvents.push({
          playedAt: play.played_at,
          msPlayed: play.duration_ms
        });
        existingSongsUpdated++;
        
        console.log(`🔄 Updated: "${play.name}" by ${play.artists[0]} (+1 play)`);
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
        console.log(`➕ Added: "${play.name}" by ${play.artists[0]} (new song)`);
      }
    });

    // Append new songs to the end (maintains chronological order)
    existingData.songs.push(...newSongs);

    // Update metadata
    existingData.metadata.totalSongs += newSongsAdded;
    existingData.metadata.totalListeningEvents += recentPlays.length;
    existingData.metadata.totalListeningTime += recentPlays.reduce((sum, play) => sum + play.duration_ms, 0);
    existingData.metadata.timestamp = new Date().toISOString();
    
    // Update date range if needed
    const allDates = existingData.songs.flatMap(song => 
      song.listeningEvents.map(event => new Date(event.playedAt))
    );
    allDates.sort((a, b) => a.getTime() - b.getTime());
    
    if (allDates.length > 0) {
      existingData.metadata.dateRange.earliest = allDates[0].toISOString();
      existingData.metadata.dateRange.latest = allDates[allDates.length - 1].toISOString();
    }

    console.log(`📊 Merge summary:`);
    console.log(`- Existing songs updated: ${existingSongsUpdated}`);
    console.log(`- New songs added: ${newSongsAdded}`);
    console.log(`- Total recent plays processed: ${recentPlays.length}`);
    console.log(`- Total songs now: ${existingData.metadata.totalSongs}`);

    return existingData;
  }

  /**
   * Save merged data
   */
  private saveMergedData(data: CompleteListeningHistory): void {
    const timestamp = Date.now();
    const filename = `complete-listening-history/complete-listening-history-${timestamp}.json`;
    
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`💾 Saved merged data to: ${filename}`);
  }

  /**
   * Main function to merge recent plays with existing data
   */
  async mergeRecentData(): Promise<void> {
    try {
      console.log('🔄 Starting data merge process...');
      
      // Find latest files
      const recentPlaysFile = this.findLatestRecentPlaysFile();
      const existingDataFile = this.findLatestCompleteHistoryFile();
      
      if (!recentPlaysFile) {
        console.log('⚠️  No recent plays data to merge');
        return;
      }
      
      if (!existingDataFile) {
        console.log('⚠️  No existing data to merge with');
        return;
      }
      
      console.log(`📁 Loading recent plays from: ${recentPlaysFile}`);
      console.log(`📁 Loading existing data from: ${existingDataFile}`);
      
      // Load data
      const recentPlaysData = this.loadRecentPlays(recentPlaysFile);
      const existingData = this.loadExistingData(existingDataFile);
      
      // Merge data
      const mergedData = this.mergeData(existingData, recentPlaysData.plays);
      
      // Save merged data
      this.saveMergedData(mergedData);
      
      console.log('🎉 Data merge completed successfully!');
    } catch (error) {
      console.error('💥 Data merge failed:', error);
      process.exit(1);
    }
  }
}

// Run the script if called directly
if (require.main === module) {
  const merger = new DataMerger();
  merger.mergeRecentData();
}

export { DataMerger };
