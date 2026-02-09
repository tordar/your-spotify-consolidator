import { NextResponse } from 'next/server'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

interface ListeningEvent {
  playedAt: string
  msPlayed: number
  conn_country?: string
}

interface SongRecord {
  listeningEvents?: ListeningEvent[]
}

interface MergedHistory {
  songs?: SongRecord[]
}

function getMergedHistoryDir(): string {
  const fromWebApp = join(process.cwd(), '../data/merged-streaming-history')
  const fromRepoRoot = join(process.cwd(), 'data/merged-streaming-history')
  if (existsSync(fromWebApp)) return fromWebApp
  if (existsSync(fromRepoRoot)) return fromRepoRoot
  return fromWebApp
}

/**
 * Aggregates listening time by calendar day (start of day UTC) for the given year(s).
 * Reads the latest merged-streaming-history file.
 * Query: year=2024 or years=2022,2023,2024,2025 (comma-separated). Defaults to last 5 years.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const yearParam = searchParams.get('year')
    const yearsParam = searchParams.get('years')
    let years: number[]
    if (yearsParam) {
      years = yearsParam.split(',').map((y) => parseInt(y.trim(), 10)).filter((y) => !Number.isNaN(y))
      if (years.length === 0) {
        return NextResponse.json({ error: 'Invalid years' }, { status: 400 })
      }
    } else if (yearParam) {
      const y = parseInt(yearParam, 10)
      if (Number.isNaN(y)) return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
      years = [y]
    } else {
      const current = new Date().getFullYear()
      years = [current - 4, current - 3, current - 2, current - 1, current]
    }

    const dataDir = getMergedHistoryDir()
    const files = await readdir(dataDir)
    const mergedFile = files
      .filter((f) => f.startsWith('merged-streaming-history-') && f.endsWith('.json'))
      .sort((a, b) => {
        const tsA = parseInt(a.replace(/\D/g, ''), 10) || 0
        const tsB = parseInt(b.replace(/\D/g, ''), 10) || 0
        return tsB - tsA
      })
      .pop()

    if (!mergedFile) {
      return NextResponse.json(
        { error: 'Merged streaming history not found' },
        { status: 404 }
      )
    }

    const filePath = join(dataDir, mergedFile)
    const fileContents = await readFile(filePath, 'utf-8')
    const data: MergedHistory = JSON.parse(fileContents)

    const dayTotals = new Map<number, number>() // start-of-day timestamp (ms) -> total ms
    const minYear = Math.min(...years)
    const maxYear = Math.max(...years)
    const startTs = Date.UTC(minYear, 0, 1)
    const endTs = Date.UTC(maxYear, 11, 31, 23, 59, 59, 999)

    if (!data.songs || !Array.isArray(data.songs)) {
      return NextResponse.json({ years, data: [] })
    }

    for (const song of data.songs) {
      const events = song.listeningEvents
      if (!events || !Array.isArray(events)) continue
      for (const event of events) {
        const playedAt = new Date(event.playedAt).getTime()
        if (playedAt < startTs || playedAt > endTs) continue
        const dayStart = new Date(playedAt)
        dayStart.setUTCHours(0, 0, 0, 0)
        const key = dayStart.getTime()
        dayTotals.set(key, (dayTotals.get(key) ?? 0) + (event.msPlayed || 0))
      }
    }

    const dataArray = Array.from(dayTotals.entries()).map(([date, value]) => ({
      date,
      value,
    }))

    return NextResponse.json({ years, data: dataArray })
  } catch (error) {
    console.error('Error building daily listening data:', error)
    return NextResponse.json(
      { error: 'Failed to load daily listening data' },
      { status: 500 }
    )
  }
}
