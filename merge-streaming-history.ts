import * as fs from 'fs';
import * as path from 'path';

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

interface MergedStreamingHistory {
  metadata: {
    totalSongs: number;
    totalPlayEvents: number;
    dateRange: {
      earliest: string;
      latest: string;
    };
    filesProcessed: string[];
    timestamp: string;
    source: 'Spotify Extended Streaming History';
  };
  songs: CompleteSong[];
}

class StreamingHistoryMerger {
  private historyDir = './spotify-history';
  private outputDir = './merged-streaming-history';

  constructor() {
    // No token manager needed for now
  }

  /**
   * Extract track ID from Spotify URI
   */
  extractTrackId(uri: string): string {
    return uri.replace('spotify:track:', '');
  }

  /**
   * Consolidate streaming history entries by song
   */
  consolidateBySong(entries: StreamingHistoryEntry[]): CompleteSong[] {
    console.log('🔄 Consolidating entries by song...');
    
    const songMap = new Map<string, CompleteSong>();
    
    entries.forEach(entry => {
      const songId = this.extractTrackId(entry.spotify_track_uri);
      
      if (songMap.has(songId)) {
        const existingSong = songMap.get(songId)!;
        existingSong.playCount++;
        existingSong.totalListeningTime += entry.ms_played;
        existingSong.listeningEvents.push({
          playedAt: entry.ts,
          msPlayed: entry.ms_played
        });
      } else {
        songMap.set(songId, {
          songId: songId,
          name: entry.master_metadata_track_name,
          duration_ms: 0, // Will be filled later with API data
          artists: [entry.master_metadata_album_artist_name],
          album: {
            id: '', // Will be filled later with API data
            name: entry.master_metadata_album_album_name,
            images: [] // Will be filled later with API data
          },
          artist: {
            name: entry.master_metadata_album_artist_name,
            genres: [] // Will be filled later with API data
          },
          external_urls: {
            spotify: entry.spotify_track_uri
          },
          preview_url: null, // Will be filled later with API data
          playCount: 1,
          totalListeningTime: entry.ms_played,
          listeningEvents: [{
            playedAt: entry.ts,
            msPlayed: entry.ms_played
          }]
        });
      }
    });
    
    // Sort listening events by playedAt date (earliest first)
    songMap.forEach(song => {
      song.listeningEvents.sort((a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime());
      // Keep duration_ms as 0 - will be filled by enrich script with actual track duration
    });
    
    console.log(`✅ Consolidated ${entries.length} entries into ${songMap.size} unique songs`);
    return Array.from(songMap.values());
  }

  /**
   * Get all streaming history files from the spotify-history directory
   */
  getStreamingHistoryFiles(): string[] {
    if (!fs.existsSync(this.historyDir)) {
      throw new Error(`Directory ${this.historyDir} does not exist. Please add your Spotify export files there.`);
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
   * Read and parse a single streaming history file, extracting only essential fields
   */
  readStreamingHistoryFile(filePath: string): StreamingHistoryEntry[] {
    try {
      console.log(`📖 Reading ${path.basename(filePath)}...`);
      const data = fs.readFileSync(filePath, 'utf8');
      const rawEntries = JSON.parse(data);
      
      if (!Array.isArray(rawEntries)) {
        throw new Error(`Invalid format: expected array, got ${typeof rawEntries}`);
      }

      // Extract only the essential fields and filter out podcasts/non-music content
      const entries: StreamingHistoryEntry[] = rawEntries
        .filter((rawEntry: any) => {
          // Only include entries with valid track URIs (music tracks) and actual listening time
          return rawEntry.spotify_track_uri && 
                 rawEntry.spotify_track_uri.startsWith('spotify:track:') &&
                 rawEntry.ms_played > 10000 &&
                 !rawEntry.episode_name && 
                 !rawEntry.episode_show_name && 
                 !rawEntry.spotify_episode_uri;
        })
        .map((rawEntry: any) => ({
          ts: rawEntry.ts,
          platform: rawEntry.platform,
          ms_played: rawEntry.ms_played,
          conn_country: rawEntry.conn_country,
          master_metadata_track_name: rawEntry.master_metadata_track_name,
          master_metadata_album_artist_name: rawEntry.master_metadata_album_artist_name,
          master_metadata_album_album_name: rawEntry.master_metadata_album_album_name,
          spotify_track_uri: rawEntry.spotify_track_uri
        }));

      console.log(`✅ Loaded ${entries.length} entries from ${path.basename(filePath)}`);
      return entries;
    } catch (error) {
      console.error(`❌ Error reading ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Merge all streaming history files into a consolidated dataset
   */
  async mergeStreamingHistory(): Promise<void> {
    console.log('🎵 Starting streaming history merge and consolidation...');
    
    // Get all files
    const files = this.getStreamingHistoryFiles();
    console.log(`📁 Found ${files.length} streaming history files`);

    // Read all files
    const allEntries: StreamingHistoryEntry[] = [];
    const processedFiles: string[] = [];

    for (const file of files) {
      const entries = this.readStreamingHistoryFile(file);
      allEntries.push(...entries);
      processedFiles.push(path.basename(file));
    }

    console.log(`📊 Total entries loaded: ${allEntries.length}`);

    // Sort by timestamp (earliest first)
    allEntries.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

    // Find date range
    const earliest = allEntries[0]?.ts;
    const latest = allEntries[allEntries.length - 1]?.ts;

    // Consolidate entries by song
    const consolidatedSongs = this.consolidateBySong(allEntries);

    // Create merged data structure
    const mergedData: MergedStreamingHistory = {
      metadata: {
        totalSongs: consolidatedSongs.length,
        totalPlayEvents: allEntries.length,
        dateRange: {
          earliest: earliest || '',
          latest: latest || ''
        },
        filesProcessed: processedFiles,
        timestamp: new Date().toISOString(),
        source: 'Spotify Extended Streaming History'
      },
      songs: consolidatedSongs
    };

    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Save merged data
    const timestamp = Date.now();
    const outputFile = path.join(this.outputDir, `merged-streaming-history-${timestamp}.json`);
    
    console.log(`💾 Saving consolidated data to ${outputFile}...`);
    fs.writeFileSync(outputFile, JSON.stringify(mergedData, null, 2));

    // Summary
    console.log('\n📊 --- MERGE SUMMARY ---');
    console.log(`🎵 Total play events: ${allEntries.length.toLocaleString()}`);
    console.log(`🎵 Unique songs: ${consolidatedSongs.length.toLocaleString()}`);
    console.log(`📅 Date range: ${earliest} to ${latest}`);
    console.log(`📁 Files processed: ${processedFiles.length}`);
    console.log(`💾 Output file: ${outputFile}`);
    console.log('🎉 Merge and consolidation completed successfully!');
  }
}

// Run the script if called directly
if (require.main === module) {
  const merger = new StreamingHistoryMerger();
  merger.mergeStreamingHistory()
    .then(() => {
      console.log('✅ Streaming history merge completed!');
    })
    .catch((error) => {
      console.error('💥 Merge failed:', error);
      process.exit(1);
    });
}

export { StreamingHistoryMerger };
