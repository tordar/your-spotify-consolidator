#!/usr/bin/env tsx

/**
 * Script to display artists and their albums from the cleaned top-albums JSON file
 * Groups albums by artist and shows them in a readable format
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
  consolidated_count: number;
  original_albumIds: string[];
  rank: number;
}

interface ArtistAlbums {
  artistName: string;
  albums: CleanedAlbum[];
  totalAlbums: number;
  totalPlays: number;
  genres: string[];
}

function findLatestCleanedAlbumsFile(): string {
  const files = fs.readdirSync('.')
    .filter(file => file.startsWith('cleaned-top-albums-') && file.endsWith('.json'))
    .sort()
    .reverse();
  
  if (files.length === 0) {
    throw new Error('No cleaned-top-albums JSON files found in current directory');
  }
  
  return files[0];
}

function groupAlbumsByArtist(albums: CleanedAlbum[]): ArtistAlbums[] {
  const artistMap = new Map<string, ArtistAlbums>();
  
  for (const album of albums) {
    const artistName = album.artist.name;
    
    if (artistMap.has(artistName)) {
      const existing = artistMap.get(artistName)!;
      existing.albums.push(album);
      existing.totalAlbums += 1;
      existing.totalPlays += album.count;
      
      // Merge genres (remove duplicates)
      const mergedGenres = [...new Set([...existing.genres, ...album.artist.genres])];
      existing.genres = mergedGenres;
    } else {
      artistMap.set(artistName, {
        artistName,
        albums: [album],
        totalAlbums: 1,
        totalPlays: album.count,
        genres: [...album.artist.genres]
      });
    }
  }
  
  // Convert to array and sort by total albums (descending), then by total plays
  return Array.from(artistMap.values())
    .sort((a, b) => {
      if (a.totalAlbums !== b.totalAlbums) {
        return b.totalAlbums - a.totalAlbums;
      }
      return b.totalPlays - a.totalPlays;
    });
}

function displayArtistAlbumsSummary() {
  try {
    // Find the latest cleaned albums file
    const jsonFile = findLatestCleanedAlbumsFile();
    console.log(`📁 Reading data from: ${jsonFile}\n`);
    
    // Read and parse the JSON file
    const rawData = fs.readFileSync(jsonFile, 'utf8');
    const data = JSON.parse(rawData);
    
    if (!data.albums || !Array.isArray(data.albums)) {
      throw new Error('Invalid JSON structure: albums array not found');
    }
    
    console.log(`📊 Found ${data.albums.length} albums in the file\n`);
    
    // Group albums by artist
    const artistAlbums = groupAlbumsByArtist(data.albums);
    
    // Display summary
    console.log('🎵 --- ARTISTS AND THEIR ALBUMS IN TOP 500 ---\n');
    
    artistAlbums.forEach((artistData, index) => {
      console.log(`🎤 ${index + 1}. ${artistData.artistName}`);
      console.log(`   📊 ${artistData.totalAlbums} album${artistData.totalAlbums > 1 ? 's' : ''} | ${artistData.totalPlays} total plays`);
      console.log(`   📀 Albums:`);
      
      // Sort albums by rank (ascending)
      const sortedAlbums = artistData.albums.sort((a, b) => a.rank - b.rank);
      
      sortedAlbums.forEach((album) => {
        console.log(`      #${album.rank.toString().padStart(3)} - "${album.album.name}" (${album.count} plays)`);
      });
      
      console.log(''); // Empty line for readability
    });
    
    // Summary statistics
    console.log('📈 --- SUMMARY STATISTICS ---');
    console.log(`Total artists: ${artistAlbums.length}`);
    console.log(`Total albums: ${data.albums.length}`);
    
    const artistsWithMultipleAlbums = artistAlbums.filter(artist => artist.totalAlbums > 1);
    console.log(`Artists with multiple albums: ${artistsWithMultipleAlbums.length}`);
    
    if (artistsWithMultipleAlbums.length > 0) {
      console.log('\n🏆 --- ARTISTS WITH MOST ALBUMS ---');
      artistsWithMultipleAlbums.slice(0, 10).forEach((artist, index) => {
        console.log(`${(index + 1).toString().padStart(2)}. ${artist.artistName} - ${artist.totalAlbums} albums (${artist.totalPlays} total plays)`);
      });
    }
    
    console.log('\n🎉 Summary completed successfully!');
    
  } catch (error) {
    console.error('\n💥 Script failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  displayArtistAlbumsSummary();
}

export { displayArtistAlbumsSummary, groupAlbumsByArtist };
