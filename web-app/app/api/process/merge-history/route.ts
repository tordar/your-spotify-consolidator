import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listUserFiles, downloadFile, uploadFile, deleteUserCategoryFiles } from '@/lib/storage'
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

interface StreamingHistoryEntry {
  ts: string
  platform: string
  ms_played: number
  conn_country: string
  master_metadata_track_name: string
  master_metadata_album_artist_name: string
  master_metadata_album_album_name: string
  spotify_track_uri: string
}

interface CompleteSong {
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
    source: 'Spotify Extended Streaming History'
  }
  songs: CompleteSong[]
}

/**
 * Extract track ID from Spotify URI
 */
function extractTrackId(uri: string): string {
  return uri.replace('spotify:track:', '')
}

/**
 * Consolidate streaming history entries by song
 */
function consolidateBySong(entries: StreamingHistoryEntry[]): CompleteSong[] {
  const songMap = new Map<string, CompleteSong>()
  
  entries.forEach(entry => {
    const songId = extractTrackId(entry.spotify_track_uri)
    
    if (songMap.has(songId)) {
      const existingSong = songMap.get(songId)!
      existingSong.playCount++
      existingSong.totalListeningTime += entry.ms_played
      existingSong.listeningEvents.push({
        playedAt: entry.ts,
        msPlayed: entry.ms_played
      })
    } else {
      songMap.set(songId, {
        songId: songId,
        name: entry.master_metadata_track_name,
        duration_ms: 0, // Will be filled later with API data
        artists: [entry.master_metadata_album_artist_name],
        album: {
          id: '', // Will be filled later with API data
          name: entry.master_metadata_album_album_name,
          images: [] // Will be filled later with API data
        },
        artist: {
          name: entry.master_metadata_album_artist_name,
          genres: [] // Will be filled later with API data
        },
        external_urls: {
          spotify: entry.spotify_track_uri
        },
        preview_url: null, // Will be filled later with API data
        playCount: 1,
        totalListeningTime: entry.ms_played,
        listeningEvents: [{
          playedAt: entry.ts,
          msPlayed: entry.ms_played
        }]
      })
    }
  })
  
  // Sort listening events by playedAt date (earliest first)
  songMap.forEach(song => {
    song.listeningEvents.sort((a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime())
  })
  
  return Array.from(songMap.values())
}

/**
 * POST /api/process/merge-history
 * Merge all raw history files for the authenticated user
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

    // Get all raw history files for the user
    const rawHistoryFiles = await listUserFiles(userId, 'raw-history')
    
    // Filter to only files that match the pattern (same as local script)
    const streamingHistoryFiles = rawHistoryFiles.filter(
      filename => filename.startsWith('Streaming_History_Audio_') && filename.endsWith('.json')
    )

    if (streamingHistoryFiles.length === 0) {
      return NextResponse.json(
        { error: 'No streaming history files found. Please upload files first.' },
        { status: 400 }
      )
    }

    // Read and parse all files
    const allEntries: StreamingHistoryEntry[] = []
    const processedFiles: string[] = []

    for (const filename of streamingHistoryFiles) {
      try {
        // Download file from Supabase Storage
        const fileBuffer = await downloadFile(userId, 'raw-history', filename)
        const fileContent = new TextDecoder().decode(fileBuffer)
        const rawEntries = JSON.parse(fileContent)
        
        if (!Array.isArray(rawEntries)) {
          console.warn(`Skipping ${filename}: invalid format (expected array)`)
          continue
        }

        // Extract only the essential fields and filter out podcasts/non-music content
        // Note: Using same logic as local script - filter first, then map
        const entries: StreamingHistoryEntry[] = rawEntries
          .filter((rawEntry: any) => {
            // Only include entries with valid track URIs (music tracks) and actual listening time
            return rawEntry.spotify_track_uri && 
                   rawEntry.spotify_track_uri.startsWith('spotify:track:') &&
                   rawEntry.ms_played > 10000 &&
                   !rawEntry.episode_name && 
                   !rawEntry.episode_show_name && 
                   !rawEntry.spotify_episode_uri
          })
          .map((rawEntry: any) => ({
            ts: rawEntry.ts,
            platform: rawEntry.platform,
            ms_played: rawEntry.ms_played,
            conn_country: rawEntry.conn_country,
            master_metadata_track_name: rawEntry.master_metadata_track_name,
            master_metadata_album_artist_name: rawEntry.master_metadata_album_artist_name,
            master_metadata_album_album_name: rawEntry.master_metadata_album_album_name,
            spotify_track_uri: rawEntry.spotify_track_uri
          }))

        console.log(`✅ Loaded ${entries.length} entries from ${filename}`)
        allEntries.push(...entries)
        processedFiles.push(filename)
      } catch (error: any) {
        console.error(`❌ Error processing ${filename}:`, error)
        // Throw error to match local script behavior - don't silently skip files
        throw new Error(`Failed to process ${filename}: ${error.message}`)
      }
    }

    if (allEntries.length === 0) {
      return NextResponse.json(
        { error: 'No valid streaming history entries found in uploaded files.' },
        { status: 400 }
      )
    }

    // Sort by timestamp (earliest first)
    allEntries.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())

    // Find date range
    const earliest = allEntries[0]?.ts
    const latest = allEntries[allEntries.length - 1]?.ts

    // Consolidate entries by song
    const consolidatedSongs = consolidateBySong(allEntries)

    // Create merged data structure
    const mergedData: MergedStreamingHistory = {
      metadata: {
        totalSongs: consolidatedSongs.length,
        totalPlayEvents: allEntries.length,
        dateRange: {
          earliest: earliest || '',
          latest: latest || ''
        },
        filesProcessed: processedFiles,
        timestamp: new Date().toISOString(),
        source: 'Spotify Extended Streaming History'
      },
      songs: consolidatedSongs
    }

    // Delete old merged history files (cleanup)
    try {
      await deleteUserCategoryFiles(userId, 'merged-history')
    } catch (error) {
      // Ignore errors if no files exist
      console.log('No old merged files to clean up')
    }

    // Save merged data to Supabase Storage
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

    // Save file metadata to database
    if (supabaseAdmin) {
      const fileId = generateUUID()
      const storagePath = `${userId}/merged-history/${filename}`

      await supabaseAdmin
        .from('user_files')
        .upsert({
          id: fileId,
          user_id: userId,
          category: 'merged-history',
          filename,
          storage_path: storagePath,
          file_size: mergedBuffer.length,
          content_type: 'application/json',
          metadata: {
            totalSongs: consolidatedSongs.length,
            totalPlayEvents: allEntries.length,
            dateRange: {
              earliest,
              latest
            },
            filesProcessed: processedFiles,
            created_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,category,filename',
        })
    }

    return NextResponse.json({
      success: true,
      message: 'Streaming history merged successfully',
      data: {
        totalPlayEvents: allEntries.length,
        uniqueSongs: consolidatedSongs.length,
        dateRange: {
          earliest,
          latest
        },
        filesProcessed: processedFiles.length,
        outputFile: filename
      }
    })
  } catch (error: any) {
    console.error('Merge history error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to merge streaming history' },
      { status: 500 }
    )
  }
}

