import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listUserFiles, downloadFile, uploadFile, deleteUserCategoryFiles } from '@/lib/storage'
import { getSpotifyAccessToken } from '@/lib/spotify-token'
import { supabaseAdmin } from '@/lib/supabase'

// Generate UUID that works in Edge runtime
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Import types and classes from the scripts
// We'll need to adapt these to work server-side
interface CompleteListeningHistory {
  metadata: {
    totalSongs: number
    totalListeningEvents: number
    totalListeningTime: number
    dateRange?: {
      earliest: string
      latest: string
    }
    timestamp?: string
    source?: string
  }
  songs: any[]
}

interface CleanedSong {
  rank: number
  duration_ms: number
  count: number
  songId: string
  song: any
  album: any
  artist: any
  consolidated_count: number
  original_songIds: string[]
}

interface CleanedArtist {
  rank: number
  duration_ms: number
  count: number
  differents: number
  primaryArtistId: string
  total_count: number
  total_duration_ms: number
  artist: any
  consolidated_count: number
  original_artistIds: string[]
}

interface AlbumWithSongs {
  rank: number
  duration_ms: number
  count: number
  differents: number
  primaryAlbumId: string
  total_count: number
  total_duration_ms: number
  album: any
  consolidated_count: number
  original_albumIds: string[]
  total_songs: number
  played_songs: number
  unplayed_songs: number
  songs: any[]
  earliest_played_at?: string
}

interface DetailedStats {
  yearlyListeningTime: any[]
  yearlyTopItems: any[]
  totalListeningHours: number
  totalListeningDays: number
  totalListeningEvents: number
  hourlyListeningDistribution: any[]
}

/**
 * Simplified consolidation logic (inline version)
 */
function consolidateSongs(songs: CleanedSong[]): CleanedSong[] {
  // Group by normalized song name and artist
  const songMap = new Map<string, CleanedSong>()
  
  songs.forEach(song => {
    const key = `${song.song.name?.toLowerCase().trim()}|${song.artist.name?.toLowerCase().trim()}`
    
    if (songMap.has(key)) {
      const existing = songMap.get(key)!
      existing.count += song.count
      existing.duration_ms += song.duration_ms
      existing.consolidated_count += song.consolidated_count
      existing.original_songIds.push(...song.original_songIds)
    } else {
      songMap.set(key, { ...song })
    }
  })
  
  return Array.from(songMap.values())
}

function consolidateArtists(artists: CleanedArtist[]): CleanedArtist[] {
  const artistMap = new Map<string, CleanedArtist>()
  
  artists.forEach(artist => {
    const key = artist.artist.name?.toLowerCase().trim() || ''
    
    if (artistMap.has(key)) {
      const existing = artistMap.get(key)!
      existing.count += artist.count
      existing.duration_ms += artist.duration_ms
      existing.total_count += artist.total_count
      existing.total_duration_ms += artist.total_duration_ms
      existing.consolidated_count += artist.consolidated_count
      existing.original_artistIds.push(...artist.original_artistIds)
    } else {
      artistMap.set(key, { ...artist })
    }
  })
  
  return Array.from(artistMap.values())
}

function consolidateAlbums(albums: AlbumWithSongs[]): AlbumWithSongs[] {
  const albumMap = new Map<string, AlbumWithSongs>()
  
  albums.forEach(album => {
    const key = `${album.album.name?.toLowerCase().trim()}|${album.album.artists?.[0]?.toLowerCase().trim() || ''}`
    
    if (albumMap.has(key)) {
      const existing = albumMap.get(key)!
      existing.count += album.count
      existing.duration_ms += album.duration_ms
      existing.total_count += album.total_count
      existing.total_duration_ms += album.total_duration_ms
      existing.consolidated_count += album.consolidated_count
      existing.original_albumIds.push(...album.original_albumIds)
    } else {
      albumMap.set(key, { ...album })
    }
  })
  
  return Array.from(albumMap.values())
}

/**
 * Generate cleaned songs from history
 */
function generateCleanedSongs(history: CompleteListeningHistory): { songs: CleanedSong[], originalCount: number, consolidatedCount: number } {
  const songs: CleanedSong[] = history.songs.map(song => ({
    rank: 0,
    duration_ms: song.totalListeningTime,
    count: song.playCount,
    songId: song.songId,
    song: {
      name: song.name,
      preview_url: song.preview_url,
      external_urls: song.external_urls
    },
    album: {
      name: song.album.name,
      images: song.album.images
    },
    artist: {
      name: song.artist.name,
      genres: song.artist.genres
    },
    consolidated_count: song.playCount,
    original_songIds: [song.songId]
  }))

  songs.sort((a, b) => b.count - a.count)
  const consolidatedSongs = consolidateSongs(songs)
  const topSongs = consolidatedSongs.slice(0, 500).map((song, index) => ({
    ...song,
    rank: index + 1
  }))
  
  return {
    songs: topSongs,
    originalCount: songs.length,
    consolidatedCount: consolidatedSongs.length
  }
}

/**
 * Generate cleaned artists from history
 */
function generateCleanedArtists(history: CompleteListeningHistory): { artists: CleanedArtist[], originalCount: number, consolidatedCount: number } {
  const artistMap = new Map<string, {
    songs: any[]
    totalPlayCount: number
    totalListeningTime: number
    differentSongs: Set<string>
  }>()

  history.songs.forEach(song => {
    const artistName = song.artist.name
    
    if (!artistMap.has(artistName)) {
      artistMap.set(artistName, {
        songs: [],
        totalPlayCount: 0,
        totalListeningTime: 0,
        differentSongs: new Set()
      })
    }
    
    const artistData = artistMap.get(artistName)!
    artistData.songs.push(song)
    artistData.totalPlayCount += song.playCount
    artistData.totalListeningTime += song.totalListeningTime
    artistData.differentSongs.add(song.songId)
  })

  const artists: CleanedArtist[] = Array.from(artistMap.entries()).map(([artistName, data]) => {
    const firstSong = data.songs[0]
    
    return {
      rank: 0,
      duration_ms: data.songs.reduce((sum, song) => sum + song.duration_ms, 0),
      count: data.totalPlayCount,
      differents: data.differentSongs.size,
      primaryArtistId: firstSong.songId,
      total_count: data.totalPlayCount,
      total_duration_ms: data.totalListeningTime,
      artist: {
        name: artistName,
        genres: firstSong.artist.genres,
        popularity: 0,
        followers: { total: 0 },
        images: [],
        external_urls: {}
      },
      consolidated_count: data.totalPlayCount,
      original_artistIds: [firstSong.songId]
    }
  })

  artists.sort((a, b) => b.count - a.count)
  const consolidatedArtists = consolidateArtists(artists)
  const topArtists = consolidatedArtists.slice(0, 500).map((artist, index) => ({
    ...artist,
    rank: index + 1
  }))
  
  return {
    artists: topArtists,
    originalCount: artists.length,
    consolidatedCount: consolidatedArtists.length
  }
}

/**
 * Generate albums with songs from history
 */
function generateAlbumsWithSongs(history: CompleteListeningHistory): { albums: AlbumWithSongs[], originalCount: number } {
  const albumMap = new Map<string, any[]>()

  history.songs.forEach(song => {
    if (!song.album.name || song.album.name.trim() === '') {
      return
    }
    
    const albumName = song.album.name.trim()
    const songArtist = (song.artists?.[0] || song.artist.name || 'Unknown Artist').trim()
    const albumKey = `${albumName}|${songArtist.toLowerCase()}`
    
    if (!albumMap.has(albumKey)) {
      albumMap.set(albumKey, [])
    }
    albumMap.get(albumKey)!.push(song)
  })

  const albumsWithSongs: AlbumWithSongs[] = Array.from(albumMap.entries()).map(([albumKey, songs]) => {
    const representativeSong = songs[0]
    const totalPlayCount = songs.reduce((sum, song) => sum + song.playCount, 0)
    const totalListeningTime = songs.reduce((sum, song) => sum + song.totalListeningTime, 0)
    const playedSongs = songs.filter(song => song.playCount > 0).length
    
    const albumSongs = songs.map(song => ({
      songId: song.songId,
      name: song.name,
      duration_ms: song.duration_ms,
      track_number: 1,
      disc_number: 1,
      explicit: false,
      preview_url: song.preview_url,
      external_urls: song.external_urls,
      play_count: song.playCount,
      total_listening_time_ms: song.totalListeningTime,
      artists: song.artists || [song.artist.name]
    }))

    return {
      rank: 0,
      duration_ms: totalListeningTime,
      count: totalPlayCount,
      differents: songs.length,
      primaryAlbumId: representativeSong.songId,
      total_count: totalPlayCount,
      total_duration_ms: totalListeningTime,
      album: {
        name: representativeSong.album.name,
        album_type: 'album',
        artists: [representativeSong.artists?.[0] || representativeSong.artist.name || 'Unknown Artist'],
        release_date: '',
        release_date_precision: 'day',
        popularity: 0,
        images: representativeSong.album.images,
        external_urls: {},
        genres: representativeSong.artist.genres
      },
      consolidated_count: totalPlayCount,
      original_albumIds: songs.map(song => song.album.id).filter(id => id !== ''),
      total_songs: songs.length,
      played_songs: playedSongs,
      unplayed_songs: songs.length - playedSongs,
      songs: albumSongs.sort((a, b) => b.play_count - a.play_count)
    }
  })

  albumsWithSongs.sort((a, b) => b.count - a.count)
  const consolidatedAlbums = consolidateAlbums(albumsWithSongs)
  const rankedAlbums = consolidatedAlbums.slice(0, 500).map((album, index) => ({
    ...album,
    rank: index + 1
  }))
  
  return { albums: rankedAlbums, originalCount: albumsWithSongs.length }
}

/**
 * Calculate detailed statistics
 */
function calculateDetailedStats(history: CompleteListeningHistory): DetailedStats {
  const yearlyMap = new Map<string, { totalMs: number; playCount: number }>()
  const yearlySongsMap = new Map<string, Map<string, { playCount: number; totalMs: number; name: string; artist: string; images: Array<{ height: number; url: string; width: number }> }>>()
  const yearlyArtistsMap = new Map<string, Map<string, { playCount: number; totalMs: number; uniqueSongs: Set<string>; images: Array<{ height: number; url: string; width: number }> }>>()
  const yearlyAlbumsMap = new Map<string, Map<string, { playCount: number; totalMs: number; albumName: string; artist: string; uniqueSongs: Set<string>; images: Array<{ height: number; url: string; width: number }> }>>()
  const hourlyMap = new Map<number, { totalMs: number; playCount: number }>()
  
  for (let hour = 0; hour < 24; hour++) {
    hourlyMap.set(hour, { totalMs: 0, playCount: 0 })
  }
  
  history.songs.forEach(song => {
    song.listeningEvents?.forEach((event: any) => {
      const eventDate = new Date(event.playedAt)
      const year = eventDate.getFullYear().toString()
      const hour = eventDate.getHours()
      
      const hourData = hourlyMap.get(hour)!
      hourData.totalMs += event.msPlayed
      hourData.playCount += 1
      
      if (!yearlyMap.has(year)) {
        yearlyMap.set(year, { totalMs: 0, playCount: 0 })
      }
      const yearData = yearlyMap.get(year)!
      yearData.totalMs += event.msPlayed
      yearData.playCount += 1
      
      // Track songs per year
      if (!yearlySongsMap.has(year)) {
        yearlySongsMap.set(year, new Map())
      }
      const yearSongsMap = yearlySongsMap.get(year)!
      if (!yearSongsMap.has(song.songId)) {
        yearSongsMap.set(song.songId, {
          playCount: 0,
          totalMs: 0,
          name: song.name,
          artist: song.artist.name || song.artists?.[0] || 'Unknown Artist',
          images: song.album.images || []
        })
      }
      const songData = yearSongsMap.get(song.songId)!
      songData.playCount += 1
      songData.totalMs += event.msPlayed
      if (song.album.images && song.album.images.length > 0 && (!songData.images || songData.images.length === 0)) {
        songData.images = song.album.images
      }
      
      // Track artists per year
      if (!yearlyArtistsMap.has(year)) {
        yearlyArtistsMap.set(year, new Map())
      }
      const yearArtistsMap = yearlyArtistsMap.get(year)!
      const artistName = song.artist.name || song.artists?.[0] || 'Unknown Artist'
      if (!yearArtistsMap.has(artistName)) {
        yearArtistsMap.set(artistName, {
          playCount: 0,
          totalMs: 0,
          uniqueSongs: new Set(),
          images: []
        })
      }
      const artistData = yearArtistsMap.get(artistName)!
      artistData.playCount += 1
      artistData.totalMs += event.msPlayed
      artistData.uniqueSongs.add(song.songId)
      if (song.album.images && song.album.images.length > 0) {
        if (artistData.images.length === 0) {
          artistData.images = song.album.images
        } else {
          const currentMaxHeight = Math.max(...artistData.images.map(img => img.height))
          const newMaxHeight = Math.max(...song.album.images.map(img => img.height))
          if (newMaxHeight > currentMaxHeight) {
            artistData.images = song.album.images
          }
        }
      }
      
      // Track albums per year
      if (!yearlyAlbumsMap.has(year)) {
        yearlyAlbumsMap.set(year, new Map())
      }
      const yearAlbumsMap = yearlyAlbumsMap.get(year)!
      const albumName = song.album.name || 'Unknown Album'
      const albumArtist = song.artist.name || song.artists?.[0] || 'Unknown Artist'
      const albumKey = `${albumName}|${albumArtist}`
      if (!yearAlbumsMap.has(albumKey)) {
        yearAlbumsMap.set(albumKey, {
          playCount: 0,
          totalMs: 0,
          albumName: albumName,
          artist: albumArtist,
          uniqueSongs: new Set(),
          images: song.album.images || []
        })
      }
      const albumData = yearAlbumsMap.get(albumKey)!
      albumData.playCount += 1
      albumData.totalMs += event.msPlayed
      albumData.uniqueSongs.add(song.songId)
      if (song.album.images && song.album.images.length > 0) {
        if (!albumData.images || albumData.images.length === 0) {
          albumData.images = song.album.images
        } else {
          const currentMaxHeight = Math.max(...albumData.images.map(img => img.height))
          const newMaxHeight = Math.max(...song.album.images.map(img => img.height))
          if (newMaxHeight > currentMaxHeight) {
            albumData.images = song.album.images
          }
        }
      }
    })
  })
  
  const yearlyListeningTime = Array.from(yearlyMap.entries())
    .map(([year, data]) => ({
      year,
      totalListeningTimeMs: data.totalMs,
      totalListeningHours: Math.round((data.totalMs / (1000 * 60 * 60)) * 100) / 100,
      playCount: data.playCount
    }))
    .sort((a, b) => a.year.localeCompare(b.year))
  
  // Calculate top songs, artists, and albums per year
  const yearlyTopItems = Array.from(yearlySongsMap.keys())
    .sort()
    .map(year => {
      // Get top 5 songs for this year
      const songsMap = yearlySongsMap.get(year)!
      const topSongs = Array.from(songsMap.entries())
        .map(([songId, data]) => ({
          songId,
          name: data.name,
          artist: data.artist,
          playCount: data.playCount,
          totalListeningTimeMs: data.totalMs,
          images: data.images || []
        }))
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, 5)
      
      // Get top 5 artists for this year
      const artistsMap = yearlyArtistsMap.get(year)!
      const topArtists = Array.from(artistsMap.entries())
        .map(([artistName, data]) => ({
          artistName,
          playCount: data.playCount,
          totalListeningTimeMs: data.totalMs,
          uniqueSongs: data.uniqueSongs.size,
          images: data.images || []
        }))
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, 5)
      
      // Get top 5 albums for this year
      const albumsMap = yearlyAlbumsMap.get(year)!
      const topAlbums = Array.from(albumsMap.entries())
        .map(([albumKey, data]) => ({
          albumName: data.albumName,
          artist: data.artist,
          playCount: data.playCount,
          totalListeningTimeMs: data.totalMs,
          uniqueSongs: data.uniqueSongs.size,
          images: data.images || []
        }))
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, 5)
      
      return {
        year,
        topSongs,
        topArtists,
        topAlbums
      }
    })
  
  const totalListeningTimeMs = yearlyListeningTime.reduce((sum, year) => sum + year.totalListeningTimeMs, 0)
  const totalListeningHours = Math.round((totalListeningTimeMs / (1000 * 60 * 60)) * 100) / 100
  const totalListeningDays = Math.round((totalListeningHours / 24) * 100) / 100
  
  const hourlyListeningDistribution = Array.from(hourlyMap.entries())
    .map(([hour, data]) => ({
      hour,
      totalListeningTimeMs: data.totalMs,
      totalListeningHours: Math.round((data.totalMs / (1000 * 60 * 60)) * 100) / 100,
      playCount: data.playCount
    }))
    .sort((a, b) => a.hour - b.hour)
  
  return {
    yearlyListeningTime,
    yearlyTopItems,
    totalListeningHours,
    totalListeningDays,
    totalListeningEvents: history.metadata.totalListeningEvents,
    hourlyListeningDistribution
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Check if user has Spotify connected (optional but recommended for metadata enrichment)
    let hasSpotify = false
    try {
      const { data } = await supabaseAdmin!
        .from('accounts')
        .select('id')
        .eq('user_id', userId)
        .eq('provider', 'spotify')
        .single()
      hasSpotify = !!data
    } catch (error) {
      // Spotify not connected, continue without enrichment
    }

    // Find the latest merged history file
    const mergedFiles = await listUserFiles(userId, 'merged-history')
    const mergedHistoryFiles = mergedFiles
      .filter(filename => filename.startsWith('merged-streaming-history-') && filename.endsWith('.json'))
      .sort((a, b) => {
        const timestampA = parseInt(a.match(/merged-streaming-history-(\d+)\.json/)?.[1] || '0')
        const timestampB = parseInt(b.match(/merged-streaming-history-(\d+)\.json/)?.[1] || '0')
        return timestampB - timestampA
      })

    if (mergedHistoryFiles.length === 0) {
      return NextResponse.json({ 
        error: 'No merged streaming history found. Please merge your history first.' 
      }, { status: 400 })
    }

    const latestMergedFile = mergedHistoryFiles[0]
    console.log(`📁 Loading merged history from: ${latestMergedFile}`)

    // Download merged history
    const mergedHistoryArrayBuffer = await downloadFile(userId, 'merged-history', latestMergedFile)
    const mergedHistoryBuffer = Buffer.from(mergedHistoryArrayBuffer)
    const mergedHistory: CompleteListeningHistory = JSON.parse(mergedHistoryBuffer.toString('utf-8'))

    console.log(`✅ Loaded ${mergedHistory.songs.length} songs from merged history`)

    // Generate cleaned files
    console.log('🎵 Generating cleaned songs...')
    const songsResult = generateCleanedSongs(mergedHistory)
    
    console.log('👤 Generating cleaned artists...')
    const artistsResult = generateCleanedArtists(mergedHistory)
    
    console.log('💿 Generating albums with songs...')
    const albumsResult = generateAlbumsWithSongs(mergedHistory)
    
    console.log('📊 Calculating detailed statistics...')
    const detailedStats = calculateDetailedStats(mergedHistory)

    // TODO: Add Spotify API enrichment if token is available
    // This would require adapting the enrichment logic from the script
    // For now, we'll generate the files without enrichment

    // Delete old cleaned files
    await deleteUserCategoryFiles(userId, 'cleaned-data')

    // Generate timestamp for filenames
    const timestamp = Date.now()

    // Upload cleaned files
    console.log('📤 Uploading cleaned files...')
    
    const songsFile = Buffer.from(JSON.stringify({
      metadata: {
        originalTotalSongs: songsResult.originalCount,
        consolidatedTotalSongs: songsResult.consolidatedCount,
        duplicatesRemoved: songsResult.originalCount - songsResult.consolidatedCount,
        consolidationRate: Math.round(((songsResult.originalCount - songsResult.consolidatedCount) / songsResult.originalCount) * 100 * 100) / 100,
        timestamp: new Date().toISOString(),
        source: 'Merged Streaming History',
        totalListeningEvents: mergedHistory.metadata.totalListeningEvents
      },
      songs: songsResult.songs
    }, null, 2))

    const artistsFile = Buffer.from(JSON.stringify({
      metadata: {
        originalTotalArtists: artistsResult.originalCount,
        consolidatedTotalArtists: artistsResult.consolidatedCount,
        duplicatesRemoved: artistsResult.originalCount - artistsResult.consolidatedCount,
        consolidationRate: Math.round(((artistsResult.originalCount - artistsResult.consolidatedCount) / artistsResult.originalCount) * 100 * 100) / 100,
        timestamp: new Date().toISOString(),
        source: 'Merged Streaming History',
        totalListeningEvents: mergedHistory.metadata.totalListeningEvents
      },
      artists: artistsResult.artists
    }, null, 2))

    const albumsFile = Buffer.from(JSON.stringify({
      metadata: {
        originalTotalAlbums: albumsResult.originalCount,
        consolidatedTotalAlbums: albumsResult.albums.length,
        duplicatesRemoved: albumsResult.originalCount - albumsResult.albums.length,
        consolidationRate: Math.round(((albumsResult.originalCount - albumsResult.albums.length) / albumsResult.originalCount) * 100 * 100) / 100,
        timestamp: new Date().toISOString(),
        source: 'Merged Streaming History',
        totalListeningEvents: mergedHistory.metadata.totalListeningEvents
      },
      albums: albumsResult.albums
    }, null, 2))

    const statsFile = Buffer.from(JSON.stringify(detailedStats, null, 2))

    // Upload files sequentially
    await uploadFile(userId, 'cleaned-data', `cleaned-songs-${timestamp}.json`, songsFile)
    await uploadFile(userId, 'cleaned-data', `cleaned-artists-${timestamp}.json`, artistsFile)
    await uploadFile(userId, 'cleaned-data', `cleaned-albums-with-songs-${timestamp}.json`, albumsFile)
    await uploadFile(userId, 'cleaned-data', `detailed-stats-${timestamp}.json`, statsFile)

    // Save metadata to database
    const fileMetadata = [
      {
        id: generateUUID(),
        user_id: userId,
        category: 'cleaned-data',
        filename: `cleaned-songs-${timestamp}.json`,
        storage_path: `${userId}/cleaned-data/cleaned-songs-${timestamp}.json`,
        file_size: songsFile.length,
        content_type: 'application/json',
        metadata: {
          timestamp: new Date().toISOString(),
          type: 'cleaned-songs',
          songCount: songsResult.songs.length
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: generateUUID(),
        user_id: userId,
        category: 'cleaned-data',
        filename: `cleaned-artists-${timestamp}.json`,
        storage_path: `${userId}/cleaned-data/cleaned-artists-${timestamp}.json`,
        file_size: artistsFile.length,
        content_type: 'application/json',
        metadata: {
          timestamp: new Date().toISOString(),
          type: 'cleaned-artists',
          artistCount: artistsResult.artists.length
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: generateUUID(),
        user_id: userId,
        category: 'cleaned-data',
        filename: `cleaned-albums-with-songs-${timestamp}.json`,
        storage_path: `${userId}/cleaned-data/cleaned-albums-with-songs-${timestamp}.json`,
        file_size: albumsFile.length,
        content_type: 'application/json',
        metadata: {
          timestamp: new Date().toISOString(),
          type: 'cleaned-albums-with-songs',
          albumCount: albumsResult.albums.length
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: generateUUID(),
        user_id: userId,
        category: 'cleaned-data',
        filename: `detailed-stats-${timestamp}.json`,
        storage_path: `${userId}/cleaned-data/detailed-stats-${timestamp}.json`,
        file_size: statsFile.length,
        content_type: 'application/json',
        metadata: {
          timestamp: new Date().toISOString(),
          type: 'detailed-stats'
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ]

    await supabaseAdmin!
      .from('user_files')
      .insert(fileMetadata)

    console.log('✅ All cleaned files generated and uploaded successfully')

    return NextResponse.json({
      success: true,
      message: 'Cleaned files generated successfully',
      data: {
        songs: {
          count: songsResult.songs.length,
          originalCount: songsResult.originalCount,
          consolidatedCount: songsResult.consolidatedCount
        },
        artists: {
          count: artistsResult.artists.length,
          originalCount: artistsResult.originalCount,
          consolidatedCount: artistsResult.consolidatedCount
        },
        albums: {
          count: albumsResult.albums.length,
          originalCount: albumsResult.originalCount
        },
        stats: {
          totalListeningHours: detailedStats.totalListeningHours,
          totalListeningDays: detailedStats.totalListeningDays,
          totalListeningEvents: detailedStats.totalListeningEvents
        },
        timestamp,
        hasSpotifyEnrichment: hasSpotify // Indicate if Spotify enrichment was available
      }
    })

  } catch (error: any) {
    console.error('Error generating cleaned files:', error)
    return NextResponse.json({ 
      error: 'Failed to generate cleaned files',
      details: error.message 
    }, { status: 500 })
  }
}

