import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { SpotifyTokenManager } from './spotify-token-manager';

interface MergedHistoryMetadata {
  metadata?: {
    dateRange?: { latest: string };
  };
}

interface SpotifyTrack {
  id: string;
  name: string;
  duration_ms: number;
  artists: Array<{
    id: string;
    name: string;
  }>;
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
}

interface SpotifyPlay {
  track: SpotifyTrack;
  played_at: string;
}

interface SpotifyRecentPlaysResponse {
  items: SpotifyPlay[];
  next: string | null;
  cursors: {
    after: string;
    before: string;
  };
  limit: number;
  href: string;
}

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

class SpotifyRecentPlaysFetcher {
  private tokenManager: SpotifyTokenManager;

  constructor() {
    this.tokenManager = new SpotifyTokenManager();
  }

  /**
   * Check if there are new plays since the latest in merged history.
   * Returns true if we should fetch (new tracks, no history, or check failed).
   */
  async hasNewTracks(): Promise<boolean> {
    let files = glob.sync('data/merged-streaming-history/merged-streaming-history-*.json');
    if (files.length === 0) {
      console.log('ℹ️  No existing history found, will fetch recent plays');
      return true;
    }
    files.sort((a, b) => {
      const tsA = parseInt(a.match(/merged-streaming-history-(\d+)\.json/)?.[1] || '0');
      const tsB = parseInt(b.match(/merged-streaming-history-(\d+)\.json/)?.[1] || '0');
      return tsB - tsA;
    });
    const historyData = JSON.parse(fs.readFileSync(files[0], 'utf8')) as MergedHistoryMetadata;
    const latestTimestamp = historyData.metadata?.dateRange?.latest;
    if (!latestTimestamp) {
      console.log('ℹ️  No timestamp in history, will fetch recent plays');
      return true;
    }
    const latestHistoryTime = new Date(latestTimestamp).getTime();
    console.log(`📅 Latest track in history: ${latestTimestamp}`);

    const accessToken = await this.tokenManager.getValidAccessToken();
    const response = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=10', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      console.log('⚠️  Could not check recent plays, will fetch anyway');
      return true;
    }
    const data = (await response.json()) as { items: Array<{ played_at: string }> };
    if (!data.items?.length) {
      console.log('ℹ️  No recent plays from API');
      return false;
    }
    const hasNew = data.items.some(item => new Date(item.played_at).getTime() > latestHistoryTime);
    if (!hasNew) {
      console.log('ℹ️  No new tracks since last run');
    }
    return hasNew;
  }

  /**
   * Fetch recent plays from Spotify API
   */
  async fetchRecentPlays(limit: number = 50): Promise<RecentPlayData[]> {
    try {
      console.log('🎵 Fetching recent Spotify plays...');
      
      const accessToken = await this.tokenManager.getValidAccessToken();
      
      // Test the token first
      const isValid = await this.tokenManager.testToken(accessToken);
      if (!isValid) {
        throw new Error('Invalid access token');
      }

      const response = await fetch(`https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch recent plays: ${response.status} ${errorText}`);
      }

      const data = await response.json() as SpotifyRecentPlaysResponse;
      
      console.log(`✅ Fetched ${data.items.length} recent plays`);
      
      // Transform the data to match our format
      const recentPlays: RecentPlayData[] = data.items.map(play => ({
        id: play.track.id,
        name: play.track.name,
        duration_ms: play.track.duration_ms,
        artists: play.track.artists.map(artist => artist.name),
        album: {
          id: play.track.album.id,
          name: play.track.album.name,
          images: play.track.album.images
        },
        external_urls: play.track.external_urls,
        preview_url: play.track.preview_url,
        played_at: play.played_at
      }));

      return recentPlays;
    } catch (error) {
      console.error('❌ Failed to fetch recent plays:', error);
      throw error;
    }
  }

  /**
   * Save recent plays to a temporary JSON file
   */
  async saveRecentPlays(recentPlays: RecentPlayData[]): Promise<string> {
    try {
      const tempDir = 'temp';
      
      // Ensure temp directory exists
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const timestamp = Date.now();
      const filename = `temp-recent-plays-${timestamp}.json`;
      const filePath = path.join(tempDir, filename);
      
      const data = {
        metadata: {
          totalPlays: recentPlays.length,
          timestamp: new Date().toISOString(),
          source: 'Spotify API'
        },
        plays: recentPlays
      };

      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`💾 Saved recent plays to: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error('❌ Failed to save recent plays:', error);
      throw error;
    }
  }

  /**
   * Main: check for new tracks, then fetch and save recent plays if needed.
   * Exits 1 when there are no new tracks (so CI can skip merge step).
   */
  async fetchAndSaveRecentPlays(): Promise<string> {
    try {
      const shouldFetch = await this.hasNewTracks();
      if (!shouldFetch) {
        process.exit(1);
      }
      const recentPlays = await this.fetchRecentPlays();
      const filename = await this.saveRecentPlays(recentPlays);
      console.log('🎉 Recent plays fetch completed successfully!');
      return filename;
    } catch (error) {
      console.error('💥 Recent plays fetch failed:', error);
      process.exit(1);
    }
  }
}

// Run the script if called directly
if (require.main === module) {
  const fetcher = new SpotifyRecentPlaysFetcher();
  fetcher.fetchAndSaveRecentPlays();
}

export { SpotifyRecentPlaysFetcher };
