import { NextResponse } from 'next/server'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { getCleanedDataDir } from '@/lib/data-dir'
import { getRecentlyPlayed } from '@/lib/spotify-recently-played'

export async function GET() {
  try {
    const dataDir = getCleanedDataDir()
    const files = await readdir(dataDir)
    const albumFile = files
      .filter(f => f.startsWith('cleaned-albums-with-songs-') && f.endsWith('.json'))
      .sort()
      .pop()

    if (!albumFile) {
      return NextResponse.json({ error: 'Album with songs data not found' }, { status: 404 })
    }

    const filePath = join(dataDir, albumFile)
    const fileContents = await readFile(filePath, 'utf-8')
    const data = JSON.parse(fileContents)

    const recentPlays = await getRecentlyPlayed(50) ?? []
    const lastSyncAt = data.metadata?.timestamp ? new Date(data.metadata.timestamp).getTime() : null
    const playsToAppend =
      lastSyncAt != null
        ? recentPlays.filter((item) => new Date(item.played_at).getTime() > lastSyncAt)
        : recentPlays

    if (playsToAppend.length > 0 && data.albums) {
      for (const item of playsToAppend) {
        const albumId = item.track.album?.id
        const trackId = item.track.id
        if (!albumId || !trackId) continue

        const album = data.albums.find((a: { primaryAlbumId?: string }) => a.primaryAlbumId === albumId)
        if (!album) continue

        const artists = item.track.artists?.map((a: { name: string }) => a.name).join(', ') ?? ''
        console.log('[albums-with-songs] Appended:', item.track.name, '—', artists, '(', item.track.album?.name ?? '', ')')

        album.count = (album.count ?? 0) + 1
        album.total_count = (album.total_count ?? 0) + 1
        album.total_duration_ms = (album.total_duration_ms ?? 0) + (item.track.duration_ms ?? 0)

        if (Array.isArray(album.songs)) {
          const song = album.songs.find((s: { songId?: string }) => s.songId === trackId)
          if (song) {
            song.play_count = (song.play_count ?? 0) + 1
            song.total_listening_time_ms = (song.total_listening_time_ms ?? 0) + (item.track.duration_ms ?? 0)
          }
        }
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
    console.error('Error reading album with songs data:', error)
    return NextResponse.json({ error: 'Failed to load album with songs data' }, { status: 500 })
  }
}
