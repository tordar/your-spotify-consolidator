import { NextResponse } from 'next/server'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { getCleanedDataDir } from '@/lib/data-dir'
import { getRecentlyPlayed } from '@/lib/spotify-recently-played'

const MS_PER_HOUR = 60 * 60 * 1000
const MS_PER_DAY = 24 * MS_PER_HOUR

export async function GET() {
  try {
    const dataDir = getCleanedDataDir()
    const files = await readdir(dataDir)
    const statsFile = files
      .filter(f => f.startsWith('detailed-stats-') && f.endsWith('.json'))
      .sort()
      .pop()

    if (!statsFile) {
      return NextResponse.json({ error: 'Stats data not found' }, { status: 404 })
    }

    const filePath = join(dataDir, statsFile)
    const fileContents = await readFile(filePath, 'utf-8')
    const data = JSON.parse(fileContents)

    const recentPlays = (await getRecentlyPlayed(50)) ?? []
    const lastSyncAt = data.metadata?.timestamp ? new Date(data.metadata.timestamp).getTime() : null
    const playsToAppend =
      lastSyncAt != null
        ? recentPlays.filter((item) => new Date(item.played_at).getTime() > lastSyncAt)
        : recentPlays

    if (playsToAppend.length > 0 && data.stats?.yearlyListeningTime) {
      const currentYear = new Date().getFullYear().toString()
      const yearEntry = data.stats.yearlyListeningTime.find(
        (y: { year: string }) => y.year === currentYear
      )
      if (yearEntry) {
        playsToAppend.forEach((item) => {
          const artists = item.track.artists?.map((a: { name: string }) => a.name).join(', ') ?? ''
          console.log('[stats] Appended:', item.track.name, '—', artists)
        })
        const extraMs = playsToAppend.reduce((sum, item) => sum + (item.track.duration_ms ?? 0), 0)
        const extraPlays = playsToAppend.length
        const extraHours = extraMs / MS_PER_HOUR
        const extraDays = extraMs / MS_PER_DAY

        yearEntry.totalListeningTimeMs = (yearEntry.totalListeningTimeMs ?? 0) + extraMs
        yearEntry.playCount = (yearEntry.playCount ?? 0) + extraPlays
        yearEntry.totalListeningHours = (yearEntry.totalListeningHours ?? 0) + extraHours

        if (typeof data.stats.totalListeningHours === 'number') {
          data.stats.totalListeningHours += extraHours
        }
        if (typeof data.stats.totalListeningDays === 'number') {
          data.stats.totalListeningDays += extraDays
        }
        if (typeof data.stats.totalListeningEvents === 'number') {
          data.stats.totalListeningEvents += extraPlays
        }
      }
      if (data.metadata) {
        data.metadata.recentlyPlayedMergedAt = new Date().toISOString()
      }
    } else if (recentPlays && recentPlays.length > 0 && playsToAppend.length === 0 && data.metadata) {
      data.metadata.recentlyPlayedMergedAt = new Date().toISOString()
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error reading stats data:', error)
    return NextResponse.json({ error: 'Failed to load stats data' }, { status: 500 })
  }
}
