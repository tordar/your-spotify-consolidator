import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

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
  private readonly maxRetries = 5;
  private readonly initialRetryDelay = 1000; // 1 second

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
   * Sleep for specified milliseconds
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if an error is retryable (transient network errors or 5xx status codes)
   */
  private isRetryableError(error: any, statusCode?: number): boolean {
    // Retry on 5xx server errors
    if (statusCode && statusCode >= 500 && statusCode < 600) {
      return true;
    }

    // Retry on network errors (connection errors, timeouts, etc.)
    const errorMessage = error?.message || String(error);
    const retryableNetworkErrors = [
      'upstream connect error',
      'connection termination',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNREFUSED',
      'network error',
      'fetch failed'
    ];

    return retryableNetworkErrors.some(pattern => 
      errorMessage.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Get a valid access token, refreshing if necessary
   * Includes retry logic with exponential backoff for transient errors
   */
  async getValidAccessToken(): Promise<string> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
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
          const error = new Error(`Failed to refresh token: ${response.status} ${errorText}`);
          
          // Check if this is a retryable error
          if (this.isRetryableError(error, response.status) && attempt < this.maxRetries) {
            lastError = error;
            const delay = this.initialRetryDelay * Math.pow(2, attempt);
            console.log(`⚠️  Token refresh failed (attempt ${attempt + 1}/${this.maxRetries + 1}): ${response.status} ${errorText}. Retrying in ${delay / 1000}s...`);
            await this.sleep(delay);
            continue;
          }
          
          // Non-retryable error or max retries reached
          throw error;
        }

        const tokens = await response.json() as SpotifyTokens;
        
        if (attempt > 0) {
          console.log(`✅ Token refresh succeeded after ${attempt + 1} attempts`);
        }
        
        return tokens.access_token;
      } catch (error: any) {
        lastError = error;
        
        // Check if this is a retryable network error
        if (this.isRetryableError(error) && attempt < this.maxRetries) {
          const delay = this.initialRetryDelay * Math.pow(2, attempt);
          const errorMessage = error?.message || String(error);
          console.log(`⚠️  Token refresh failed (attempt ${attempt + 1}/${this.maxRetries + 1}): ${errorMessage}. Retrying in ${delay / 1000}s...`);
          await this.sleep(delay);
          continue;
        }
        
        // Non-retryable error or max retries reached
        break;
      }
    }

    // All retries exhausted
    console.error('❌ Failed to get access token after all retries:', lastError);
    throw lastError;
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
        const user = await response.json() as any;
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
