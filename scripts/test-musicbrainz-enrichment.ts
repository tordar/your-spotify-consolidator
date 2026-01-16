import * as fs from 'fs';
import * as path from 'path';
import { MusicBrainzApiClient } from './cleaner/utils/musicbrainz-api-client';

interface ArtistGenreData {
  name: string;
  play_count: number;
  genres: string[];
}

interface GenresDataFile {
  metadata: {
    totalArtists: number;
    minPlayCount: number;
    timestamp: string;
    source: string;
  };
  artists: ArtistGenreData[];
}

/**
 * Test script to enrich existing all-artists-genres data with MusicBrainz
 */
async function testMusicBrainzEnrichment() {
  console.log('🧪 Testing MusicBrainz Genre Enrichment');
  console.log('========================================\n');

  // Find the latest all-artists-genres file
  const dataDir = path.join(process.cwd(), 'data/cleaned-data');
  const files = fs.readdirSync(dataDir);
  const genreFiles = files
    .filter(f => f.startsWith('all-artists-genres-') && f.endsWith('.json'))
    .sort()
    .reverse();

  if (genreFiles.length === 0) {
    console.error('❌ No all-artists-genres files found');
    process.exit(1);
  }

  const latestFile = genreFiles[0];
  const filePath = path.join(dataDir, latestFile);
  
  console.log(`📁 Loading data from: ${latestFile}`);
  const fileContents = fs.readFileSync(filePath, 'utf-8');
  const data: GenresDataFile = JSON.parse(fileContents);
  
  console.log(`✅ Loaded ${data.artists.length} artists`);
  console.log(`   Artists with < 3 genres: ${data.artists.filter(a => !a.genres || a.genres.length < 3).length}`);
  console.log(`   Artists with 0 genres: ${data.artists.filter(a => !a.genres || a.genres.length === 0).length}\n`);

  // Filter artists that need enrichment (< 3 genres)
  const artistsNeedingEnrichment = data.artists.filter(artist => 
    !artist.genres || artist.genres.length < 3
  );

  if (artistsNeedingEnrichment.length === 0) {
    console.log('✅ All artists already have 3+ genres, nothing to enrich');
    return;
  }

  // Process all artists needing enrichment
  const artistsToEnrich = artistsNeedingEnrichment;
  console.log(`📥 Processing all ${artistsToEnrich.length} artists needing enrichment with MusicBrainz...\n`);

  const mbClient = new MusicBrainzApiClient();
  const artistNames = artistsToEnrich.map(a => a.name);
  const mbGenres = await mbClient.searchArtistsGenres(artistNames);

  // Merge MusicBrainz genres with existing genres
  let enrichedCount = 0;
  let totalGenresAdded = 0;
  
  data.artists.forEach(artist => {
    const nameKey = artist.name.toLowerCase().trim();
    const mbGenresForArtist = mbGenres.get(nameKey);
    
    if (mbGenresForArtist && mbGenresForArtist.length > 0) {
      // Merge genres, avoiding duplicates
      const existingGenres = new Set((artist.genres || []).map(g => g.toLowerCase()));
      let addedGenres = 0;
      
      // Limit to first 5 genres from MusicBrainz
      const genresToAdd = mbGenresForArtist.slice(0, 5);
      
      genresToAdd.forEach(genre => {
        if (!existingGenres.has(genre)) {
          artist.genres = artist.genres || [];
          artist.genres.push(genre);
          existingGenres.add(genre);
          addedGenres++;
          totalGenresAdded++;
        }
      });
      
      if (addedGenres > 0) {
        enrichedCount++;
      }
    }
  });

  console.log(`\n✅ Enrichment complete!`);
  console.log(`   Enriched ${enrichedCount} artists`);
  console.log(`   Added ${totalGenresAdded} total genres`);
  console.log(`   Artists with < 3 genres after enrichment: ${data.artists.filter(a => !a.genres || a.genres.length < 3).length}\n`);

  // Update metadata
  data.metadata.timestamp = new Date().toISOString();
  if (!data.metadata.source.includes('MusicBrainz')) {
    data.metadata.source = 'Merged Streaming History + MusicBrainz Enrichment';
  }
  
  // Save enriched data - create new file with timestamp
  const timestamp = Date.now();
  const outputFile = path.join(dataDir, `all-artists-genres-${timestamp}.json`);
  
  fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
  console.log(`💾 Saved enriched data to: ${path.basename(outputFile)}`);
  console.log(`\n✅ All artists have been processed!`);
  
  // Show some examples
  console.log('\n📊 Sample enriched artists:');
  const enrichedArtists = data.artists
    .filter(a => mbGenres.has(a.name.toLowerCase().trim()))
    .slice(0, 5);
  
  enrichedArtists.forEach(artist => {
    const before = artistsToEnrich.find(a => a.name === artist.name);
    const beforeCount = before?.genres?.length || 0;
    const afterCount = artist.genres?.length || 0;
    console.log(`   ${artist.name}: ${beforeCount} → ${afterCount} genres`);
    if (artist.genres) {
      console.log(`      Genres: ${artist.genres.slice(0, 5).join(', ')}${artist.genres.length > 5 ? '...' : ''}`);
    }
  });
}

// Run the script
if (require.main === module) {
  testMusicBrainzEnrichment().catch(error => {
    console.error('💥 Error:', error);
    process.exit(1);
  });
}

export { testMusicBrainzEnrichment };

