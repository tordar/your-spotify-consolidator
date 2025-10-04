import * as fs from 'fs';

// Types for MongoDB data
interface MongoTrack {
  _id: { $oid: string };
  id: string;
  name: string;
  album: string; // album ID
  artists: string[]; // artist IDs
  duration_ms: number;
  popularity: number;
  preview_url: string | null;
  external_urls: { spotify: string };
  track_number: number;
  disc_number: number;
  explicit: boolean;
  available_markets: string[];
  external_ids: { isrc: string };
  href: string;
  is_local: boolean;
  type: string;
  uri: string;
  __v: number;
}

interface MongoAlbum {
  _id: { $oid: string };
  id: string;
  name: string;
  artists: string[]; // artist IDs
  album_type: string;
  release_date: string;
  release_date_precision: string;
  popularity: number;
  images: Array<{
    height: number;
    url: string;
    width: number;
  }>;
  external_urls: { spotify: string };
  href: string;
  type: string;
  uri: string;
  genres: string[];
  copyrights: Array<{ text: string; type: string }>;
  external_ids: { upc: string };
  available_markets: string[];
  __v: number;
}

interface MongoArtist {
  _id: { $oid: string };
  id: string;
  name: string;
  genres: string[];
  popularity: number;
  followers: { href: string | null; total: number };
  images: Array<{
    height: number;
    url: string;
    width: number;
  }>;
  external_urls: { spotify: string };
  href: string;
  type: string;
  uri: string;
  __v: number;
}

interface ListeningHistory {
  _id: { $oid: string };
  owner: { $oid: string };
  id: string; // song ID
  played_at: { $date: string };
  __v: number;
  albumId: string;
  artistIds: string[];
  durationMs: number;
  primaryArtistId: string;
}

// Output types
interface Song {
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
  consolidated_count: number;
  original_songIds: string[];
}

interface ConsolidatedSong extends Song {
  original_counts: number[];
  rank?: number;
}

interface Album {
  duration_ms: number;
  count: number;
  differents: number;
  primaryAlbumId: string;
  total_count: number;
  total_duration_ms: number;
  album: {
    name: string;
    album_type: string;
    artists: string[];
    release_date: string;
    release_date_precision: string;
    popularity: number;
    images: Array<{
      height: number;
      url: string;
      width: number;
    }>;
    external_urls: Record<string, string>;
    genres: string[];
  };
  consolidated_count: number;
  original_albumIds: string[];
}

interface ConsolidatedAlbum extends Album {
  original_counts: number[];
  rank?: number;
}

interface Artist {
  duration_ms: number;
  count: number;
  differents: number;
  primaryArtistId: string;
  total_count: number;
  total_duration_ms: number;
  artist: {
    name: string;
    genres: string[];
    popularity: number;
    followers: {
      total: number;
    };
    images: Array<{
      height: number;
      url: string;
      width: number;
    }>;
    external_urls: Record<string, string>;
  };
  consolidated_count: number;
  original_artistIds: string[];
}

interface ConsolidatedArtist extends Artist {
  original_counts: number[];
  rank?: number;
}

interface CleanResults {
  metadata: {
    originalTotalSongs?: number;
    consolidatedTotalSongs?: number;
    originalTotalAlbums?: number;
    consolidatedTotalAlbums?: number;
    originalTotalArtists?: number;
    consolidatedTotalArtists?: number;
    duplicatesRemoved: number;
    consolidationRate: number;
    timestamp: string;
    source: string;
    totalListeningEvents?: number;
  };
  songs?: ConsolidatedSong[];
  albums?: ConsolidatedAlbum[];
  artists?: ConsolidatedArtist[];
}

// Function to parse JSONL (one JSON object per line)
function parseJSONL<T>(filename: string): T[] {
  const content = fs.readFileSync(filename, 'utf8');
  const lines = content.trim().split('\n');
  return lines.map(line => JSON.parse(line));
}

// Function to consolidate songs by name and artist
function consolidateSongs(songs: Song[]): ConsolidatedSong[] {
  console.log('🔄 Consolidating songs...');
  
  const consolidationMap = new Map<string, ConsolidatedSong>();
  let duplicatesRemoved = 0;
  
  songs.forEach(song => {
    const key = `${song.song.name.toLowerCase().trim()}|${song.artist.name.toLowerCase().trim()}`;
    
    if (consolidationMap.has(key)) {
      const existing = consolidationMap.get(key)!;
      
      existing.count += song.count;
      existing.consolidated_count += song.count;
      existing.duration_ms += song.duration_ms; // Add total listening times together
      existing.original_songIds.push(song.songId);
      existing.original_counts.push(song.count);
      
      duplicatesRemoved++;
    } else {
      consolidationMap.set(key, {
        ...song,
        consolidated_count: song.count,
        original_counts: [song.count]
      });
    }
  });
  
  const consolidatedSongs = Array.from(consolidationMap.values())
    .sort((a, b) => b.count - a.count)
    .map((song, index) => ({
      ...song,
      rank: index + 1
    }));
  
  console.log(`📊 Songs: ${songs.length} → ${consolidatedSongs.length} (${duplicatesRemoved} duplicates removed)`);
  return consolidatedSongs;
}

// Function to consolidate albums by name and first artist
function consolidateAlbums(albums: Album[]): ConsolidatedAlbum[] {
  console.log('🔄 Consolidating albums...');
  
  const consolidationMap = new Map<string, ConsolidatedAlbum>();
  let duplicatesRemoved = 0;
  
  albums.forEach(album => {
    const firstArtist = album.album.artists[0] || 'Unknown Artist';
    const key = `${album.album.name.toLowerCase().trim()}|${firstArtist.toLowerCase().trim()}`;
    
    if (consolidationMap.has(key)) {
      const existing = consolidationMap.get(key)!;
      
      existing.count += album.count;
      existing.total_count += album.total_count;
      existing.duration_ms += album.duration_ms;
      existing.total_duration_ms += album.total_duration_ms;
      existing.differents += album.differents;
      existing.consolidated_count += album.count;
      existing.original_albumIds.push(album.primaryAlbumId);
      existing.original_counts.push(album.count);
      
      duplicatesRemoved++;
    } else {
      consolidationMap.set(key, {
        ...album,
        consolidated_count: album.count,
        original_counts: [album.count]
      });
    }
  });
  
  const consolidatedAlbums = Array.from(consolidationMap.values())
    .sort((a, b) => b.count - a.count)
    .map((album, index) => ({
      ...album,
      rank: index + 1
    }));
  
  console.log(`📊 Albums: ${albums.length} → ${consolidatedAlbums.length} (${duplicatesRemoved} duplicates removed)`);
  return consolidatedAlbums;
}

// Function to consolidate artists by name
function consolidateArtists(artists: Artist[]): ConsolidatedArtist[] {
  console.log('🔄 Consolidating artists...');
  
  const consolidationMap = new Map<string, ConsolidatedArtist>();
  let duplicatesRemoved = 0;
  
  artists.forEach(artist => {
    const key = artist.artist.name.toLowerCase().trim();
    
    if (consolidationMap.has(key)) {
      const existing = consolidationMap.get(key)!;
      
      existing.count += artist.count;
      existing.total_count += artist.total_count;
      existing.duration_ms += artist.duration_ms;
      existing.total_duration_ms += artist.total_duration_ms;
      existing.differents += artist.differents;
      existing.consolidated_count += artist.count;
      existing.original_artistIds.push(artist.primaryArtistId);
      existing.original_counts.push(artist.count);
      
      duplicatesRemoved++;
    } else {
      consolidationMap.set(key, {
        ...artist,
        consolidated_count: artist.count,
        original_counts: [artist.count]
      });
    }
  });
  
  const consolidatedArtists = Array.from(consolidationMap.values())
    .sort((a, b) => b.count - a.count)
    .map((artist, index) => ({
      ...artist,
      rank: index + 1
    }));
  
  console.log(`📊 Artists: ${artists.length} → ${consolidatedArtists.length} (${duplicatesRemoved} duplicates removed)`);
  return consolidatedArtists;
}

// Main function
function consolidateAllMongoDBData(maxResults: number = 500) {
  try {
    console.log('🔄 Starting unified MongoDB data consolidation...');
    
    // Read all raw MongoDB data
    console.log('📁 Reading raw MongoDB data...');
    const tracks = parseJSONL<MongoTrack>('raw-mongo-data/raw_tracks.json');
    const albums = parseJSONL<MongoAlbum>('raw-mongo-data/raw_albums.json');
    const artists = parseJSONL<MongoArtist>('raw-mongo-data/raw_artists.json');
    const listeningHistory = parseJSONL<ListeningHistory>('raw-mongo-data/raw_listening_history.json');
    
    console.log(`📊 Found ${tracks.length} tracks, ${albums.length} albums, ${artists.length} artists, ${listeningHistory.length} listening events`);
    
    // Create lookup maps
    const trackMap = new Map<string, MongoTrack>();
    const albumMap = new Map<string, MongoAlbum>();
    const artistMap = new Map<string, MongoArtist>();
    
    tracks.forEach(track => trackMap.set(track.id, track));
    albums.forEach(album => albumMap.set(album.id, album));
    artists.forEach(artist => artistMap.set(artist.id, artist));
    
    console.log('📊 Created lookup maps');
    
    // Count plays per song
    const songPlayCounts = new Map<string, number>();
    listeningHistory.forEach(event => {
      const songId = event.id;
      songPlayCounts.set(songId, (songPlayCounts.get(songId) || 0) + 1);
    });
    
    // Count plays per album
    const albumStats = new Map<string, {
      playCount: number;
      totalDurationMs: number;
      differentSongs: Set<string>;
    }>();
    
    listeningHistory.forEach(entry => {
      const track = trackMap.get(entry.id);
      if (track) {
        if (!albumStats.has(entry.albumId)) {
          albumStats.set(entry.albumId, {
            playCount: 0,
            totalDurationMs: 0,
            differentSongs: new Set()
          });
        }
        
        const stats = albumStats.get(entry.albumId)!;
        stats.playCount++;
        stats.totalDurationMs += track.duration_ms;
        stats.differentSongs.add(track.id);
      }
    });
    
    // Count plays per artist
    const artistStats = new Map<string, {
      playCount: number;
      totalDurationMs: number;
      differentSongs: Set<string>;
    }>();
    
    listeningHistory.forEach(entry => {
      const track = trackMap.get(entry.id);
      if (track) {
        track.artists.forEach(artistId => {
          if (!artistStats.has(artistId)) {
            artistStats.set(artistId, {
              playCount: 0,
              totalDurationMs: 0,
              differentSongs: new Set()
            });
          }
          
          const stats = artistStats.get(artistId)!;
          stats.playCount++;
          stats.totalDurationMs += track.duration_ms;
          stats.differentSongs.add(track.id);
        });
      }
    });
    
    console.log(`📊 Found ${songPlayCounts.size} songs, ${albumStats.size} albums, ${artistStats.size} artists with listening history`);
    
    // Transform songs
    console.log('🔄 Transforming songs...');
    const songs: Song[] = [];
    
    tracks.forEach(track => {
      const playCount = songPlayCounts.get(track.id) || 0;
      if (playCount > 0) { // Only include songs that were actually played
        const album = albumMap.get(track.album);
        const artist = artistMap.get(track.artists[0]);
        
        songs.push({
          duration_ms: track.duration_ms * playCount, // Total listening time = song duration × play count
          count: playCount,
          songId: track.id,
          song: {
            name: track.name,
            preview_url: track.preview_url,
            external_urls: track.external_urls
          },
          album: album ? {
            name: album.name,
            images: album.images || []
          } : {
            name: 'Unknown Album',
            images: []
          },
          artist: artist ? {
            name: artist.name,
            genres: artist.genres || []
          } : {
            name: 'Unknown Artist',
            genres: []
          },
          consolidated_count: playCount,
          original_songIds: [track.id]
        });
      }
    });
    
    // Transform albums
    console.log('🔄 Transforming albums...');
    const albumsWithCounts: Album[] = [];
    
    albumStats.forEach((stats, albumId) => {
      const album = albumMap.get(albumId);
      if (album) {
        const artistNames = album.artists.map(artistId => {
          const artist = artistMap.get(artistId);
          return artist ? artist.name : 'Unknown Artist';
        });
        
        albumsWithCounts.push({
          duration_ms: stats.totalDurationMs,
          count: stats.playCount,
          differents: stats.differentSongs.size,
          primaryAlbumId: album.id,
          total_count: stats.playCount,
          total_duration_ms: stats.totalDurationMs,
          album: {
            name: album.name,
            album_type: album.album_type || 'album',
            artists: artistNames,
            release_date: album.release_date || '',
            release_date_precision: album.release_date_precision || 'day',
            popularity: album.popularity || 0,
            images: album.images || [],
            external_urls: album.external_urls || {},
            genres: album.genres || []
          },
          consolidated_count: stats.playCount,
          original_albumIds: [album.id]
        });
      }
    });
    
    // Transform artists
    console.log('🔄 Transforming artists...');
    const artistsWithCounts: Artist[] = [];
    
    artistStats.forEach((stats, artistId) => {
      const artist = artistMap.get(artistId);
      if (artist) {
        artistsWithCounts.push({
          duration_ms: stats.totalDurationMs,
          count: stats.playCount,
          differents: stats.differentSongs.size,
          primaryArtistId: artist.id,
          total_count: stats.playCount,
          total_duration_ms: stats.totalDurationMs,
          artist: {
            name: artist.name,
            genres: artist.genres || [],
            popularity: artist.popularity || 0,
            followers: {
              total: artist.followers?.total || 0
            },
            images: artist.images || [],
            external_urls: artist.external_urls || {}
          },
          consolidated_count: stats.playCount,
          original_artistIds: [artist.id]
        });
      }
    });
    
    // Consolidate all data
    const consolidatedSongs = consolidateSongs(songs);
    const consolidatedAlbums = consolidateAlbums(albumsWithCounts);
    const consolidatedArtists = consolidateArtists(artistsWithCounts);
    
    // Limit results
    const finalSongs = consolidatedSongs.slice(0, maxResults);
    const finalAlbums = consolidatedAlbums.slice(0, maxResults);
    const finalArtists = consolidatedArtists.slice(0, maxResults);
    
    // Create output files
    const timestamp = Date.now();
    
    // Songs output
    const songsOutput: CleanResults = {
      metadata: {
        originalTotalSongs: songs.length,
        consolidatedTotalSongs: finalSongs.length,
        duplicatesRemoved: songs.length - consolidatedSongs.length,
        consolidationRate: Math.round(((songs.length - consolidatedSongs.length) / songs.length) * 100 * 100) / 100,
        timestamp: new Date().toISOString(),
        source: 'MongoDB Export with Listening History',
        totalListeningEvents: listeningHistory.length
      },
      songs: finalSongs
    };
    
    // Albums output
    const albumsOutput: CleanResults = {
      metadata: {
        originalTotalAlbums: albumsWithCounts.length,
        consolidatedTotalAlbums: finalAlbums.length,
        duplicatesRemoved: albumsWithCounts.length - consolidatedAlbums.length,
        consolidationRate: Math.round(((albumsWithCounts.length - consolidatedAlbums.length) / albumsWithCounts.length) * 100 * 100) / 100,
        timestamp: new Date().toISOString(),
        source: 'MongoDB Export with Listening History',
        totalListeningEvents: listeningHistory.length
      },
      albums: finalAlbums
    };
    
    // Artists output
    const artistsOutput: CleanResults = {
      metadata: {
        originalTotalArtists: artistsWithCounts.length,
        consolidatedTotalArtists: finalArtists.length,
        duplicatesRemoved: artistsWithCounts.length - consolidatedArtists.length,
        consolidationRate: Math.round(((artistsWithCounts.length - consolidatedArtists.length) / artistsWithCounts.length) * 100 * 100) / 100,
        timestamp: new Date().toISOString(),
        source: 'MongoDB Export with Listening History',
        totalListeningEvents: listeningHistory.length
      },
      artists: finalArtists
    };
    
    // Save all files
    const songsFile = `cleaned-data/cleaned-songs-${timestamp}.json`;
    const albumsFile = `cleaned-data/cleaned-albums-${timestamp}.json`;
    const artistsFile = `cleaned-data/cleaned-artists-${timestamp}.json`;
    
    fs.writeFileSync(songsFile, JSON.stringify(songsOutput, null, 2));
    fs.writeFileSync(albumsFile, JSON.stringify(albumsOutput, null, 2));
    fs.writeFileSync(artistsFile, JSON.stringify(artistsOutput, null, 2));
    
    console.log(`\n📁 All cleaned data saved:`);
    console.log(`- Songs: ${songsFile}`);
    console.log(`- Albums: ${albumsFile}`);
    console.log(`- Artists: ${artistsFile}`);
    
    console.log(`\n🎉 Unified consolidation completed successfully!`);
    
    // Show summary statistics
    console.log(`\n📊 FINAL SUMMARY:`);
    console.log(`┌─────────────┬─────────────┬─────────────┬─────────────┐`);
    console.log(`│Type         │Original     │Consolidated │Duplicates   │`);
    console.log(`├─────────────┼─────────────┼─────────────┼─────────────┤`);
    console.log(`│Songs        │${songs.length.toString().padStart(11)} │${finalSongs.length.toString().padStart(11)} │${(songs.length - consolidatedSongs.length).toString().padStart(11)} │`);
    console.log(`│Albums       │${albumsWithCounts.length.toString().padStart(11)} │${finalAlbums.length.toString().padStart(11)} │${(albumsWithCounts.length - consolidatedAlbums.length).toString().padStart(11)} │`);
    console.log(`│Artists      │${artistsWithCounts.length.toString().padStart(11)} │${finalArtists.length.toString().padStart(11)} │${(artistsWithCounts.length - consolidatedArtists.length).toString().padStart(11)} │`);
    console.log(`└─────────────┴─────────────┴─────────────┴─────────────┘`);
    
    return { songsOutput, albumsOutput, artistsOutput };
  } catch (error) {
    console.error('\n💥 Script failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  consolidateAllMongoDBData();
}

export { consolidateAllMongoDBData };
