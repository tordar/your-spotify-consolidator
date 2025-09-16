#!/usr/bin/env tsx

/**
 * Script to clean and consolidate duplicate albums from the top-albums JSON file
 * Consolidates albums with the same artist.name and album.name
 */

import fs from 'fs';

interface CleanedAlbum {
  duration_ms: number;
  count: number;
  albumId: string;
  album: {
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
}

interface ConsolidatedAlbum extends CleanedAlbum {
  consolidated_count: number;
  original_albumIds: string[];
  rank?: number; // Optional since we add it after sorting
}

interface CleanResults {
  metadata: {
    originalTotalAlbums: number;
    consolidatedTotalAlbums: number;
    duplicatesRemoved: number;
    consolidationRate: number;
    timestamp: string;
  };
  albums: ConsolidatedAlbum[];
}

function findLatestJsonFile(): string {
  const files = fs.readdirSync('.')
    .filter(file => file.startsWith('top-albums-') && file.endsWith('.json'))
    .sort()
    .reverse();
  
  if (files.length === 0) {
    throw new Error('No top-albums JSON files found in current directory');
  }
  
  return files[0];
}

function consolidateAlbums(albums: CleanedAlbum[]): CleanResults {
  console.log(`Starting consolidation of ${albums.length} albums...`);
  
  const consolidatedMap = new Map<string, ConsolidatedAlbum>();
  let duplicatesRemoved = 0;
  
  for (const album of albums) {
    const key = `${album.artist.name}|||${album.album.name}`.toLowerCase();
    
    if (consolidatedMap.has(key)) {
      // Album already exists, consolidate the data
      const existing = consolidatedMap.get(key)!;
      duplicatesRemoved++;
      
      // Add counts and durations
      existing.count += album.count;
      existing.duration_ms += album.duration_ms;
      existing.consolidated_count++;
      existing.original_albumIds.push(album.albumId);
      
      // Keep the album with more images (better quality)
      if (album.album.images.length > existing.album.images.length) {
        existing.album.images = album.album.images;
      }
      
      // Merge genres (remove duplicates)
      const mergedGenres = [...new Set([...existing.artist.genres, ...album.artist.genres])];
      existing.artist.genres = mergedGenres;
      
      console.log(`🔄 Consolidated: "${album.artist.name}" - "${album.album.name}" (${existing.consolidated_count} duplicates)`);
    } else {
      // New album, add to map
      consolidatedMap.set(key, {
        ...album,
        consolidated_count: 1,
        original_albumIds: [album.albumId]
      });
    }
  }
  
  const consolidatedAlbums = Array.from(consolidatedMap.values())
    .sort((a, b) => b.count - a.count) // Sort by count (highest first)
    .slice(0, 500) // Keep only top 500 albums
    .map((album, index) => ({
      ...album,
      rank: index + 1 // Add rank (1-based indexing)
    }));
  const consolidationRate = ((duplicatesRemoved / albums.length) * 100).toFixed(2);
  
  console.log(`\n--- CONSOLIDATION SUMMARY ---`);
  console.log(`Original albums: ${albums.length}`);
  console.log(`Consolidated albums: ${consolidatedAlbums.length}`);
  console.log(`Duplicates removed: ${duplicatesRemoved}`);
  console.log(`Consolidation rate: ${consolidationRate}%`);
  
  // Log top 500 albums
  console.log(`\n--- TOP 500 ALBUMS ---`);
  consolidatedAlbums.forEach((album) => {
    console.log(`#${album.rank}. ${album.artist.name} - "${album.album.name}" (${album.count} plays)`);
  });
  
  return {
    metadata: {
      originalTotalAlbums: albums.length,
      consolidatedTotalAlbums: consolidatedAlbums.length,
      duplicatesRemoved,
      consolidationRate: parseFloat(consolidationRate),
      timestamp: new Date().toISOString()
    },
    albums: consolidatedAlbums
  };
}

function cleanTopAlbums() {
  try {
    // Find the latest JSON file
    const jsonFile = findLatestJsonFile();
    console.log(`📁 Reading data from: ${jsonFile}`);
    
    // Read and parse the JSON file
    const rawData = fs.readFileSync(jsonFile, 'utf8');
    const data = JSON.parse(rawData);
    
    if (!data.albums || !Array.isArray(data.albums)) {
      throw new Error('Invalid JSON structure: albums array not found');
    }
    
    console.log(`📊 Found ${data.albums.length} albums in the file`);
    
    // Consolidate the albums
    const results = consolidateAlbums(data.albums);
    
    // Save the cleaned results
    const outputFile = `cleaned-top-albums-${Date.now()}.json`;
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    
    console.log(`\n📁 Cleaned data saved to: ${outputFile}`);
    console.log(`🎉 Consolidation completed successfully!`);
    
    return results;
  } catch (error) {
    console.error('\n💥 Script failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  cleanTopAlbums();
}

export { cleanTopAlbums, consolidateAlbums };
