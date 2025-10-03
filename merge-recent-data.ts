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

interface ExistingSong {
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

interface ExistingData {
  metadata: {
    originalTotalSongs: number;
    consolidatedTotalSongs: number;
    duplicatesRemoved: number;
    consolidationRate: number;
    timestamp: string;
    source: string;
    totalListeningEvents: number;
  };
  songs: ExistingSong[];
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
   * Find the most recent cleaned songs file
   */
  private findLatestCleanedSongsFile(): string | null {
    const files = glob.sync('cleaned-data/cleaned-songs-*.json');
    if (files.length === 0) {
      console.log('⚠️  No cleaned-songs files found');
      return null;
    }
    
    // Sort by timestamp (newest first)
    files.sort((a, b) => {
      const timestampA = parseInt(a.match(/cleaned-songs-(\d+)\.json/)?.[1] || '0');
      const timestampB = parseInt(b.match(/cleaned-songs-(\d+)\.json/)?.[1] || '0');
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
   * Load existing consolidated data
   */
  private loadExistingData(filename: string): ExistingData {
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
  private mergeData(existingData: ExistingData, recentPlays: RecentPlayData[]): ExistingData {
    console.log('🔄 Merging recent plays with existing data...');
    
    // Create a map of existing songs for quick lookup
    const existingSongsMap = new Map<string, ExistingSong>();
    existingData.songs.forEach(song => {
      const key = `${song.song.name.toLowerCase().trim()}|${song.artist.name.toLowerCase().trim()}`;
      existingSongsMap.set(key, song);
    });

    let newSongsAdded = 0;
    let existingSongsUpdated = 0;

    // Process each recent play
    recentPlays.forEach(play => {
      const key = `${play.name.toLowerCase().trim()}|${play.artists[0]?.toLowerCase().trim() || 'unknown'}`;
      
      if (existingSongsMap.has(key)) {
        // Update existing song
        const existingSong = existingSongsMap.get(key)!;
        existingSong.count += 1;
        existingSong.consolidated_count += 1;
        existingSong.duration_ms += play.duration_ms;
        existingSong.original_songIds.push(play.id);
        existingSongsUpdated++;
        
        console.log(`🔄 Updated: "${play.name}" by ${play.artists[0]} (+1 play)`);
      } else {
        // Add new song
        const newSong: ExistingSong = {
          duration_ms: play.duration_ms,
          count: 1,
          songId: play.id,
          song: {
            name: play.name,
            preview_url: play.preview_url,
            external_urls: play.external_urls
          },
          album: {
            name: play.album.name,
            images: play.album.images
          },
          artist: {
            name: play.artists[0] || 'Unknown Artist',
            genres: [] // We don't have genre data from recent plays
          },
          consolidated_count: 1,
          original_songIds: [play.id]
        };
        
        existingData.songs.push(newSong);
        newSongsAdded++;
        
        console.log(`➕ Added: "${play.name}" by ${play.artists[0]} (new song)`);
      }
    });

    // Update metadata
    existingData.metadata.originalTotalSongs += newSongsAdded;
    existingData.metadata.consolidatedTotalSongs = existingData.songs.length;
    existingData.metadata.totalListeningEvents += recentPlays.length;
    existingData.metadata.timestamp = new Date().toISOString();

    console.log(`📊 Merge summary:`);
    console.log(`- New songs added: ${newSongsAdded}`);
    console.log(`- Existing songs updated: ${existingSongsUpdated}`);
    console.log(`- Total recent plays processed: ${recentPlays.length}`);

    return existingData;
  }

  /**
   * Save merged data
   */
  private saveMergedData(data: ExistingData): void {
    const timestamp = Date.now();
    const filename = `cleaned-data/cleaned-songs-${timestamp}.json`;
    
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
      const existingDataFile = this.findLatestCleanedSongsFile();
      
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
