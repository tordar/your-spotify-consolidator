import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getSpotifyAccessToken, hasSpotifyConnected } from '@/lib/spotify-token'
import { listUserFiles, downloadFile, uploadFile } from '@/lib/storage'
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

interface SpotifyTrack {
  id: string
  name: string
  duration_ms: number
  artists: Array<{
    id: string
    name: string
  }>
  album: {
    id: string
    name: string
    images: Array<{
      height: number
      url: string
      width: number
    }>
  }
  external_urls: {
    spotify: string
  }
  preview_url: string | null
}

interface SpotifyPlay {
  track: SpotifyTrack
  played_at: string
}

interface SpotifyRecentPlaysResponse {
  items: SpotifyPlay[]
  next: string | null
}

interface RecentPlayData {
  id: string
  name: string
  duration_ms: number
  artists: string[]
  album: {
    id: string
    name: string
    images: Array<{
      height: number
      url: string
      width: number
    }>
  }
  external_urls: {
    spotify: string
  }
  preview_url: string | null
  played_at: string
}

interface MergedStreamingHistory {
  metadata: {
    totalSongs: number
    totalPlayEvents: number
    dateRange: {
      earliest: string
      latest: string
    }
    filesProcessed: string[]
    timestamp: string
    source: string
  }
  songs: Array<{
    songId: string
    name: string
    duration_ms: number
    artists: string[]
    album: {
      id: string
      name: string
      images: Array<{
        height: number
        url: string
        width: number
      }>
    }
    artist: {
      name: string
      genres: string[]
    }
    external_urls: {
      spotify: string
    }
    preview_url: string | null
    playCount: number
    totalListeningTime: number
    listeningEvents: Array<{
      playedAt: string
      msPlayed: number
    }>
  }>
}

/**
 * POST /api/process/sync-spotify
 * Sync recent Spotify plays with user's merged history
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const userId = session.user.id

    console.log(`[Sync Spotify] Starting sync for user ${userId}`)

    // Check if user has Spotify connected
    const hasConnected = await hasSpotifyConnected(userId)
    if (!hasConnected) {
      return NextResponse.json(
        { error: 'Spotify account not connected. Please connect your Spotify account first.' },
        { status: 400 }
      )
    }

    // Get access token
    const accessToken = await getSpotifyAccessToken(userId)

    // Step 1: Check for new tracks
    
    // Get latest merged history file
    const mergedFiles = await listUserFiles(userId, 'merged-history')
    const streamingHistoryFiles = mergedFiles.filter(
      f => f.startsWith('merged-streaming-history-') && f.endsWith('.json')
    )

    let latestTimestamp: string | null = null
    if (streamingHistoryFiles.length > 0) {
      // Sort by timestamp (newest first)
      streamingHistoryFiles.sort((a, b) => {
        const timestampA = parseInt(a.match(/merged-streaming-history-(\d+)\.json/)?.[1] || '0')
        const timestampB = parseInt(b.match(/merged-streaming-history-(\d+)\.json/)?.[1] || '0')
        return timestampB - timestampA
      })

      const latestFile = streamingHistoryFiles[0]
      const fileBuffer = await downloadFile(userId, 'merged-history', latestFile)
      const fileContent = new TextDecoder().decode(fileBuffer)
      const historyData = JSON.parse(fileContent) as MergedStreamingHistory
      latestTimestamp = historyData.metadata?.dateRange?.latest || null
    }

    // Fetch recent plays from Spotify API
    const response = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=50', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to fetch recent plays: ${response.status} ${errorText}`)
    }

    const data = await response.json() as SpotifyRecentPlaysResponse
    
    if (!data.items || data.items.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No recent plays found',
        data: {
          newTracks: 0,
          totalPlays: 0
        }
      })
    }

    // Transform to our format
    const recentPlays: RecentPlayData[] = data.items.map(play => ({
      id: play.track.id,
      name: play.track.name,
      duration_ms: play.track.duration_ms,
      artists: play.track.artists.map(artist => artist.name),
      album: {
        id: play.track.album.id,
        name: play.track.album.name,
        images: play.track.album.images
      },
      external_urls: play.track.external_urls,
      preview_url: play.track.preview_url,
      played_at: play.played_at
    }))

    // Check if there are new tracks
    if (latestTimestamp) {
      const latestHistoryTime = new Date(latestTimestamp).getTime()
      const hasNewTracks = recentPlays.some(play => {
        const playedAtTime = new Date(play.played_at).getTime()
        return playedAtTime > latestHistoryTime
      })

      if (!hasNewTracks) {
        return NextResponse.json({
          success: true,
          message: 'No new tracks since last sync',
          data: {
            newTracks: 0,
            totalPlays: recentPlays.length,
            latestTimestamp
          }
        })
      }
    }

    // Step 2: Merge recent plays with existing history

    // Load existing merged history if it exists
    let existingSongs = new Map<string, MergedStreamingHistory['songs'][0]>()
    let allEntries: Array<{
      ts: string
      songId: string
      name: string
      duration_ms: number
      artists: string[]
      album: { id: string; name: string; images: any[] }
      external_urls: { spotify: string }
      preview_url: string | null
      ms_played: number
    }> = []

    if (streamingHistoryFiles.length > 0) {
      const latestFile = streamingHistoryFiles[0]
      const fileBuffer = await downloadFile(userId, 'merged-history', latestFile)
      const fileContent = new TextDecoder().decode(fileBuffer)
      const historyData = JSON.parse(fileContent) as MergedStreamingHistory

      // Convert existing songs to entries format for merging
      historyData.songs.forEach(song => {
        existingSongs.set(song.songId, song)
        song.listeningEvents.forEach(event => {
          allEntries.push({
            ts: event.playedAt,
            songId: song.songId,
            name: song.name,
            duration_ms: song.duration_ms,
            artists: song.artists,
            album: song.album,
            external_urls: song.external_urls,
            preview_url: song.preview_url,
            ms_played: event.msPlayed
          })
        })
      })
    }

    // Add new recent plays
    const newPlays = recentPlays.filter(play => {
      if (!latestTimestamp) return true
      return new Date(play.played_at).getTime() > new Date(latestTimestamp).getTime()
    })

    newPlays.forEach(play => {
      allEntries.push({
        ts: play.played_at,
        songId: play.id,
        name: play.name,
        duration_ms: play.duration_ms,
        artists: play.artists,
        album: play.album,
        external_urls: play.external_urls,
        preview_url: play.preview_url,
        ms_played: play.duration_ms // Approximate - API doesn't provide actual ms_played
      })
    })

    // Sort by timestamp
    allEntries.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())

    // Consolidate by song
    const songMap = new Map<string, MergedStreamingHistory['songs'][0]>()

    allEntries.forEach(entry => {
      if (songMap.has(entry.songId)) {
        const existing = songMap.get(entry.songId)!
        existing.playCount++
        existing.totalListeningTime += entry.ms_played
        existing.listeningEvents.push({
          playedAt: entry.ts,
          msPlayed: entry.ms_played
        })
      } else {
        const existingSong = existingSongs.get(entry.songId)
        songMap.set(entry.songId, {
          songId: entry.songId,
          name: entry.name,
          duration_ms: entry.duration_ms,
          artists: entry.artists,
          album: entry.album,
          artist: {
            name: entry.artists[0] || '',
            genres: existingSong?.artist?.genres || []
          },
          external_urls: entry.external_urls,
          preview_url: entry.preview_url,
          playCount: 1,
          totalListeningTime: entry.ms_played,
          listeningEvents: [{
            playedAt: entry.ts,
            msPlayed: entry.ms_played
          }]
        })
      }
    })

    // Sort listening events
    songMap.forEach(song => {
      song.listeningEvents.sort((a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime())
    })

    const consolidatedSongs = Array.from(songMap.values())
    const earliest = allEntries[0]?.ts
    const latest = allEntries[allEntries.length - 1]?.ts

    // Create merged data
    const mergedData: MergedStreamingHistory = {
      metadata: {
        totalSongs: consolidatedSongs.length,
        totalPlayEvents: allEntries.length,
        dateRange: {
          earliest: earliest || '',
          latest: latest || ''
        },
        filesProcessed: streamingHistoryFiles,
        timestamp: new Date().toISOString(),
        source: 'Spotify Extended Streaming History + Recent Plays'
      },
      songs: consolidatedSongs
    }

    // Save merged data
    const timestamp = Date.now()
    const filename = `merged-streaming-history-${timestamp}.json`
    const mergedJson = JSON.stringify(mergedData, null, 2)
    const mergedBuffer = Buffer.from(mergedJson, 'utf-8')

    await uploadFile(
      userId,
      'merged-history',
      filename,
      mergedBuffer,
      'application/json'
    )

    // Save metadata
    if (supabaseAdmin) {
      const fileId = generateUUID()
      await supabaseAdmin
        .from('user_files')
        .upsert({
          id: fileId,
          user_id: userId,
          category: 'merged-history',
          filename,
          storage_path: `${userId}/merged-history/${filename}`,
          file_size: mergedBuffer.length,
          content_type: 'application/json',
          metadata: {
            totalSongs: consolidatedSongs.length,
            totalPlayEvents: allEntries.length,
            dateRange: { earliest, latest },
            newPlays: newPlays.length,
            created_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,category,filename',
        })
    }

    console.log(`[Sync Spotify] Completed: ${newPlays.length} new tracks, ${consolidatedSongs.length} total unique songs`)

    return NextResponse.json({
      success: true,
      message: 'Spotify sync completed successfully',
      data: {
        newTracks: newPlays.length,
        totalPlayEvents: allEntries.length,
        uniqueSongs: consolidatedSongs.length,
        dateRange: {
          earliest,
          latest
        }
      }
    })
  } catch (error: any) {
    console.error('Sync Spotify error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to sync Spotify data' },
      { status: 500 }
    )
  }
}

