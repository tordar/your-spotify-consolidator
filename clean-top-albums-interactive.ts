#!/usr/bin/env tsx

/**
 * Script to clean and consolidate duplicate albums from the top-albums JSON file
 * Consolidates albums with the same artist.name and album.name
 * Includes interactive consolidation suggestions for potential matches
 */

import fs from 'fs';
import * as readline from 'readline';

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

interface ConsolidationRule {
  artistName: string;
  baseAlbumName: string;
  variations: string[];
}

interface ConsolidationRules {
  rules: ConsolidationRule[];
  timestamp: string;
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

function loadConsolidationRules(): ConsolidationRules {
  const rulesFile = 'album-consolidation-rules.json';
  
  if (fs.existsSync(rulesFile)) {
    try {
      const data = fs.readFileSync(rulesFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.log('⚠️  Could not load existing consolidation rules, starting fresh');
    }
  }
  
  return {
    rules: [],
    timestamp: new Date().toISOString()
  };
}

function saveConsolidationRules(rules: ConsolidationRules): void {
  const rulesFile = 'album-consolidation-rules.json';
  fs.writeFileSync(rulesFile, JSON.stringify(rules, null, 2));
  console.log(`💾 Consolidation rules saved to: ${rulesFile}`);
}

function findPotentialMatches(albums: CleanedAlbum[], consolidationRules: ConsolidationRules): Array<{artist: string, albums: CleanedAlbum[]}> {
  const artistMap = new Map<string, CleanedAlbum[]>();
  
  // Group albums by artist
  albums.forEach(album => {
    const artistName = album.artist.name.toLowerCase();
    if (!artistMap.has(artistName)) {
      artistMap.set(artistName, []);
    }
    artistMap.get(artistName)!.push(album);
  });
  
  const potentialMatches: Array<{artist: string, albums: CleanedAlbum[]}> = [];
  
  // Find artists with multiple albums that might be variations
  artistMap.forEach((artistAlbums, artistName) => {
    if (artistAlbums.length > 1) {
      // Look for albums with similar names (same base name with different suffixes)
      const albumGroups = new Map<string, CleanedAlbum[]>();
      
      artistAlbums.forEach(album => {
        const albumName = album.album.name.toLowerCase();
        
        // Try to find a base name by removing common suffixes
        const baseName = albumName
          .replace(/\s*\([^)]*\)/g, '') // Remove (remastered), (deluxe), etc.
          .replace(/\s*\[[^\]]*\]/g, '') // Remove [remastered], [deluxe], etc.
          .replace(/\s*(remastered|deluxe|explicit|super deluxe|anniversary|edition|version|re-mastered|re-mastret).*$/i, '')
          .trim();
        
        if (!albumGroups.has(baseName)) {
          albumGroups.set(baseName, []);
        }
        albumGroups.get(baseName)!.push(album);
      });
      
      // Find groups with multiple albums (potential matches)
      albumGroups.forEach((groupAlbums, baseName) => {
        if (groupAlbums.length > 1) {
          // Check if this group already has a rule
          const existingRule = consolidationRules.rules.find(rule => 
            rule.artistName.toLowerCase() === artistName &&
            rule.variations.some(variation => 
              groupAlbums.some(album => album.album.name.toLowerCase() === variation)
            )
          );
          
          if (existingRule) {
            // Skip - already handled by existing rule
            console.log(`✅ Skipping ${artistAlbums[0].artist.name} - "${baseName}" (already has rule)`);
            return;
          }
          
          // Check if all album names are identical (exact matches)
          const albumNames = groupAlbums.map(album => album.album.name);
          const allIdentical = albumNames.every(name => name === albumNames[0]);
          
          // Check if all album names are identical when normalized (case-insensitive)
          const normalizedNames = groupAlbums.map(album => album.album.name.toLowerCase());
          const allNormalizedIdentical = normalizedNames.every(name => name === normalizedNames[0]);
          
          if (allIdentical || allNormalizedIdentical) {
            // Auto-consolidate identical album names (exact or case-insensitive)
            // Sort by play count to get the most played version first
            const sortedAlbums = groupAlbums.sort((a, b) => b.count - a.count);
            const canonicalName = sortedAlbums[0].album.name; // Use the most played version
            
            console.log(`🔄 Auto-consolidating identical albums: ${artistAlbums[0].artist.name} - "${canonicalName}"`);
            
            // Add to auto-consolidation rules
            const autoRule: ConsolidationRule = {
              artistName: artistAlbums[0].artist.name,
              baseAlbumName: canonicalName,
              variations: groupAlbums.map(album => album.album.name.toLowerCase())
            };
            consolidationRules.rules.push(autoRule);
          } else {
            // Ask user for non-identical matches
            potentialMatches.push({
              artist: artistAlbums[0].artist.name, // Use original case
              albums: groupAlbums
            });
          }
        }
      });
    }
  });
  
  return potentialMatches;
}

function findIdenticalAlbums(albums: CleanedAlbum[]): Array<{artist: string, albumName: string, variations: string[]}> {
  const artistMap = new Map<string, CleanedAlbum[]>();
  
  // Group albums by artist
  albums.forEach(album => {
    const artistName = album.artist.name.toLowerCase();
    if (!artistMap.has(artistName)) {
      artistMap.set(artistName, []);
    }
    artistMap.get(artistName)!.push(album);
  });
  
  const identicalAlbums: Array<{artist: string, albumName: string, variations: string[]}> = [];
  
  // Find artists with multiple albums that have identical names
  artistMap.forEach((artistAlbums, artistName) => {
    if (artistAlbums.length > 1) {
      const albumGroups = new Map<string, CleanedAlbum[]>();
      
      artistAlbums.forEach(album => {
        const normalizedName = album.album.name.toLowerCase();
        if (!albumGroups.has(normalizedName)) {
          albumGroups.set(normalizedName, []);
        }
        albumGroups.get(normalizedName)!.push(album);
      });
      
      // Find groups with multiple albums (identical names when normalized)
      albumGroups.forEach((groupAlbums, normalizedName) => {
        if (groupAlbums.length > 1) {
          // Sort by play count to get the most played version first
          const sortedAlbums = groupAlbums.sort((a, b) => b.count - a.count);
          const baseName = sortedAlbums[0].album.name; // Use the most played version
          
          identicalAlbums.push({
            artist: artistAlbums[0].artist.name, // Use original case
            albumName: baseName,
            variations: groupAlbums.map(album => album.album.name.toLowerCase())
          });
        }
      });
    }
  });
  
  return identicalAlbums;
}

async function askUserConsolidation(artist: string, albums: CleanedAlbum[]): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log(`\n🤔 Potential consolidation for ${artist}:`);
  albums.forEach((album, index) => {
    console.log(`   ${index + 1}. "${album.album.name}" (${album.count} plays)`);
  });
  
  return new Promise((resolve) => {
    rl.question('Should these be consolidated? (y/n): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase().startsWith('y'));
    });
  });
}

async function askForBaseName(albums: CleanedAlbum[]): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log('\nWhich name should be used for the consolidated album?');
  albums.forEach((album, index) => {
    console.log(`   ${index + 1}. "${album.album.name}"`);
  });
  
  return new Promise((resolve) => {
    rl.question('Enter the number (1-' + albums.length + '): ', (answer) => {
      rl.close();
      const index = parseInt(answer) - 1;
      if (index >= 0 && index < albums.length) {
        resolve(albums[index].album.name);
      } else {
        resolve(albums[0].album.name); // Default to first album
      }
    });
  });
}

async function consolidateAlbums(albums: CleanedAlbum[]): Promise<CleanResults> {
  console.log(`Starting consolidation of ${albums.length} albums...`);
  
  // Load existing consolidation rules
  const consolidationRules = loadConsolidationRules();
  
  // Convert rules to a map for easy lookup
  const rulesMap = new Map<string, ConsolidationRule>();
  consolidationRules.rules.forEach(rule => {
    const key = `${rule.artistName.toLowerCase()}|||${rule.baseAlbumName.toLowerCase()}`;
    rulesMap.set(key, rule);
  });
  
  // Function to normalize album name using rules
  function normalizeAlbumName(artistName: string, albumName: string): string {
    const artistKey = artistName.toLowerCase();
    const albumKey = albumName.toLowerCase();
    const ruleKey = `${artistKey}|||${albumKey}`;
    
    // Check if there's a rule for this exact combination
    if (rulesMap.has(ruleKey)) {
      return rulesMap.get(ruleKey)!.baseAlbumName;
    }
    
    // Check if this album matches any variation in existing rules
    for (const rule of consolidationRules.rules) {
      if (rule.artistName.toLowerCase() === artistKey) {
        if (rule.variations.includes(albumKey)) {
          return rule.baseAlbumName;
        }
      }
    }
    
    return albumName; // Return original name for non-variations
  }
  
  // Find potential matches for interactive consolidation
  const potentialMatches = findPotentialMatches(albums, consolidationRules);
  console.log(`\n🔍 Found ${potentialMatches.length} potential consolidation opportunities (after skipping existing rules)`);
  
  // Auto-create rules for identical album names
  const identicalAlbums = findIdenticalAlbums(albums);
  identicalAlbums.forEach(({artist, albumName, variations}) => {
    const newRule: ConsolidationRule = {
      artistName: artist,
      baseAlbumName: albumName,
      variations: variations
    };
    consolidationRules.rules.push(newRule);
  });
  
  // Ask user about each potential match
  for (const match of potentialMatches) {
    const shouldConsolidate = await askUserConsolidation(match.artist, match.albums);
    
    if (shouldConsolidate) {
      // Automatically use the most played album name
      const sortedAlbums = match.albums.sort((a, b) => b.count - a.count);
      const baseName = sortedAlbums[0].album.name;
      
      // Create new consolidation rule
      const variations = match.albums.map(album => album.album.name.toLowerCase());
      const newRule: ConsolidationRule = {
        artistName: match.artist,
        baseAlbumName: baseName,
        variations: variations
      };
      
      consolidationRules.rules.push(newRule);
      console.log(`✅ Added consolidation rule: ${match.artist} - "${baseName}"`);
    }
  }
  
  // Save updated rules
  if (potentialMatches.length > 0) {
    consolidationRules.timestamp = new Date().toISOString();
    saveConsolidationRules(consolidationRules);
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

async function cleanTopAlbums() {
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
    const results = await consolidateAlbums(data.albums);
    
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
