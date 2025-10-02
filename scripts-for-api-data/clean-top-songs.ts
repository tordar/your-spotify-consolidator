#!/usr/bin/env tsx

/**
 * Script to clean and consolidate duplicate songs from the top-songs JSON file
 * Consolidates songs with the same artist.name and song.name
 */

import fs from 'fs';

interface CleanedSong {
  duration_ms: number;
  count: number;
  songId: string;
  song: {
    name: string;
    preview_url: string | null;
    external_urls: Record<string, string>;
  };
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

interface ConsolidatedSong extends CleanedSong {
  consolidated_count: number;
  original_songIds: string[];
  original_counts: number[]; // Track individual play counts for each original song
  rank?: number; // Optional since we add it after sorting
}

interface CleanResults {
  metadata: {
    originalTotalSongs: number;
    consolidatedTotalSongs: number;
    duplicatesRemoved: number;
    consolidationRate: number;
    timestamp: string;
  };
  songs: ConsolidatedSong[];
}

function findLatestJsonFile(): string {
  const files = fs.readdirSync('.')
    .filter(file => file.startsWith('top-songs-') && file.endsWith('.json'))
    .sort()
    .reverse();
  
  if (files.length === 0) {
    throw new Error('No top-songs JSON files found in current directory');
  }
  
  return files[0];
}

function consolidateSongs(songs: CleanedSong[]): CleanResults {
  console.log(`Starting consolidation of ${songs.length} songs...`);
  
  const consolidatedMap = new Map<string, ConsolidatedSong>();
  let duplicatesRemoved = 0;
  
  for (const song of songs) {
    const key = `${song.artist.name}|||${song.song.name}`.toLowerCase();
    
    if (consolidatedMap.has(key)) {
      // Song already exists, consolidate the data
      const existing = consolidatedMap.get(key)!;
      duplicatesRemoved++;
      
      // Add counts and durations
      existing.count += song.count;
      existing.duration_ms += song.duration_ms;
      existing.consolidated_count++;
      existing.original_songIds.push(song.songId);
      existing.original_counts.push(song.count);
      
      // Keep the song with preview_url if the existing one doesn't have it
      if (!existing.song.preview_url && song.song.preview_url) {
        existing.song.preview_url = song.song.preview_url;
      }
      
      // Keep the song with more external URLs
      if (Object.keys(song.song.external_urls).length > Object.keys(existing.song.external_urls).length) {
        existing.song.external_urls = song.song.external_urls;
      }
      
      // Keep the album with more images (better quality)
      if (song.album.images.length > existing.album.images.length) {
        existing.album.images = song.album.images;
      }
      
      // Merge genres (remove duplicates)
      const mergedGenres = [...new Set([...existing.artist.genres, ...song.artist.genres])];
      existing.artist.genres = mergedGenres;
      
      console.log(`🔄 Consolidated: "${song.artist.name}" - "${song.song.name}" (${existing.consolidated_count} duplicates)`);
    } else {
      // New song, add to map
      consolidatedMap.set(key, {
        ...song,
        consolidated_count: 1,
        original_songIds: [song.songId],
        original_counts: [song.count]
      });
    }
  }
  
  const consolidatedSongs = Array.from(consolidatedMap.values())
    .sort((a, b) => b.count - a.count) // Sort by count (highest first)
    .slice(0, 500) // Keep only top 500 songs
    .map((song, index) => ({
      ...song,
      rank: index + 1 // Add rank (1-based indexing)
    }));
  const consolidationRate = ((duplicatesRemoved / songs.length) * 100).toFixed(2);
  
  // Create consolidation summary table
  console.log(`\n--- CONSOLIDATION SUMMARY ---`);
  console.log('┌─────────────────────┬─────────────┐');
  console.log('│ Metric              │ Value       │');
  console.log('├─────────────────────┼─────────────┤');
  console.log(`│ Original songs      │ ${songs.length.toString().padStart(11)} │`);
  console.log(`│ Consolidated songs  │ ${consolidatedSongs.length.toString().padStart(11)} │`);
  console.log(`│ Duplicates removed  │ ${duplicatesRemoved.toString().padStart(11)} │`);
  console.log(`│ Consolidation rate  │ ${consolidationRate.padStart(10)}% │`);
  console.log('└─────────────────────┴─────────────┘');
  
  // Log top 500 songs in table format
  console.log(`\n--- TOP 500 SONGS ---`);
  console.log('┌─────┬─────────────────────────────────────────────────────────────────────────────────────────────┬─────────────┬─────────────┬─────────────────────────────┐');
  console.log('│Rank │ Song & Artist                                                                              │Total Plays │Consolidated│ Original Play Counts         │');
  console.log('├─────┼─────────────────────────────────────────────────────────────────────────────────────────────┼─────────────┼─────────────┼─────────────────────────────┤');
  
  consolidatedSongs.forEach((song) => {
    const songArtist = `${song.artist.name} - "${song.song.name}"`;
    const truncatedSongArtist = songArtist.length > 75 ? songArtist.substring(0, 72) + '...' : songArtist;
    const consolidationInfo = song.consolidated_count > 1 ? `${song.consolidated_count}` : '1';
    const originalCounts = song.consolidated_count > 1 ? song.original_counts.join(', ') : song.count.toString();
    const truncatedOriginalCounts = originalCounts.length > 25 ? originalCounts.substring(0, 22) + '...' : originalCounts;
    
    console.log(`│${song.rank.toString().padStart(4)} │ ${truncatedSongArtist.padEnd(75)} │${song.count.toString().padStart(11)} │${consolidationInfo.padStart(11)} │ ${truncatedOriginalCounts.padEnd(25)} │`);
  });
  
  console.log('└─────┴─────────────────────────────────────────────────────────────────────────────────────────────┴─────────────┴─────────────┴─────────────────────────────┘');
  
  // Create artist ranking
  const artistCounts = new Map<string, { count: number; totalPlays: number }>();
  
  consolidatedSongs.forEach((song) => {
    const artistName = song.artist.name;
    if (artistCounts.has(artistName)) {
      const existing = artistCounts.get(artistName)!;
      existing.count += 1;
      existing.totalPlays += song.count;
    } else {
      artistCounts.set(artistName, { count: 1, totalPlays: song.count });
    }
  });
  
  const artistRanking = Array.from(artistCounts.entries())
    .sort((a, b) => b[1].count - a[1].count || b[1].totalPlays - a[1].totalPlays)
    .slice(0, 20); // Show top 20 artists
  
  console.log(`\n--- TOP 20 ARTISTS BY SONG COUNT ---`);
  console.log('┌─────┬─────────────────────────────────────────────────────────────────────────────────────────────┬─────────────┬─────────────┐');
  console.log('│Rank │ Artist Name                                                                              │Song Count  │Total Plays  │');
  console.log('├─────┼─────────────────────────────────────────────────────────────────────────────────────────────┼─────────────┼─────────────┤');
  
  artistRanking.forEach(([artistName, data], index) => {
    const truncatedArtistName = artistName.length > 75 ? artistName.substring(0, 72) + '...' : artistName;
    console.log(`│${(index + 1).toString().padStart(4)} │ ${truncatedArtistName.padEnd(75)} │${data.count.toString().padStart(11)} │${data.totalPlays.toString().padStart(12)} │`);
  });
  
  console.log('└─────┴─────────────────────────────────────────────────────────────────────────────────────────────┴─────────────┴─────────────┘');
  
  return {
    metadata: {
      originalTotalSongs: songs.length,
      consolidatedTotalSongs: consolidatedSongs.length,
      duplicatesRemoved,
      consolidationRate: parseFloat(consolidationRate),
      timestamp: new Date().toISOString()
    },
    songs: consolidatedSongs
  };
}

function cleanTopSongs() {
  try {
    // Find the latest JSON file
    const jsonFile = findLatestJsonFile();
    console.log(`📁 Reading data from: ${jsonFile}`);
    
    // Read and parse the JSON file
    const rawData = fs.readFileSync(jsonFile, 'utf8');
    const data = JSON.parse(rawData);
    
    if (!data.songs || !Array.isArray(data.songs)) {
      throw new Error('Invalid JSON structure: songs array not found');
    }
    
    console.log(`📊 Found ${data.songs.length} songs in the file`);
    
    // Consolidate the songs
    const results = consolidateSongs(data.songs);
    
    // Save the cleaned results
    const outputFile = `cleaned-top-songs-${Date.now()}.json`;
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
  cleanTopSongs();
}

export { cleanTopSongs, consolidateSongs };
