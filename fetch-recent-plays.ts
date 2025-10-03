import * as fs from 'fs';
import { SpotifyTokenManager } from './spotify-token-manager';

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

      const data: SpotifyRecentPlaysResponse = await response.json();
      
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
   * Save recent plays to a JSON file
   */
  async saveRecentPlays(recentPlays: RecentPlayData[]): Promise<void> {
    try {
      const timestamp = Date.now();
      const filename = `recent-plays-${timestamp}.json`;
      
      const data = {
        metadata: {
          totalPlays: recentPlays.length,
          timestamp: new Date().toISOString(),
          source: 'Spotify API'
        },
        plays: recentPlays
      };

      fs.writeFileSync(filename, JSON.stringify(data, null, 2));
      console.log(`💾 Saved recent plays to: ${filename}`);
    } catch (error) {
      console.error('❌ Failed to save recent plays:', error);
      throw error;
    }
  }

  /**
   * Main function to fetch and save recent plays
   */
  async fetchAndSaveRecentPlays(): Promise<void> {
    try {
      const recentPlays = await this.fetchRecentPlays();
      await this.saveRecentPlays(recentPlays);
      console.log('🎉 Recent plays fetch completed successfully!');
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
