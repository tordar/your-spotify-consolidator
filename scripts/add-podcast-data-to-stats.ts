import * as fs from 'fs';
import * as path from 'path';

interface PodcastStreamingEntry {
  ts: string;
  ms_played: number;
  episode_name: string | null;
  episode_show_name: string | null;
  spotify_episode_uri: string | null;
}

interface DetailedStats {
  metadata: {
    timestamp: string;
    source: string;
  };
  stats: {
    yearlyListeningTime: Array<{
      year: string;
      totalListeningTimeMs: number;
      totalListeningHours: number;
      playCount: number;
      totalPodcastListeningTimeMs?: number;
      totalPodcastListeningHours?: number;
    }>;
    [key: string]: any;
  };
}

class PodcastDataAdder {
  private historyDir = './data/spotify-history';
  private statsDir = './data/cleaned-data';

  /**
   * Get all streaming history files from the spotify-history directory
   */
  getStreamingHistoryFiles(): string[] {
    if (!fs.existsSync(this.historyDir)) {
      throw new Error(`Directory ${this.historyDir} does not exist.`);
    }

    const files = fs.readdirSync(this.historyDir)
      .filter(file => file.startsWith('Streaming_History_Audio_') && file.endsWith('.json'))
      .map(file => path.join(this.historyDir, file));

    if (files.length === 0) {
      throw new Error(`No Streaming_History_Audio_*.json files found in ${this.historyDir}`);
    }

    return files;
  }

  /**
   * Read and extract podcast entries from a streaming history file
   */
  readPodcastEntries(filePath: string): PodcastStreamingEntry[] {
    try {
      console.log(`📖 Reading ${path.basename(filePath)}...`);
      const data = fs.readFileSync(filePath, 'utf8');
      const rawEntries = JSON.parse(data);
      
      if (!Array.isArray(rawEntries)) {
        throw new Error(`Invalid format: expected array, got ${typeof rawEntries}`);
      }

      // Filter for podcast entries (those with episode_name or episode_show_name)
      const podcastEntries: PodcastStreamingEntry[] = rawEntries
        .filter((rawEntry: any) => {
          // Include entries that have podcast/episode data
          return (rawEntry.episode_name || rawEntry.episode_show_name || rawEntry.spotify_episode_uri) &&
                 rawEntry.ms_played > 0;
        })
        .map((rawEntry: any) => ({
          ts: rawEntry.ts,
          ms_played: rawEntry.ms_played,
          episode_name: rawEntry.episode_name || null,
          episode_show_name: rawEntry.episode_show_name || null,
          spotify_episode_uri: rawEntry.spotify_episode_uri || null
        }));

      console.log(`✅ Found ${podcastEntries.length} podcast entries in ${path.basename(filePath)}`);
      return podcastEntries;
    } catch (error) {
      console.error(`❌ Error reading ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Calculate podcast listening time per year
   */
  calculateYearlyPodcastTime(entries: PodcastStreamingEntry[]): Map<string, number> {
    const yearlyMap = new Map<string, number>();

    entries.forEach(entry => {
      const eventDate = new Date(entry.ts);
      const year = eventDate.getFullYear().toString();
      
      if (!yearlyMap.has(year)) {
        yearlyMap.set(year, 0);
      }
      
      const currentTotal = yearlyMap.get(year)!;
      yearlyMap.set(year, currentTotal + entry.ms_played);
    });

    return yearlyMap;
  }

  /**
   * Find the latest detailed-stats file
   */
  findLatestStatsFile(): string {
    if (!fs.existsSync(this.statsDir)) {
      throw new Error(`Directory ${this.statsDir} does not exist.`);
    }

    const files = fs.readdirSync(this.statsDir)
      .filter(file => file.startsWith('detailed-stats-') && file.endsWith('.json'))
      .map(file => ({
        name: file,
        path: path.join(this.statsDir, file),
        timestamp: parseInt(file.match(/detailed-stats-(\d+)\.json/)?.[1] || '0')
      }))
      .sort((a, b) => b.timestamp - a.timestamp); // Sort by timestamp descending (newest first)

    if (files.length === 0) {
      throw new Error(`No detailed-stats-*.json files found in ${this.statsDir}`);
    }

    return files[0].path;
  }

  /**
   * Add podcast data to the detailed-stats file
   */
  async addPodcastDataToStats(): Promise<void> {
    console.log('🎙️  Starting podcast data extraction and stats update...');
    
    // Get all streaming history files
    const files = this.getStreamingHistoryFiles();
    console.log(`📁 Found ${files.length} streaming history files`);

    // Read all podcast entries
    const allPodcastEntries: PodcastStreamingEntry[] = [];
    for (const file of files) {
      const entries = this.readPodcastEntries(file);
      allPodcastEntries.push(...entries);
    }

    console.log(`📊 Total podcast entries loaded: ${allPodcastEntries.length}`);

    // Calculate yearly podcast listening time
    const yearlyPodcastTime = this.calculateYearlyPodcastTime(allPodcastEntries);
    
    console.log('\n📈 Yearly podcast listening time:');
    yearlyPodcastTime.forEach((ms, year) => {
      const hours = Math.round((ms / (1000 * 60 * 60)) * 100) / 100;
      console.log(`   ${year}: ${hours.toLocaleString()} hours (${ms.toLocaleString()} ms)`);
    });

    // Find and read the latest detailed-stats file
    const statsFilePath = this.findLatestStatsFile();
    console.log(`\n📄 Found latest stats file: ${path.basename(statsFilePath)}`);
    
    const statsFileContent = fs.readFileSync(statsFilePath, 'utf8');
    const statsData: DetailedStats = JSON.parse(statsFileContent);

    // Add podcast data to each year entry
    let updatedCount = 0;
    statsData.stats.yearlyListeningTime.forEach(yearData => {
      const podcastMs = yearlyPodcastTime.get(yearData.year) || 0;
      const podcastHours = Math.round((podcastMs / (1000 * 60 * 60)) * 100) / 100;
      
      yearData.totalPodcastListeningTimeMs = podcastMs;
      yearData.totalPodcastListeningHours = podcastHours;
      
      if (podcastMs > 0) {
        updatedCount++;
      }
    });

    console.log(`\n✅ Updated ${updatedCount} years with podcast data`);

    // Save the updated stats file
    console.log(`💾 Saving updated stats to ${statsFilePath}...`);
    fs.writeFileSync(statsFilePath, JSON.stringify(statsData, null, 2));

    // Summary
    const totalPodcastMs = Array.from(yearlyPodcastTime.values()).reduce((sum, ms) => sum + ms, 0);
    const totalPodcastHours = Math.round((totalPodcastMs / (1000 * 60 * 60)) * 100) / 100;
    
    console.log('\n📊 --- PODCAST DATA SUMMARY ---');
    console.log(`🎙️  Total podcast entries: ${allPodcastEntries.length.toLocaleString()}`);
    console.log(`⏱️  Total podcast listening time: ${totalPodcastHours.toLocaleString()} hours`);
    console.log(`📅 Years with podcast data: ${updatedCount}`);
    console.log(`💾 Updated file: ${statsFilePath}`);
    console.log('🎉 Podcast data addition completed successfully!');
  }
}

// Run the script if called directly
if (require.main === module) {
  const adder = new PodcastDataAdder();
  adder.addPodcastDataToStats()
    .then(() => {
      console.log('✅ Podcast data addition completed!');
    })
    .catch((error) => {
      console.error('💥 Podcast data addition failed:', error);
      process.exit(1);
    });
}

export { PodcastDataAdder };
