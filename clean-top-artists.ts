#!/usr/bin/env tsx

/**
 * Script to clean and consolidate duplicate artists from the top-artists JSON file
 * Consolidates artists with the same artist.name
 */

import fs from 'fs';

interface CleanedArtist {
  duration_ms: number;
  count: number;
  differents: number;
  artistId: string;
  primaryArtistId: string;
  total_count: number;
  total_duration_ms: number;
  artist: {
    name: string;
    genres: string[];
    images: Array<{
      height: number;
      url: string;
      width: number;
    }>;
  };
}

interface ConsolidatedArtist extends CleanedArtist {
  consolidated_count: number;
  original_artistIds: string[];
  original_counts: number[];
  rank?: number; // Optional since we add it after sorting
}

interface CleanResults {
  metadata: {
    originalTotalArtists: number;
    consolidatedTotalArtists: number;
    duplicatesRemoved: number;
    consolidationRate: number;
    timestamp: string;
  };
  artists: ConsolidatedArtist[];
}

function findLatestJsonFile(): string {
  const files = fs.readdirSync('.')
    .filter(file => file.startsWith('top-artists-') && file.endsWith('.json'))
    .sort()
    .reverse();
  
  if (files.length === 0) {
    throw new Error('No top-artists JSON files found in current directory');
  }
  
  return files[0];
}

function consolidateArtists(artists: CleanedArtist[]): CleanResults {
  console.log(`Starting consolidation of ${artists.length} artists...`);
  
  const consolidatedMap = new Map<string, ConsolidatedArtist>();
  let duplicatesRemoved = 0;
  
  for (const artist of artists) {
    const key = artist.artist.name.toLowerCase();
    
    if (consolidatedMap.has(key)) {
      // Artist already exists, consolidate the data
      const existing = consolidatedMap.get(key)!;
      duplicatesRemoved++;
      
      // Add counts and durations
      existing.count += artist.count;
      existing.duration_ms += artist.duration_ms;
      existing.differents += artist.differents;
      existing.total_count += artist.total_count;
      existing.total_duration_ms += artist.total_duration_ms;
      existing.consolidated_count++;
      existing.original_artistIds.push(artist.artistId);
      existing.original_counts.push(artist.count);
      
      
      // Keep the artist with more images (better quality)
      if (artist.artist.images.length > existing.artist.images.length) {
        existing.artist.images = artist.artist.images;
      }
      
      // Merge genres (remove duplicates)
      const mergedGenres = [...new Set([...existing.artist.genres, ...artist.artist.genres])];
      existing.artist.genres = mergedGenres;
      
      console.log(`🔄 Consolidated: "${artist.artist.name}" (${existing.consolidated_count} duplicates)`);
    } else {
      // New artist, add to map
      consolidatedMap.set(key, {
        ...artist,
        consolidated_count: 1,
        original_artistIds: [artist.artistId],
        original_counts: [artist.count]
      });
    }
  }
  
  const consolidatedArtists = Array.from(consolidatedMap.values())
    .sort((a, b) => b.count - a.count) // Sort by count (highest first)
    .slice(0, 500) // Keep only top 500 artists
    .map((artist, index) => ({
      ...artist,
      rank: index + 1 // Add rank (1-based indexing)
    }));
  const consolidationRate = ((duplicatesRemoved / artists.length) * 100).toFixed(2);
  
  // Create consolidation summary table
  console.log(`\n--- CONSOLIDATION SUMMARY ---`);
  console.log('┌─────────────────────┬─────────────┐');
  console.log('│ Metric              │ Value       │');
  console.log('├─────────────────────┼─────────────┤');
  console.log(`│ Original artists    │ ${artists.length.toString().padStart(11)} │`);
  console.log(`│ Consolidated artists│ ${consolidatedArtists.length.toString().padStart(11)} │`);
  console.log(`│ Duplicates removed  │ ${duplicatesRemoved.toString().padStart(11)} │`);
  console.log(`│ Consolidation rate  │ ${consolidationRate.padStart(10)}% │`);
  console.log('└─────────────────────┴─────────────┘');
  
  // Log top 500 artists in table format
  console.log(`\n--- TOP 500 ARTISTS ---`);
  console.log('┌─────┬─────────────────────────────────────────────────────────────────────────────────────────────┬─────────────┬─────────────┬─────────────────────────────┐');
  console.log('│Rank │ Artist Name                                                                              │Total Plays │Consolidated│ Original Play Counts         │');
  console.log('├─────┼─────────────────────────────────────────────────────────────────────────────────────────────┼─────────────┼─────────────┼─────────────────────────────┤');
  
  consolidatedArtists.forEach((artist) => {
    const artistName = artist.artist.name;
    const truncatedArtistName = artistName.length > 75 ? artistName.substring(0, 72) + '...' : artistName;
    const consolidationInfo = artist.consolidated_count > 1 ? `${artist.consolidated_count}` : '1';
    const originalCounts = artist.consolidated_count > 1 ? artist.original_counts.join(', ') : artist.count.toString();
    const truncatedOriginalCounts = originalCounts.length > 25 ? originalCounts.substring(0, 22) + '...' : originalCounts;
    
    console.log(`│${artist.rank.toString().padStart(4)} │ ${truncatedArtistName.padEnd(75)} │${artist.count.toString().padStart(11)} │${consolidationInfo.padStart(11)} │ ${truncatedOriginalCounts.padEnd(25)} │`);
  });
  
  console.log('└─────┴─────────────────────────────────────────────────────────────────────────────────────────────┴─────────────┴─────────────┴─────────────────────────────┘');
  
  // Create genre ranking
  const genreCounts = new Map<string, { count: number; totalPlays: number }>();
  
  consolidatedArtists.forEach((artist) => {
    artist.artist.genres.forEach((genre) => {
      if (genreCounts.has(genre)) {
        const existing = genreCounts.get(genre)!;
        existing.count += 1;
        existing.totalPlays += artist.count;
      } else {
        genreCounts.set(genre, { count: 1, totalPlays: artist.count });
      }
    });
  });
  
  const genreRanking = Array.from(genreCounts.entries())
    .sort((a, b) => b[1].count - a[1].count || b[1].totalPlays - a[1].totalPlays)
    .slice(0, 20); // Show top 20 genres
  
  console.log(`\n--- TOP 20 GENRES BY ARTIST COUNT ---`);
  console.log('┌─────┬─────────────────────────────────────────────────────────────────────────────────────────────┬─────────────┬─────────────┐');
  console.log('│Rank │ Genre Name                                                                              │Artist Count│Total Plays  │');
  console.log('├─────┼─────────────────────────────────────────────────────────────────────────────────────────────┼─────────────┼─────────────┤');
  
  genreRanking.forEach(([genreName, data], index) => {
    const truncatedGenreName = genreName.length > 75 ? genreName.substring(0, 72) + '...' : genreName;
    console.log(`│${(index + 1).toString().padStart(4)} │ ${truncatedGenreName.padEnd(75)} │${data.count.toString().padStart(11)} │${data.totalPlays.toString().padStart(12)} │`);
  });
  
  console.log('└─────┴─────────────────────────────────────────────────────────────────────────────────────────────┴─────────────┴─────────────┘');
  
  return {
    metadata: {
      originalTotalArtists: artists.length,
      consolidatedTotalArtists: consolidatedArtists.length,
      duplicatesRemoved,
      consolidationRate: parseFloat(consolidationRate),
      timestamp: new Date().toISOString()
    },
    artists: consolidatedArtists
  };
}

function cleanTopArtists() {
  try {
    // Find the latest JSON file
    const jsonFile = findLatestJsonFile();
    console.log(`📁 Reading data from: ${jsonFile}`);
    
    // Read and parse the JSON file
    const rawData = fs.readFileSync(jsonFile, 'utf8');
    const data = JSON.parse(rawData);
    
    if (!data.artists || !Array.isArray(data.artists)) {
      throw new Error('Invalid JSON structure: artists array not found');
    }
    
    console.log(`📊 Found ${data.artists.length} artists in the file`);
    
    // Consolidate the artists
    const results = consolidateArtists(data.artists);
    
    // Save the cleaned results
    const outputFile = `cleaned-top-artists-${Date.now()}.json`;
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
  cleanTopArtists();
}

export { cleanTopArtists, consolidateArtists };
