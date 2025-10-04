import * as fs from 'fs';
import * as path from 'path';
import { SpotifyTokenManager } from './spotify-token-manager';

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
    uri: string;
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
    source: string;
    apiCallsUsed?: number;
    tracksEnriched?: number;
    batchesProcessed?: number;
  };
  songs: CompleteSong[];
}

class StreamingHistoryEnricher {
  private tokenManager: SpotifyTokenManager;
  private trackMetadataCache = new Map<string, any>();
  private apiCallCount = 0;
  private processedCount = 0;

  // Ultra-conservative rate limiting to avoid penalties
  private readonly BATCH_SIZE = 1; // 1 track = 3 API calls per batch
  private readonly CONCURRENT_REQUESTS = 1; // Sequential processing
  private readonly RETRY_DELAY = 30000; // 30 seconds (fallback)
  private readonly MAX_RETRIES = 3;
  private readonly BATCH_DELAY = 5000; // 5 seconds between batches
  private readonly TRACK_DELAY = 1000; // 1 second between individual API calls

  constructor() {
    this.tokenManager = new SpotifyTokenManager();
  }

  /**
   * Load the latest merged streaming history file or existing enriched file
   */
  loadLatestMergedFile(): MergedStreamingHistory {
    const mergedDir = './merged-streaming-history';
    
    if (!fs.existsSync(mergedDir)) {
      throw new Error(`Directory ${mergedDir} does not exist. Please run merge-streaming-history.ts first.`);
    }

    // First, check if there's an existing enriched file to resume from
    const enrichedFile = path.join(mergedDir, 'enriched-streaming-history.json');
    
    if (fs.existsSync(enrichedFile)) {
      console.log(`📖 Resuming from existing enriched file: enriched-streaming-history.json`);
      const data = fs.readFileSync(enrichedFile, 'utf8');
      return JSON.parse(data);
    }

    // Otherwise, load the latest merged file
    const mergedFiles = fs.readdirSync(mergedDir)
      .filter(file => file.startsWith('merged-streaming-history-') && file.endsWith('.json'))
      .sort()
      .reverse();

    if (mergedFiles.length === 0) {
      throw new Error(`No merged-streaming-history files found in ${mergedDir}`);
    }

    const latestFile = path.join(mergedDir, mergedFiles[0]);
    console.log(`📖 Loading latest merged file: ${mergedFiles[0]}`);
    
    const data = fs.readFileSync(latestFile, 'utf8');
    return JSON.parse(data);
  }

  /**
   * Fetch track metadata from Spotify API with proper rate limit handling
   */
  async fetchTrackMetadata(trackId: string): Promise<any> {
    const accessToken = await this.tokenManager.getValidAccessToken();
    
    // Fetch track data
    const trackData = await this.makeApiCall(`https://api.spotify.com/v1/tracks/${trackId}`, accessToken);
    
    // Small delay between API calls
    await new Promise(resolve => setTimeout(resolve, this.TRACK_DELAY));
    
    // Fetch artist data for genres
    const artistId = trackData.artists[0].id;
    const artistData = await this.makeApiCall(`https://api.spotify.com/v1/artists/${artistId}`, accessToken);
    
    // Small delay between API calls
    await new Promise(resolve => setTimeout(resolve, this.TRACK_DELAY));
    
    // Fetch album data for images
    const albumId = trackData.album.id;
    const albumData = await this.makeApiCall(`https://api.spotify.com/v1/albums/${albumId}`, accessToken);

    return {
      track: trackData,
      artist: artistData,
      album: albumData
    };
  }

  /**
   * Make API call with proper rate limit handling
   */
  async makeApiCall(url: string, accessToken: string): Promise<any> {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (response.status === 429) {
      // Handle rate limiting with Retry-After header
      const retryAfter = response.headers.get('Retry-After');
      console.log(`🔍 Retry-After header value: "${retryAfter}"`);
      console.log(`🔍 All response headers:`, Object.fromEntries(response.headers.entries()));
      
      // If the value seems unreasonable, ignore it and use a sensible default
      const parsedRetryAfter = retryAfter ? parseInt(retryAfter) : null;
      const reasonableWaitTime = (parsedRetryAfter && parsedRetryAfter > 0 && parsedRetryAfter <= 300) 
        ? parsedRetryAfter * 1000 
        : 30000; // Default to 30 seconds if unreasonable
      
      console.log(`⏳ Rate limited. Using wait time: ${reasonableWaitTime / 1000}s`);
      await new Promise(resolve => setTimeout(resolve, reasonableWaitTime));
      
      // Retry the same request
      return this.makeApiCall(url, accessToken);
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    this.apiCallCount++;
    return await response.json();
  }

  /**
   * Process a batch of tracks with retry logic
   */
  async processBatch(trackIds: string[]): Promise<void> {
    for (const trackId of trackIds) {
      let retries = 0;
      let success = false;

      while (retries < this.MAX_RETRIES && !success) {
        try {
          if (this.trackMetadataCache.has(trackId)) {
            // Skip if already cached
            success = true;
            continue;
          }

          const metadata = await this.fetchTrackMetadata(trackId);
          this.trackMetadataCache.set(trackId, metadata);
          success = true;

          // Small delay between individual track fetches
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          retries++;
          if (retries >= this.MAX_RETRIES) {
            console.error(`❌ Failed to fetch metadata for track ${trackId} after ${this.MAX_RETRIES} retries`);
            // Continue with next track instead of failing completely
            success = true;
          } else {
            console.log(`⏳ Retrying track ${trackId} (attempt ${retries + 1}/${this.MAX_RETRIES})...`);
            await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
          }
        }
      }

      this.processedCount++;
      if (this.processedCount % 100 === 0) {
        console.log(`📊 Progress: ${this.processedCount}/${trackIds.length} tracks processed`);
      }
    }
  }

  /**
   * Check if a track already has metadata
   */
  hasMetadata(song: CompleteSong): boolean {
    return song.duration_ms > 0 && 
           song.album.id !== '' && 
           song.album.images.length > 0 && 
           song.artist.genres.length > 0 &&
           song.external_urls.spotify.startsWith('https://');
  }

  /**
   * Enrich all unique tracks with metadata
   */
  async enrichUniqueTracks(trackIds: string[], originalData: MergedStreamingHistory): Promise<void> {
    // Filter out tracks that already have metadata
    const songsNeedingEnrichment = originalData.songs.filter(song => !this.hasMetadata(song));
    const tracksNeedingEnrichment = songsNeedingEnrichment.map(song => song.songId);
    
    console.log(`🔍 Found ${tracksNeedingEnrichment.length} tracks needing enrichment (${trackIds.length - tracksNeedingEnrichment.length} already enriched)`);
    
    if (tracksNeedingEnrichment.length === 0) {
      console.log('✅ All tracks already have metadata!');
      return;
    }
    
    // Process tracks in batches
    for (let i = 0; i < tracksNeedingEnrichment.length; i += this.BATCH_SIZE) {
      const batch = tracksNeedingEnrichment.slice(i, i + this.BATCH_SIZE);
      const batchNumber = Math.floor(i / this.BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(tracksNeedingEnrichment.length / this.BATCH_SIZE);
      
      console.log(`📡 Processing batch ${batchNumber}/${totalBatches} (${batch.length} tracks)...`);
      
      try {
        await this.processBatch(batch);
        
        // Save progress every 5 batches (100 tracks)
        if (batchNumber % 5 === 0) {
          console.log(`💾 Saving progress after ${batchNumber} batches (${this.trackMetadataCache.size} tracks enriched)...`);
          await this.saveProgress(originalData, batchNumber);
        }
        
      } catch (error) {
        console.error(`❌ Batch ${batchNumber} failed, continuing with next batch:`, error);
        // Continue processing even if a batch fails
      }
      
      // Delay between batches to respect rate limits
      if (i + this.BATCH_SIZE < tracksNeedingEnrichment.length) {
        await new Promise(resolve => setTimeout(resolve, this.BATCH_DELAY));
      }
    }
  }

  /**
   * Save progress with partially enriched data
   */
  async saveProgress(originalData: MergedStreamingHistory, batchNumber: number): Promise<void> {
    const enrichedSongs = this.enrichSongs(originalData.songs);
    
    const progressData: MergedStreamingHistory = {
      ...originalData,
      metadata: {
        ...originalData.metadata,
        source: 'Spotify Extended Streaming History + API Enrichment',
        timestamp: new Date().toISOString(),
        apiCallsUsed: this.apiCallCount,
        tracksEnriched: this.trackMetadataCache.size,
        batchesProcessed: batchNumber
      },
      songs: enrichedSongs
    };

    // Use consistent filename for resumable enrichment
    const enrichedFile = path.join('./merged-streaming-history', 'enriched-streaming-history.json');
    
    fs.writeFileSync(enrichedFile, JSON.stringify(progressData, null, 2));
    console.log(`💾 Progress saved to: ${enrichedFile}`);
  }

  /**
   * Enrich songs with metadata from cache
   */
  enrichSongs(songs: CompleteSong[]): CompleteSong[] {
    console.log('🔄 Enriching songs with fetched metadata...');
    
    return songs.map(song => {
      const metadata = this.trackMetadataCache.get(song.songId);
      
      if (metadata) {
        return {
          ...song,
          duration_ms: metadata.track.duration_ms, // Actual track duration
          artists: metadata.track.artists.map((artist: any) => artist.name),
          album: {
            id: metadata.album.id,
            name: metadata.album.name,
            images: metadata.album.images || []
          },
          artist: {
            name: metadata.artist.name,
            genres: metadata.artist.genres || []
          },
          external_urls: {
            spotify: metadata.track.external_urls.spotify,
            uri: song.external_urls.spotify // Keep original URI
          },
          preview_url: metadata.track.preview_url
        };
      }
      
      // Return original song if no metadata found
      return song;
    });
  }

  /**
   * Main enrichment process
   */
  async enrichStreamingHistory(): Promise<void> {
    console.log('🎵 Starting streaming history enrichment...');
    
    // Load the latest merged file
    const mergedData = this.loadLatestMergedFile();
    console.log(`📊 Loaded ${mergedData.songs.length} songs to enrich`);

    // Extract unique track IDs
    const trackIds = mergedData.songs.map(song => song.songId);
    console.log(`🔍 Found ${trackIds.length} unique tracks to enrich`);

    // Enrich tracks with metadata
    await this.enrichUniqueTracks(trackIds, mergedData);

    // Enrich songs with fetched metadata
    const enrichedSongs = this.enrichSongs(mergedData.songs);

    // Update metadata
    const enrichedData: MergedStreamingHistory = {
      ...mergedData,
      metadata: {
        ...mergedData.metadata,
        source: 'Spotify Extended Streaming History + API Enrichment',
        timestamp: new Date().toISOString(),
        apiCallsUsed: this.apiCallCount,
        tracksEnriched: this.trackMetadataCache.size
      },
      songs: enrichedSongs
    };

    // Save enriched data
    const outputFile = path.join('./merged-streaming-history', 'enriched-streaming-history.json');
    
    console.log(`💾 Saving enriched data to ${outputFile}...`);
    fs.writeFileSync(outputFile, JSON.stringify(enrichedData, null, 2));

    // Summary
    console.log('\n📊 --- ENRICHMENT SUMMARY ---');
    console.log(`🎵 Total songs: ${enrichedSongs.length.toLocaleString()}`);
    console.log(`📡 API calls used: ${this.apiCallCount}`);
    console.log(`✅ Tracks enriched: ${this.trackMetadataCache.size}`);
    console.log(`💾 Output file: ${outputFile}`);
    console.log('🎉 Enrichment completed successfully!');
  }
}

// Run the script if called directly
if (require.main === module) {
  const enricher = new StreamingHistoryEnricher();
  enricher.enrichStreamingHistory()
    .then(() => {
      console.log('✅ Streaming history enrichment completed!');
    })
    .catch((error) => {
      console.error('💥 Enrichment failed:', error);
      process.exit(1);
    });
}

export { StreamingHistoryEnricher };