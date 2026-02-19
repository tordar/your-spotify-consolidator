import { MusicBrainzApi } from 'musicbrainz-api';

/**
 * MusicBrainz API Client with rate limiting
 * MusicBrainz allows 1 request per second
 */
export class MusicBrainzApiClient {
  private mbApi: MusicBrainzApi;
  private requestDelay = 1100; // MusicBrainz rate limit: 1 req/sec (be safe with 1.1s)

  constructor() {
    this.mbApi = new MusicBrainzApi({
      appName: 'spotify-pulse',
      appVersion: '1.0.0',
      appContactInfo: 'https://github.com/tordar/spotify-pulse' // Required by MusicBrainz
    });
  }

  /**
   * Sleep for specified milliseconds
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Search for an artist by name and return their genres/tags
   */
  async searchArtistGenres(artistName: string): Promise<string[]> {
    try {
      // Search for artist
      const searchResults = await this.mbApi.search('artist', {
        query: `"${artistName}"`,
        limit: 1
      });

      if (!searchResults.artists || searchResults.artists.length === 0) {
        // Respect rate limit even on no results
        await this.sleep(this.requestDelay);
        return [];
      }

      const artist = searchResults.artists[0];
      
      // Lookup full artist details with genres/tags
      const fullArtist = await this.mbApi.lookup('artist', artist.id, ['genres', 'tags']) as any;
      
      // Extract genres (MusicBrainz uses both 'genres' and 'tags')
      const genres: string[] = [];
      
      if (fullArtist.genres) {
        fullArtist.genres.forEach((genre: any) => {
          if (genre.name && !genres.includes(genre.name.toLowerCase())) {
            genres.push(genre.name.toLowerCase());
          }
        });
      }
      
      if (fullArtist.tags) {
        fullArtist.tags.forEach((tag: any) => {
          if (tag.name && !genres.includes(tag.name.toLowerCase())) {
            genres.push(tag.name.toLowerCase());
          }
        });
      }

      // Respect rate limit
      await this.sleep(this.requestDelay);
      
      return genres;
    } catch (error) {
      console.error(`❌ Error fetching MusicBrainz genres for "${artistName}":`, error);
      // Still respect rate limit on error
      await this.sleep(this.requestDelay);
      return [];
    }
  }

  /**
   * Batch search artists (with rate limiting)
   * Returns a map of artist name (lowercase) -> genres array
   */
  async searchArtistsGenres(artistNames: string[]): Promise<Map<string, string[]>> {
    const results = new Map<string, string[]>();
    
    console.log(`   Fetching genres from MusicBrainz for ${artistNames.length} artists...`);
    
    for (let i = 0; i < artistNames.length; i++) {
      const artistName = artistNames[i];
      const genres = await this.searchArtistGenres(artistName);
      
      if (genres.length > 0) {
        results.set(artistName.toLowerCase().trim(), genres);
      }
      
      // Progress logging every 10 artists
      if ((i + 1) % 10 === 0) {
        console.log(`   Progress: ${i + 1}/${artistNames.length} artists processed (found ${results.size} with genres)...`);
      }
    }
    
    console.log(`✅ MusicBrainz: Found genres for ${results.size}/${artistNames.length} artists`);
    return results;
  }
}

