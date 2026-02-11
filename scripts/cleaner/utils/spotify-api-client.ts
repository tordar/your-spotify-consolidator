import type { SpotifyTrack, SpotifyTracksResponse, SpotifyAlbum, SpotifyAlbumsResponse, SpotifyArtist, SpotifyArtistsResponse } from './types';

/** Max wait time (ms) before we skip enrichment instead of waiting. 600s = 10 minutes. */
const SKIP_ENRICHMENT_WAIT_MS = 600 * 1000;

/**
 * Thrown when rate limited with a Retry-After longer than SKIP_ENRICHMENT_WAIT_MS.
 * Callers should skip enrichment and continue with non-enriched data.
 */
export class RateLimitSkipEnrichmentError extends Error {
  constructor(
    message: string,
    public readonly waitTimeSeconds: number
  ) {
    super(message);
    this.name = 'RateLimitSkipEnrichmentError';
  }
}

/**
 * Spotify API Client with rate limiting and retry logic
 */
export class SpotifyApiClient {
  /**
   * Sleep for specified milliseconds
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Handle rate limiting with retry logic
   */
  private async handleRateLimit(response: Response, retryCount: number = 0, maxRetries: number = 5): Promise<number> {
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const waitTimeMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.min(1000 * Math.pow(2, retryCount), 60000);
      const waitTimeSeconds = waitTimeMs / 1000;

      if (waitTimeMs > SKIP_ENRICHMENT_WAIT_MS) {
        throw new RateLimitSkipEnrichmentError(
          `Rate limited: Retry-After ${waitTimeSeconds}s exceeds skip threshold (${SKIP_ENRICHMENT_WAIT_MS / 1000}s). Skipping enrichment.`,
          waitTimeSeconds
        );
      }

      if (retryCount >= maxRetries) {
        throw new Error(`Rate limited: Max retries (${maxRetries}) exceeded`);
      }

      console.log(`⏳ Rate limited (429). Waiting ${waitTimeSeconds}s before retry ${retryCount + 1}/${maxRetries}...`);
      await this.sleep(waitTimeMs);
      return retryCount + 1;
    }
    return retryCount;
  }

  /**
   * Fetch with retry logic for rate limiting
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    retryCount: number = 0,
    maxRetries: number = 5
  ): Promise<Response> {
    const response = await fetch(url, options);

    if (response.status === 429) {
      const newRetryCount = await this.handleRateLimit(response, retryCount, maxRetries);
      return this.fetchWithRetry(url, options, newRetryCount, maxRetries);
    }

    return response;
  }

  /**
   * Fetch track information from Spotify API (up to 50 tracks at a time)
   */
  async fetchTracks(accessToken: string, trackIds: string[]): Promise<SpotifyTrack[]> {
    const tracks: SpotifyTrack[] = [];
    const batchSize = 50; // Spotify API limit for Get Several Tracks

    for (let i = 0; i < trackIds.length; i += batchSize) {
      const batch = trackIds.slice(i, i + batchSize);
      const idsParam = batch.join(',');

      try {
        const response = await this.fetchWithRetry(
          `https://api.spotify.com/v1/tracks?ids=${idsParam}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Failed to fetch tracks batch ${i / batchSize + 1}: ${response.status} ${errorText}`);
          continue;
        }

        const data = await response.json() as SpotifyTracksResponse;
        tracks.push(...data.tracks.filter(track => track !== null));

        // Rate limiting: wait a bit between batches
        if (i + batchSize < trackIds.length) {
          await this.sleep(100);
        }
      } catch (error) {
        if (error instanceof RateLimitSkipEnrichmentError) throw error;
        console.error(`❌ Error fetching tracks batch ${i / batchSize + 1}:`, error);
      }
    }

    return tracks;
  }

  /**
   * Fetch album metadata from Spotify API (up to 20 albums at a time)
   */
  async fetchAlbums(accessToken: string, albumIds: string[]): Promise<Map<string, SpotifyAlbum>> {
    const albumsMap = new Map<string, SpotifyAlbum>();
    const batchSize = 20; // Spotify API limit for Get Several Albums

    for (let i = 0; i < albumIds.length; i += batchSize) {
      const batch = albumIds.slice(i, i + batchSize);
      const idsParam = batch.join(',');

      try {
        const response = await this.fetchWithRetry(
          `https://api.spotify.com/v1/albums?ids=${idsParam}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Failed to fetch albums batch ${i / batchSize + 1}: ${response.status} ${errorText}`);
          continue;
        }

        const data = await response.json() as SpotifyAlbumsResponse;
        data.albums.forEach(album => {
          if (album !== null && album.id) {
            albumsMap.set(album.id, album);
          }
        });

        // Rate limiting: wait a bit between batches
        if (i + batchSize < albumIds.length) {
          await this.sleep(100);
        }
      } catch (error) {
        if (error instanceof RateLimitSkipEnrichmentError) throw error;
        console.error(`❌ Error fetching albums batch ${i / batchSize + 1}:`, error);
      }
    }

    return albumsMap;
  }

  /**
   * Search for albums by name and artist
   */
  async searchAlbum(accessToken: string, albumName: string, artistName: string): Promise<SpotifyAlbum | null> {
    try {
      const query = encodeURIComponent(`album:"${albumName}" artist:"${artistName}"`);
      const response = await this.fetchWithRetry(
        `https://api.spotify.com/v1/search?q=${query}&type=album&limit=1`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as { albums: { items: SpotifyAlbum[] } };
      return data.albums?.items?.[0] || null;
    } catch (error) {
      if (error instanceof RateLimitSkipEnrichmentError) throw error;
      return null;
    }
  }

  /**
   * Fetch artist metadata from Spotify API (up to 50 artists at a time)
   */
  async fetchArtists(accessToken: string, artistIds: string[]): Promise<Map<string, SpotifyArtist>> {
    const artistsMap = new Map<string, SpotifyArtist>();
    const batchSize = 50; // Spotify API limit for Get Several Artists

    for (let i = 0; i < artistIds.length; i += batchSize) {
      const batch = artistIds.slice(i, i + batchSize);
      const idsParam = batch.join(',');

      try {
        const response = await this.fetchWithRetry(
          `https://api.spotify.com/v1/artists?ids=${idsParam}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Failed to fetch artists batch ${i / batchSize + 1}: ${response.status} ${errorText}`);
          continue;
        }

        const data = await response.json() as SpotifyArtistsResponse;
        data.artists.forEach(artist => {
          if (artist !== null && artist.id) {
            artistsMap.set(artist.id, artist);
          }
        });

        // Rate limiting: wait a bit between batches
        if (i + batchSize < artistIds.length) {
          await this.sleep(100);
        }
      } catch (error) {
        if (error instanceof RateLimitSkipEnrichmentError) throw error;
        console.error(`❌ Error fetching artists batch ${i / batchSize + 1}:`, error);
      }
    }

    return artistsMap;
  }
}

