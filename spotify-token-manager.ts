import * as fs from 'fs';

interface SpotifyTokens {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

interface SpotifyConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

class SpotifyTokenManager {
  private config: SpotifyConfig;

  constructor() {
    this.config = {
      clientId: process.env.SPOTIFY_CLIENT_ID || '',
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
      refreshToken: process.env.SPOTIFY_REFRESH_TOKEN || ''
    };

    if (!this.config.clientId || !this.config.clientSecret || !this.config.refreshToken) {
      throw new Error('Missing Spotify configuration. Please set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REFRESH_TOKEN environment variables.');
    }
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getValidAccessToken(): Promise<string> {
    try {
      console.log('🔄 Getting fresh Spotify access token...');
      
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.config.refreshToken
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to refresh token: ${response.status} ${errorText}`);
      }

      const tokens: SpotifyTokens = await response.json();
      console.log('✅ Successfully refreshed access token');
      
      return tokens.access_token;
    } catch (error) {
      console.error('❌ Failed to get access token:', error);
      throw error;
    }
  }

  /**
   * Test the token by making a simple API call
   */
  async testToken(accessToken: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.ok) {
        const user = await response.json();
        console.log(`✅ Token valid for user: ${user.display_name || user.id}`);
        return true;
      } else {
        console.error(`❌ Token test failed: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error('❌ Token test error:', error);
      return false;
    }
  }
}

export { SpotifyTokenManager };
