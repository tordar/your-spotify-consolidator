import * as fs from 'fs';
import * as readline from 'readline';

interface RawTrack {
  _id: string;
  id: string;
  name: string;
  duration_ms: number;
  artists: string[];
  album: string;
  external_urls: {
    spotify: string;
  };
  preview_url: string | null;
}

interface RawArtist {
  _id: string;
  id: string;
  name: string;
  genres: string[];
  images: Array<{
    height: number;
    url: string;
    width: number;
  }>;
  external_urls: {
    spotify: string;
  };
}

interface RawAlbum {
  _id: string;
  id: string;
  name: string;
  images: Array<{
    height: number;
    url: string;
    width: number;
  }>;
  artists: string[];
  external_urls: {
    spotify: string;
  };
}

interface RawListeningEvent {
  _id: string;
  id: string;
  played_at: {
    $date: string;
  };
  durationMs: number;
  albumId: string;
  artistIds: string[];
  primaryArtistId: string;
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

class MemoryEfficientHistoryBuilder {
  private tracks: Map<string, RawTrack> = new Map();
  private artists: Map<string, RawArtist> = new Map();
  private albums: Map<string, RawAlbum> = new Map();
  private trackPlayCounts = new Map<string, number>();
  private trackTotalTime = new Map<string, number>();
  private trackListeningEvents = new Map<string, Array<{playedAt: string, msPlayed: number}>>();
  private allDates: Date[] = [];

  /**
   * Load data files line by line to avoid memory issues
   */
  private async loadDataFile<T>(filePath: string, processor: (data: T) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const fileStream = fs.createReadStream(filePath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      let count = 0;
      rl.on('line', (line) => {
        if (line.trim()) {
          try {
            const data = JSON.parse(line) as T;
            processor(data);
            count++;
            if (count % 10000 === 0) {
              console.log(`📊 Processed ${count.toLocaleString()} lines from ${filePath.split('/').pop()}`);
            }
          } catch (error) {
            console.log(`⚠️  Skipping malformed line in ${filePath}: ${line.substring(0, 100)}...`);
          }
        }
      });

      rl.on('close', () => {
        console.log(`✅ Loaded ${count.toLocaleString()} items from ${filePath.split('/').pop()}`);
        resolve();
      });

      rl.on('error', reject);
    });
  }

  /**
   * Load all raw data files efficiently
   */
  private async loadRawData(): Promise<void> {
    console.log('📁 Loading raw MongoDB data efficiently...');

    // Load tracks
    console.log('🎵 Loading tracks...');
    await this.loadDataFile<RawTrack>('raw-mongo-data/raw_tracks.json', (track) => {
      this.tracks.set(track.id, track); // Store by track.id, not _id
    });

    // Load artists
    console.log('👤 Loading artists...');
    await this.loadDataFile<RawArtist>('raw-mongo-data/raw_artists.json', (artist) => {
      this.artists.set(artist.id, artist); // Store by artist.id
    });

    // Load albums
    console.log('💿 Loading albums...');
    await this.loadDataFile<RawAlbum>('raw-mongo-data/raw_albums.json', (album) => {
      this.albums.set(album.id, album); // Store by album.id
    });

    // Load listening history and process immediately
    console.log('📊 Processing listening history...');
    await this.loadDataFile<RawListeningEvent>('raw-mongo-data/raw_listening_history.json', (event) => {
      const trackId = event.id;
      
      // Count plays
      this.trackPlayCounts.set(trackId, (this.trackPlayCounts.get(trackId) || 0) + 1);
      
      // Sum listening time
      this.trackTotalTime.set(trackId, (this.trackTotalTime.get(trackId) || 0) + event.durationMs);
      
      // Store listening events (limit to avoid memory issues)
      if (!this.trackListeningEvents.has(trackId)) {
        this.trackListeningEvents.set(trackId, []);
      }
      const events = this.trackListeningEvents.get(trackId)!;
      if (events.length < 100) { // Limit to last 100 events per song
        events.push({
          playedAt: event.played_at.$date,
          msPlayed: event.durationMs
        });
      }
      
      // Collect dates for range calculation
      this.allDates.push(new Date(event.played_at.$date));
    });

    console.log(`📈 Found ${this.trackPlayCounts.size} unique tracks with listening data`);
  }

  /**
   * Build complete listening history
   */
  private buildCompleteHistoryData(): CompleteListeningHistory {
    console.log('🔄 Building complete listening history...');

    // Build complete songs
    const completeSongs: CompleteSong[] = [];
    let processedCount = 0;

    for (const [trackId, playCount] of this.trackPlayCounts) {
      const track = this.tracks.get(trackId);
      if (!track) {
        continue;
      }

      // Get artist data
      const primaryArtistId = track.artists[0];
      const artistData = this.artists.get(primaryArtistId);
      
      // Get album data
      const albumData = this.albums.get(track.album);

      // Get all artist names
      const artistNames = track.artists.map(artistId => {
        const artist = this.artists.get(artistId);
        return artist ? artist.name : 'Unknown Artist';
      });

      const completeSong: CompleteSong = {
        songId: track.id,
        name: track.name,
        duration_ms: track.duration_ms,
        artists: artistNames,
        album: {
          id: track.album,
          name: albumData?.name || 'Unknown Album',
          images: albumData?.images || []
        },
        artist: {
          name: artistData?.name || 'Unknown Artist',
          genres: artistData?.genres || []
        },
        external_urls: track.external_urls,
        preview_url: track.preview_url,
        playCount: playCount,
        totalListeningTime: this.trackTotalTime.get(trackId) || 0,
        listeningEvents: this.trackListeningEvents.get(trackId) || []
      };

      completeSongs.push(completeSong);
      processedCount++;

      if (processedCount % 1000 === 0) {
        console.log(`📊 Processed ${processedCount}/${this.trackPlayCounts.size} songs...`);
      }
    }

    // Sort by play count (descending)
    completeSongs.sort((a, b) => b.playCount - a.playCount);

    // Calculate metadata
    const totalListeningEvents = Array.from(this.trackPlayCounts.values()).reduce((sum, count) => sum + count, 0);
    const totalListeningTime = completeSongs.reduce((sum, song) => sum + song.totalListeningTime, 0);
    
    // Find date range
    this.allDates.sort();
    const earliest = this.allDates[0]?.toISOString() || '';
    const latest = this.allDates[this.allDates.length - 1]?.toISOString() || '';

    const completeHistory: CompleteListeningHistory = {
      metadata: {
        totalSongs: completeSongs.length,
        totalListeningEvents: totalListeningEvents,
        totalListeningTime: totalListeningTime,
        dateRange: {
          earliest: earliest,
          latest: latest
        },
        timestamp: new Date().toISOString(),
        source: 'MongoDB Export'
      },
      songs: completeSongs
    };

    console.log(`🎉 Built complete history with ${completeSongs.length} songs`);
    console.log(`📊 Total listening events: ${totalListeningEvents.toLocaleString()}`);
    console.log(`⏱️  Total listening time: ${Math.round(totalListeningTime / 1000 / 60 / 60)} hours`);
    console.log(`📅 Date range: ${earliest.split('T')[0]} to ${latest.split('T')[0]}`);

    return completeHistory;
  }

  /**
   * Save complete listening history
   */
  private saveCompleteHistory(history: CompleteListeningHistory): void {
    const timestamp = Date.now();
    const filename = `complete-listening-history-${timestamp}.json`;
    
    console.log(`💾 Saving complete listening history to: ${filename}`);
    fs.writeFileSync(filename, JSON.stringify(history, null, 2));
    console.log(`✅ Complete listening history saved!`);
    
    // Also save a summary
    const summaryFilename = `complete-history-summary-${timestamp}.json`;
    const summary = {
      metadata: history.metadata,
      topSongs: (history.songs || []).slice(0, 100).map(song => ({
        name: song.name,
        artist: song.artist.name,
        playCount: song.playCount,
        totalListeningTime: song.totalListeningTime
      }))
    };
    
    fs.writeFileSync(summaryFilename, JSON.stringify(summary, null, 2));
    console.log(`📋 Summary saved to: ${summaryFilename}`);
  }

  /**
   * Main function to build complete listening history
   */
  async buildCompleteHistory(): Promise<void> {
    try {
      console.log('🚀 Building Complete Listening History from MongoDB Data (Memory Efficient)');
      console.log('=======================================================================');
      
      // Load all raw data efficiently
      await this.loadRawData();
      
      // Build complete history
      const completeHistory = this.buildCompleteHistoryData();
      
      // Save results
      this.saveCompleteHistory(completeHistory);
      
      console.log('');
      console.log('🎉 Complete listening history built successfully!');
      console.log('');
      console.log('📊 Summary:');
      console.log(`- Total songs: ${completeHistory.metadata.totalSongs.toLocaleString()}`);
      console.log(`- Total plays: ${completeHistory.metadata.totalListeningEvents.toLocaleString()}`);
      console.log(`- Total listening time: ${Math.round(completeHistory.metadata.totalListeningTime / 1000 / 60 / 60)} hours`);
      console.log(`- Date range: ${completeHistory.metadata.dateRange.earliest.split('T')[0]} to ${completeHistory.metadata.dateRange.latest.split('T')[0]}`);
      console.log('');
      console.log('🔮 This complete dataset can now be used to:');
      console.log('- Merge with recent Spotify plays');
      console.log('- Generate accurate top 500 rankings');
      console.log('- Track song movements up/down the charts');
      console.log('- Provide comprehensive listening analytics');
      
    } catch (error) {
      console.error('💥 Failed to build complete listening history:', error);
      process.exit(1);
    }
  }
}

// Run the script if called directly
if (require.main === module) {
  const builder = new MemoryEfficientHistoryBuilder();
  builder.buildCompleteHistory();
}

export { MemoryEfficientHistoryBuilder };
