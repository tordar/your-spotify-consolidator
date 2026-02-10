import { NextResponse } from 'next/server'
import { stat } from 'fs/promises'
import { getLatestHistoryPath, loadHistory } from '@/lib/streaming-history'
import { aggregateToCleanedSongs } from '@/lib/aggregate-songs'

type Cached = {
  path: string
  mtime: number
  payload: { metadata: object; songs: object[] }
}

let cache: Cached | null = null

export async function GET() {
  try {
    const filePath = await getLatestHistoryPath()
    if (!filePath) {
      return NextResponse.json(
        { error: 'No merged or deduplicated streaming history found' },
        { status: 404 }
      )
    }

    const statResult = await stat(filePath).catch(() => null)
    const mtime = statResult?.mtimeMs ?? 0
    if (cache && cache.path === filePath && cache.mtime === mtime) {
      return NextResponse.json(cache.payload)
    }

    const history = await loadHistory(filePath)
    const { songs, originalCount, consolidatedCount } = aggregateToCleanedSongs(history)
    const totalListeningEvents = history.songs.reduce(
      (sum, s) => sum + (s.listeningEvents?.length ?? 0),
      0
    )
    const duplicatesRemoved = originalCount - consolidatedCount
    const consolidationRate =
      originalCount > 0
        ? Math.round((duplicatesRemoved / originalCount) * 100 * 100) / 100
        : 0

    const payload = {
      metadata: {
        originalTotalSongs: originalCount,
        consolidatedTotalSongs: consolidatedCount,
        duplicatesRemoved,
        consolidationRate,
        timestamp: new Date().toISOString(),
        source: 'Merged / deduplicated streaming history (dynamic)',
        totalListeningEvents,
      },
      songs,
    }

    cache = { path: filePath, mtime, payload }
    return NextResponse.json(payload)
  } catch (error) {
    console.error('Error building songs data:', error)
    return NextResponse.json(
      { error: 'Failed to load songs data' },
      { status: 500 }
    )
  }
}
