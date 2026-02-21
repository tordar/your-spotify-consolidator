import { NextResponse } from 'next/server'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { getMergedHistoryDir } from '@/lib/data-dir'
import { getRecentlyPlayed } from '@/lib/spotify-recently-played'

interface ListeningEvent {
  playedAt: string
  msPlayed: number
  conn_country?: string
}

interface SongRecord {
  name?: string
  artists?: string[]
  album?: { name?: string; id?: string; images?: unknown[] }
  listeningEvents?: ListeningEvent[]
}

interface MergedHistory {
  songs?: SongRecord[]
  metadata?: {
    dateRange?: { latest?: string }
  }
}

interface DayPlay {
  songName: string
  artists: string[]
  albumName: string
  msPlayed: number
}

interface DayRecord {
  totalMs: number
  plays: DayPlay[]
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

    const dayMap = new Map<number, DayRecord>()
    const minYear = Math.min(...years)
    const maxYear = Math.max(...years)
    const startTs = Date.UTC(minYear, 0, 1)
    const endTs = Date.UTC(maxYear, 11, 31, 23, 59, 59, 999)

    if (!data.songs || !Array.isArray(data.songs)) {
      return NextResponse.json({ years, data: [] })
    }

    for (const song of data.songs) {
      const events = song.listeningEvents
      const songName = song.name?.trim() || ''
      const artistNames = Array.isArray(song.artists) ? song.artists.map((a) => String(a).trim()).filter(Boolean) : []
      const albumName = song.album?.name?.trim() || 'Unknown Album'
      if (!events || !Array.isArray(events)) continue
      for (const event of events) {
        const playedAt = new Date(event.playedAt).getTime()
        if (playedAt < startTs || playedAt > endTs) continue
        const dayStart = new Date(playedAt)
        dayStart.setUTCHours(0, 0, 0, 0)
        const key = dayStart.getTime()
        let rec = dayMap.get(key)
        if (!rec) {
          rec = { totalMs: 0, plays: [] }
          dayMap.set(key, rec)
        }
        rec.totalMs += event.msPlayed || 0
        rec.plays.push({
          songName: songName || 'Unknown',
          artists: artistNames.length ? artistNames : ['Unknown'],
          albumName,
          msPlayed: event.msPlayed || 0,
        })
      }
    }

    const lastSyncAt = data.metadata?.dateRange?.latest
      ? new Date(data.metadata.dateRange.latest).getTime()
      : null
    const recentPlays = (await getRecentlyPlayed(50)) ?? []
    const playsToAppend =
      lastSyncAt != null
        ? recentPlays.filter((item) => new Date(item.played_at).getTime() > lastSyncAt)
        : recentPlays

    for (const item of playsToAppend) {
      const playedAt = new Date(item.played_at).getTime()
      if (playedAt < startTs || playedAt > endTs) continue
      const dayStart = new Date(playedAt)
      dayStart.setUTCHours(0, 0, 0, 0)
      const key = dayStart.getTime()
      let rec = dayMap.get(key)
      if (!rec) {
        rec = { totalMs: 0, plays: [] }
        dayMap.set(key, rec)
      }
      const msPlayed = item.track.duration_ms ?? 0
      const artists = item.track.artists?.map((a: { name: string }) => a.name).filter(Boolean) ?? []
      rec.totalMs += msPlayed
      rec.plays.push({
        songName: item.track.name || 'Unknown',
        artists: artists.length ? artists : ['Unknown'],
        albumName: item.track.album?.name?.trim() || 'Unknown Album',
        msPlayed,
      })
      console.log('[daily-listening] Appended:', item.track.name, '—', artists.join(', '))
    }

    const dataArray = Array.from(dayMap.entries()).map(([date, rec]) => ({
      date,
      value: rec.totalMs,
      plays: rec.plays,
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
