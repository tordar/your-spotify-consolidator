#!/usr/bin/env tsx

/**
 * Script to fetch top albums from the external Spotify API
 * Makes the exact same request 25 times with increasing offsets
 */

import https from 'https';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration from environment variables
const BASE_URL = process.env.SPOTIFY_API_URL || 'https://spotify-api.tordar.no/spotify/top/albums';
const START_DATE = process.env.START_DATE || '2010-05-02T05:22:01.000Z';
const END_DATE = process.env.END_DATE || '2025-09-16T12:33:53.259Z';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '20');
const TOTAL_CALLS = parseInt(process.env.TOTAL_CALLS || '50');
const COOKIE_TOKEN = process.env.SPOTIFY_COOKIE_TOKEN;

// Validate required environment variables
if (!COOKIE_TOKEN) {
  console.error('❌ Error: SPOTIFY_COOKIE_TOKEN environment variable is required');
  console.error('Please create a .env file with your Spotify API token');
  process.exit(1);
}

interface ApiResponse {
  statusCode: number;
  data: any;
}

interface ErrorInfo {
  call: number;
  offset: number;
  statusCode?: number;
  error: string;
}

interface Results {
  metadata: {
    totalCalls: number;
    batchSize: number;
    dateRange: {
      start: string;
      end: string;
    };
    totalAlbums: number;
    successfulCalls: number;
    failedCalls: number;
    timestamp: string;
  };
  albums: any[];
  errors: ErrorInfo[];
}

// Function to make HTTP request
function makeRequest(url: string, cookie: string): Promise<ApiResponse> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'Cookie': `token=${cookie}`,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    };
    
    https.get(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            statusCode: res.statusCode || 200,
            data: jsonData
          });
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

// Function to build URL with parameters
function buildUrl(offset: number): string {
  const params = new URLSearchParams({
    start: START_DATE,
    end: END_DATE,
    nb: BATCH_SIZE.toString(),
    offset: offset.toString()
  });
  
  return `${BASE_URL}?${params.toString()}`;
}

// Main function to fetch all albums
async function fetchAllAlbums(): Promise<Results> {
  console.log(`Starting to fetch albums from Spotify API...`);
  console.log(`Total calls: ${TOTAL_CALLS}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Date range: ${START_DATE} to ${END_DATE}`);
  console.log('---\n');

  const allAlbums: any[] = [];
  const errors: ErrorInfo[] = [];

  for (let i = 0; i < TOTAL_CALLS; i++) {
    const offset = i * BATCH_SIZE;
    const url = buildUrl(offset);
    
    console.log(`Call ${i + 1}/${TOTAL_CALLS} - Offset: ${offset}`);
    console.log(`URL: ${url}`);
    
    try {
      const response = await makeRequest(url, COOKIE_TOKEN);
      
      if (response.statusCode === 200) {
        const albums = response.data;
        console.log(`✅ Success - Found ${albums.length} albums`);
        
        if (albums.length > 0) {
          // Transform the data to a cleaner format
          const cleanedAlbums = albums.map((album: any) => ({
            duration_ms: album.duration_ms,
            count: album.count,
            albumId: album.albumId,
            album: {
              name: album.album?.name || '',
              images: album.album?.images || []
            },
            artist: {
              name: album.artist?.name || '',
              genres: album.artist?.genres || []
            }
          }));
          
          allAlbums.push(...cleanedAlbums);
        } else {
          console.log('⚠️  No more albums found, stopping early');
          break;
        }
      } else {
        console.log(`❌ Error - Status: ${response.statusCode}`);
        errors.push({
          call: i + 1,
          offset,
          statusCode: response.statusCode,
          error: `HTTP ${response.statusCode}`
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.log(`❌ Error - ${errorMessage}`);
      errors.push({
        call: i + 1,
        offset,
        error: errorMessage
      });
    }
    
    // Add a small delay between requests to be respectful to the API
    if (i < TOTAL_CALLS - 1) {
      console.log('⏳ Waiting 1 second before next request...\n');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Summary
  console.log('\n--- SUMMARY ---');
  console.log(`Total albums collected: ${allAlbums.length}`);
  console.log(`Successful calls: ${TOTAL_CALLS - errors.length}`);
  console.log(`Failed calls: ${errors.length}`);
  
  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(error => {
      console.log(`  Call ${error.call} (offset ${error.offset}): ${error.error}`);
    });
  }

  // Save results to file
  const results: Results = {
    metadata: {
      totalCalls: TOTAL_CALLS,
      batchSize: BATCH_SIZE,
      dateRange: {
        start: START_DATE,
        end: END_DATE
      },
      totalAlbums: allAlbums.length,
      successfulCalls: TOTAL_CALLS - errors.length,
      failedCalls: errors.length,
      timestamp: new Date().toISOString()
    },
    albums: allAlbums,
    errors: errors
  };

  const filename = `top-albums-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(results, null, 2));
  console.log(`\n📁 Results saved to: ${filename}`);

  return results;
}

// Run the script
if (require.main === module) {
  fetchAllAlbums()
    .then(() => {
      console.log('\n🎉 Script completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Script failed:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    });
}

export { fetchAllAlbums, buildUrl, makeRequest };
