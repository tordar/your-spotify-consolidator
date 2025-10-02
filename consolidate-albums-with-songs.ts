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

// Song within album
interface AlbumSong {
  songId: string;
  name: string;
  duration_ms: number;
  track_number: number;
  disc_number: number;
  explicit: boolean;
  preview_url: string | null;
  external_urls: Record<string, string>;
  play_count: number;
  total_listening_time_ms: number;
  artists: string[]; // artist names
}

// Album with expanded songs
interface AlbumWithSongs {
  albumId: string;
  name: string;
  album_type: string;
  artists: string[]; // artist names
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
  
  // Album statistics
  total_play_count: number;
  total_listening_time_ms: number;
  total_songs: number;
  played_songs: number;
  unplayed_songs: number;
  
  // Songs breakdown
  songs: AlbumSong[];
  
  // Consolidation info
  consolidated_count: number;
  original_albumIds: string[];
  original_counts: number[];
  rank?: number;
}

interface CleanResults {
  metadata: {
    originalTotalAlbums: number;
    consolidatedTotalAlbums: number;
    duplicatesRemoved: number;
    consolidationRate: number;
    timestamp: string;
    source: string;
    totalListeningEvents: number;
  };
  albums: AlbumWithSongs[];
}

// Function to parse JSONL (one JSON object per line)
function parseJSONL<T>(filename: string): T[] {
  const content = fs.readFileSync(filename, 'utf8');
  const lines = content.trim().split('\n');
  return lines.map(line => JSON.parse(line));
}

// Function to consolidate albums by name and first artist
function consolidateAlbumsWithSongs(albums: AlbumWithSongs[]): AlbumWithSongs[] {
  console.log('🔄 Consolidating albums with songs...');
  
  const consolidationMap = new Map<string, AlbumWithSongs>();
  let duplicatesRemoved = 0;
  
  albums.forEach(album => {
    const firstArtist = album.artists[0] || 'Unknown Artist';
    const key = `${album.name.toLowerCase().trim()}|${firstArtist.toLowerCase().trim()}`;
    
    if (consolidationMap.has(key)) {
      const existing = consolidationMap.get(key)!;
      
      // Merge album statistics
      existing.total_play_count += album.total_play_count;
      existing.total_listening_time_ms += album.total_listening_time_ms;
      // Don't sum total_songs - we'll recalculate after merging songs
      // existing.total_songs += album.total_songs; // REMOVED
      // Don't sum played_songs - we'll recalculate after merging songs  
      // existing.played_songs += album.played_songs; // REMOVED
      // Don't sum unplayed_songs - we'll recalculate after merging songs
      // existing.unplayed_songs += album.unplayed_songs; // REMOVED
      existing.consolidated_count += album.consolidated_count;
      existing.original_albumIds.push(...album.original_albumIds);
      existing.original_counts.push(...album.original_counts);
      
      // Merge songs (consolidate by song name)
      const songMap = new Map<string, AlbumSong>();
      
      // Add existing songs
      existing.songs.forEach(song => {
        const songKey = `${song.name.toLowerCase().trim()}|${song.artists.join(', ').toLowerCase()}`;
        songMap.set(songKey, song);
      });
      
      // Add new songs
      album.songs.forEach(song => {
        const songKey = `${song.name.toLowerCase().trim()}|${song.artists.join(', ').toLowerCase()}`;
        
        if (songMap.has(songKey)) {
          const existingSong = songMap.get(songKey)!;
          existingSong.play_count += song.play_count;
          existingSong.total_listening_time_ms += song.total_listening_time_ms;
        } else {
          songMap.set(songKey, song);
        }
      });
      
      existing.songs = Array.from(songMap.values()).sort((a, b) => b.play_count - a.play_count);
      
      // Recalculate song counts after merging
      existing.total_songs = existing.songs.length;
      existing.played_songs = existing.songs.filter(song => song.play_count > 0).length;
      existing.unplayed_songs = existing.songs.filter(song => song.play_count === 0).length;
      
      duplicatesRemoved++;
    } else {
      // Sort songs by play count
      album.songs = album.songs.sort((a, b) => b.play_count - a.play_count);
      consolidationMap.set(key, album);
    }
  });
  
  const consolidatedAlbums = Array.from(consolidationMap.values())
    .sort((a, b) => b.total_play_count - a.total_play_count)
    .map((album, index) => ({
      ...album,
      rank: index + 1
    }));
  
  console.log(`📊 Albums: ${albums.length} → ${consolidatedAlbums.length} (${duplicatesRemoved} duplicates removed)`);
  return consolidatedAlbums;
}

// Main function
function consolidateAlbumsWithSongsData(maxResults: number = 100) {
  try {
    console.log('🔄 Starting album consolidation with song breakdown...');
    
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
    
    // Group tracks by album
    const tracksByAlbum = new Map<string, MongoTrack[]>();
    tracks.forEach(track => {
      if (!tracksByAlbum.has(track.album)) {
        tracksByAlbum.set(track.album, []);
      }
      tracksByAlbum.get(track.album)!.push(track);
    });
    
    console.log(`📊 Found ${tracksByAlbum.size} albums with tracks`);
    
    // Transform albums with song breakdown
    console.log('🔄 Transforming albums with song breakdown...');
    const albumsWithSongs: AlbumWithSongs[] = [];
    
    tracksByAlbum.forEach((albumTracks, albumId) => {
      const album = albumMap.get(albumId);
      if (!album) return;
      
      // Get artist names
      const artistNames = album.artists.map(artistId => {
        const artist = artistMap.get(artistId);
        return artist ? artist.name : 'Unknown Artist';
      });
      
      // Process songs in this album
      const albumSongs: AlbumSong[] = [];
      let totalPlayCount = 0;
      let totalListeningTime = 0;
      let playedSongs = 0;
      
      albumTracks.forEach(track => {
        const playCount = songPlayCounts.get(track.id) || 0;
        const totalListeningTimeMs = track.duration_ms * playCount;
        
        // Get track artist names
        const trackArtistNames = track.artists.map(artistId => {
          const artist = artistMap.get(artistId);
          return artist ? artist.name : 'Unknown Artist';
        });
        
        albumSongs.push({
          songId: track.id,
          name: track.name,
          duration_ms: track.duration_ms,
          track_number: track.track_number,
          disc_number: track.disc_number,
          explicit: track.explicit,
          preview_url: track.preview_url,
          external_urls: track.external_urls,
          play_count: playCount,
          total_listening_time_ms: totalListeningTimeMs,
          artists: trackArtistNames
        });
        
        totalPlayCount += playCount;
        totalListeningTime += totalListeningTimeMs;
        if (playCount > 0) playedSongs++;
      });
      
      // Only include albums that have at least one played song
      if (totalPlayCount > 0) {
        albumsWithSongs.push({
          albumId: album.id,
          name: album.name,
          album_type: album.album_type || 'album',
          artists: artistNames,
          release_date: album.release_date || '',
          release_date_precision: album.release_date_precision || 'day',
          popularity: album.popularity || 0,
          images: album.images || [],
          external_urls: album.external_urls || {},
          genres: album.genres || [],
          
          total_play_count: totalPlayCount,
          total_listening_time_ms: totalListeningTime,
          total_songs: albumTracks.length,
          played_songs: playedSongs,
          unplayed_songs: albumTracks.length - playedSongs,
          
          songs: albumSongs,
          
          consolidated_count: totalPlayCount,
          original_albumIds: [album.id],
          original_counts: [totalPlayCount]
        });
      }
    });
    
    console.log(`📊 Created ${albumsWithSongs.length} albums with song breakdown`);
    
    // Consolidate albums
    const consolidatedAlbums = consolidateAlbumsWithSongs(albumsWithSongs);
    
    // Limit results
    const finalAlbums = consolidatedAlbums.slice(0, maxResults);
    
    // Create output
    const timestamp = Date.now();
    const results: CleanResults = {
      metadata: {
        originalTotalAlbums: albumsWithSongs.length,
        consolidatedTotalAlbums: finalAlbums.length,
        duplicatesRemoved: albumsWithSongs.length - consolidatedAlbums.length,
        consolidationRate: Math.round(((albumsWithSongs.length - consolidatedAlbums.length) / albumsWithSongs.length) * 100 * 100) / 100,
        timestamp: new Date().toISOString(),
        source: 'MongoDB Export with Listening History and Song Breakdown',
        totalListeningEvents: listeningHistory.length
      },
      albums: finalAlbums
    };
    
    // Save file
    const outputFile = `cleaned-data/cleaned-albums-with-songs-${timestamp}.json`;
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    
    console.log(`\n📁 Album data with songs saved to: ${outputFile}`);
    console.log(`🎉 Album consolidation with songs completed successfully!`);
    
    // Show summary statistics
    console.log(`\n📊 FINAL SUMMARY:`);
    console.log(`┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐`);
    console.log(`│Album        │Total Songs │Played Songs │Total Plays  │Total Time   │`);
    console.log(`├─────────────┼─────────────┼─────────────┼─────────────┼─────────────┤`);
    
    finalAlbums.slice(0, 10).forEach(album => {
      const albumName = album.name.length > 10 ? album.name.substring(0, 10) + '...' : album.name;
      const totalMinutes = Math.round(album.total_listening_time_ms / 60000);
      console.log(`│${albumName.padEnd(11)} │${album.total_songs.toString().padStart(11)} │${album.played_songs.toString().padStart(11)} │${album.total_play_count.toString().padStart(11)} │${totalMinutes.toString().padStart(10)}m │`);
    });
    
    console.log(`└─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘`);
    
    // Show top songs from top album
    if (finalAlbums.length > 0) {
      const topAlbum = finalAlbums[0];
      console.log(`\n🎵 TOP SONGS FROM "${topAlbum.name}":`);
      console.log(`┌─────┬─────────────────────────────────────────────────────────────────────────────────────────────┬─────────────┬─────────────┐`);
      console.log(`│Rank │ Song Name                                                                                │Play Count  │Total Time   │`);
      console.log(`├─────┼─────────────────────────────────────────────────────────────────────────────────────────────┼─────────────┼─────────────┤`);
      
      topAlbum.songs.slice(0, 10).forEach((song, index) => {
        const songName = song.name.length > 95 ? song.name.substring(0, 92) + '...' : song.name;
        const totalMinutes = Math.round(song.total_listening_time_ms / 60000);
        console.log(`│${(index + 1).toString().padStart(3)} │ ${songName.padEnd(95)} │${song.play_count.toString().padStart(11)} │${totalMinutes.toString().padStart(10)}m │`);
      });
      
      console.log(`└─────┴─────────────────────────────────────────────────────────────────────────────────────────────┴─────────────┴─────────────┘`);
    }
    
    return results;
  } catch (error) {
    console.error('\n💥 Script failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  consolidateAlbumsWithSongsData();
}

export { consolidateAlbumsWithSongsData };
