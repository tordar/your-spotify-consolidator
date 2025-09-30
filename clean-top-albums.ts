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
  original_counts: number[]; // Track individual play counts for each original album
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
  
  // Define known album variations that should be consolidated
  const albumVariations: Record<string, Record<string, string[]>> = {
    'eddie vedder': {
      'Into The Wild (Music For The Motion Picture)': ['into the wild (music for the motion picture)', 'music for the motion picture into the wild']
    },
    'the smashing pumpkins': {
      'Mellon Collie and the Infinite Sadness': ['mellon collie and the infinite sadness (remastered)', 'mellon collie and the infinite sadness (deluxe edition)']
    },
    'joy division': {
      'Unknown Pleasures': ['unknown pleasures (collector\'s edition)', 'unknown pleasures']
    },
    'joyce manor': {
      'Joyce Manor': ['joyce manor', 's/t']
    },
    'david bowie': {
      'Let\'s Dance': ['let\'s dance (2018 remaster)', 'let\'s dance (1999 remaster)']
    },
    'the tallest man on earth': {
      'There\'s No Leaving Now': ['there\'s no leaving now', 'there´s no leaving now']
    },
    'oasis': {
      '(What\'s The Story) Morning Glory?': ['(what\'s the story) morning glory? [remastered deluxe edition]', '(what\'s the story) morning glory? (deluxe remastered edition)'],
      'Definitely Maybe': ['definitely maybe (deluxe edition remastered)', 'definitely maybe']
    },
    'tigers jaw': {
      'Belongs To The Dead': ['belongs to the dead (remastered version)', 'belongs to the dead']
    },
    'kvelertak': {
      'Kvelertak': ['kvelertak (deluxe edition)', 'kvelertak']
    },
    'citizen': {
      'Life In Your Glass World': ['life in your glass world (deluxe edition)', 'life in your glass world']
    },
    'fleetwood mac': {
      'Rumours': ['rumours', 'rumours (super deluxe)'] 
    },
    'the velvet underground': {
      'The Velvet Underground & Nico 45th Anniversary': ['the velvet underground & nico 45th anniversary', 'the velvet underground & nico 45th anniversary (super deluxe edition)']
    },
    'the rolling stones': {
      'Exile On Main Street': ['exile on main street (deluxe version)', 'exile on main street (2010 re-mastered)']
    },
    'metallica': {
      'Kill \'Em All': ['kill \'em all (remastered)', 'kill \'em all']
    },
    'ben howard': {
      'Every Kingdom': ['every kingdom (deluxe version)', 'every kingdom']
    },
    'jokke med tourettes': {
      'Billig Lykke': ['billig lykke', 'billig lykke (re-mastret)']
    },
    'upstrokes': {
      'Gonna Get \'Em': ['gonna get \'em', 'gonna get\'em']
    },
    'kanye west': {
      'The College Dropout': ['the college dropout', 'the college dropout (explicit)']
    }
  };
  
  // Function to normalize album name for specific variations only
  function normalizeAlbumName(artistName: string, albumName: string): string {
    const artistKey = artistName.toLowerCase();
    const albumKey = albumName.toLowerCase();
    
    if (albumVariations[artistKey]) {
      for (const [baseAlbum, variations] of Object.entries(albumVariations[artistKey])) {
        if (variations.includes(albumKey)) {
          return baseAlbum;
        }
      }
    }
    return albumName; // Return original name for non-variations
  }
  
  const consolidatedMap = new Map<string, ConsolidatedAlbum>();
  let duplicatesRemoved = 0;
  
  for (const album of albums) {
    const normalizedAlbumName = normalizeAlbumName(album.artist.name, album.album.name);
    const key = `${album.artist.name}|||${normalizedAlbumName}`.toLowerCase();
    
    if (consolidatedMap.has(key)) {
      // Album already exists, consolidate the data
      const existing = consolidatedMap.get(key)!;
      duplicatesRemoved++;
      
      // Add counts and durations
      existing.count += album.count;
      existing.duration_ms += album.duration_ms;
      existing.consolidated_count++;
      existing.original_albumIds.push(album.albumId);
      existing.original_counts.push(album.count);
      
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
      const consolidatedAlbum = {
        ...album,
        album: {
          ...album.album,
          name: normalizedAlbumName // Use normalized name for the consolidated album
        },
        consolidated_count: 1,
        original_albumIds: [album.albumId],
        original_counts: [album.count]
      };
      consolidatedMap.set(key, consolidatedAlbum);
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
  
  // Create consolidation summary table
  console.log(`\n--- CONSOLIDATION SUMMARY ---`);
  console.log('┌─────────────────────┬─────────────┐');
  console.log('│ Metric              │ Value       │');
  console.log('├─────────────────────┼─────────────┤');
  console.log(`│ Original albums     │ ${albums.length.toString().padStart(11)} │`);
  console.log(`│ Consolidated albums │ ${consolidatedAlbums.length.toString().padStart(11)} │`);
  console.log(`│ Duplicates removed  │ ${duplicatesRemoved.toString().padStart(11)} │`);
  console.log(`│ Consolidation rate  │ ${consolidationRate.padStart(10)}% │`);
  console.log('└─────────────────────┴─────────────┘');
  
  // Log top 500 albums in table format
  console.log(`\n--- TOP 500 ALBUMS ---`);
  console.log('┌─────┬─────────────────────────────────────────────────────────────────────────────────────────────┬─────────────┬─────────────┬─────────────────────────────┐');
  console.log('│Rank │ Album & Artist                                                                              │Total Plays │Consolidated│ Original Play Counts         │');
  console.log('├─────┼─────────────────────────────────────────────────────────────────────────────────────────────┼─────────────┼─────────────┼─────────────────────────────┤');
  
  consolidatedAlbums.forEach((album) => {
    const albumArtist = `${album.artist.name} - "${album.album.name}"`;
    const truncatedAlbumArtist = albumArtist.length > 75 ? albumArtist.substring(0, 72) + '...' : albumArtist;
    const consolidationInfo = album.consolidated_count > 1 ? `${album.consolidated_count}` : '1';
    const originalCounts = album.consolidated_count > 1 ? album.original_counts.join(', ') : album.count.toString();
    const truncatedOriginalCounts = originalCounts.length > 25 ? originalCounts.substring(0, 22) + '...' : originalCounts;
    
    console.log(`│${album.rank.toString().padStart(4)} │ ${truncatedAlbumArtist.padEnd(75)} │${album.count.toString().padStart(11)} │${consolidationInfo.padStart(11)} │ ${truncatedOriginalCounts.padEnd(25)} │`);
  });
  
  console.log('└─────┴─────────────────────────────────────────────────────────────────────────────────────────────┴─────────────┴─────────────┴─────────────────────────────┘');
  
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
