import { NextResponse } from 'next/server'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { getCleanedDataDir } from '@/lib/data-dir'
import { getRecentlyPlayed } from '@/lib/spotify-recently-played'

export async function GET() {
  try {
    const dataDir = getCleanedDataDir()
    const files = await readdir(dataDir)
    const songFile = files
      .filter(f => f.startsWith('cleaned-songs-') && f.endsWith('.json'))
      .sort()
      .pop()

    if (!songFile) {
      return NextResponse.json({ error: 'Song data not found' }, { status: 404 })
    }

    const filePath = join(dataDir, songFile)
    const fileContents = await readFile(filePath, 'utf-8')
    const data = JSON.parse(fileContents)

    const recentPlays = (await getRecentlyPlayed(50)) ?? []
    const lastSyncAt = data.metadata?.timestamp ? new Date(data.metadata.timestamp).getTime() : null
    const playsToAppend =
      lastSyncAt != null
        ? recentPlays.filter((item) => new Date(item.played_at).getTime() > lastSyncAt)
        : recentPlays

    if (playsToAppend.length > 0 && data.songs) {
      for (const item of playsToAppend) {
        const trackId = item.track.id
        if (!trackId) continue

        const song = data.songs.find((s: { songId?: string }) => s.songId === trackId)
        if (!song) continue

        const artists = item.track.artists?.map((a: { name: string }) => a.name).join(', ') ?? ''
        console.log('[songs] Appended:', item.track.name, '—', artists)

        song.count = (song.count ?? 0) + 1
        song.consolidated_count = (song.consolidated_count ?? 0) + 1
        song.duration_ms = (song.duration_ms ?? 0) + (item.track.duration_ms ?? 0)
      }
      if (data.metadata) {
        data.metadata.recentlyPlayedMergedAt = new Date().toISOString()
      }
    } else if (recentPlays && recentPlays.length > 0 && playsToAppend.length === 0) {
      if (data.metadata) {
        data.metadata.recentlyPlayedMergedAt = new Date().toISOString()
      }
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error reading song data:', error)
    return NextResponse.json({ error: 'Failed to load song data' }, { status: 500 })
  }
}
