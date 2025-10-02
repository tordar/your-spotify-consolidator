#!/usr/bin/env tsx

import * as https from 'https';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import * as cliProgress from 'cli-progress';

// Load environment variables
dotenv.config();

// Configuration from environment variables
const BASE_URL = 'https://spotify-api.tordar.no/spotify/top/songs';
const START_DATE = process.env.START_DATE || '2009-01-01T00:00:00.000Z';
const END_DATE = process.env.END_DATE || '2025-12-12T00:00:00.000Z';
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
    totalSongs: number;
    successfulCalls: number;
    failedCalls: number;
    timestamp: string;
  };
  songs: any[];
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

// Main function to fetch all songs
async function fetchAllSongs(): Promise<Results> {
  console.log(`🎵 Starting to fetch songs from Spotify API...`);
  console.log(`📊 Total calls: ${TOTAL_CALLS}`);
  console.log(`📦 Batch size: ${BATCH_SIZE}`);
  console.log(`📅 Date range: ${START_DATE} to ${END_DATE}`);
  console.log('---\n');

  const allSongs: any[] = [];
  const errors: ErrorInfo[] = [];

  // Create progress bar
  const progressBar = new cliProgress.SingleBar({
    format: '🎵 Fetching Songs |{bar}| {percentage}% | {value}/{total} calls | ETA: {eta}s | Songs: {songs}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
    stopOnComplete: true
  });

  // Start progress bar
  progressBar.start(TOTAL_CALLS, 0, {
    songs: 0
  });

  for (let i = 0; i < TOTAL_CALLS; i++) {
    const offset = i * BATCH_SIZE;
    const url = buildUrl(offset);
    
    try {
      const response = await makeRequest(url, COOKIE_TOKEN!);
      
      if (response.statusCode === 200) {
        const songs = response.data;
        
        if (songs.length > 0) {
          // Transform the data to a cleaner format
          const cleanedSongs = songs.map((song: any) => ({
            duration_ms: song.duration_ms,
            count: song.count,
            songId: song.trackId,
            song: {
              name: song.track?.name || 'Unknown Song',
              preview_url: song.track?.preview_url || null,
              external_urls: song.track?.external_urls || {}
            },
            album: {
              name: song.album?.name || '',
              images: song.album?.images || []
            },
            artist: {
              name: song.artist?.name || '',
              genres: song.artist?.genres || []
            }
          }));
          
          allSongs.push(...cleanedSongs);
        } else {
          // No more songs found, stop early
          progressBar.stop();
          console.log('\n⚠️  No more songs found, stopping early');
          break;
        }
      } else {
        errors.push({
          call: i + 1,
          offset,
          statusCode: response.statusCode,
          error: `HTTP ${response.statusCode}`
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push({
        call: i + 1,
        offset,
        error: errorMessage
      });
    }
    
    // Update progress bar
    progressBar.update(i + 1, {
      songs: allSongs.length
    });
    
    // Add a small delay between requests to be respectful to the API
    if (i < TOTAL_CALLS - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Stop progress bar
  progressBar.stop();

  // Summary
  console.log('\n📊 --- SUMMARY ---');
  console.log(`🎵 Total songs collected: ${allSongs.length}`);
  console.log(`✅ Successful calls: ${TOTAL_CALLS - errors.length}`);
  console.log(`❌ Failed calls: ${errors.length}`);
  
  if (errors.length > 0) {
    console.log('\n🚨 Errors encountered:');
    errors.forEach(error => {
      console.log(`  📞 Call ${error.call} (offset ${error.offset}): ${error.error}`);
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
      totalSongs: allSongs.length,
      successfulCalls: TOTAL_CALLS - errors.length,
      failedCalls: errors.length,
      timestamp: new Date().toISOString()
    },
    songs: allSongs,
    errors: errors
  };

  const filename = `top-songs-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${filename}`);

  return results;
}

// Run the script
if (require.main === module) {
  fetchAllSongs()
    .then(() => {
      console.log('\n🎉 Script completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Script failed:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    });
}

export { fetchAllSongs, buildUrl, makeRequest };
