'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface DayPlay {
  songName: string
  artists: string[]
  albumName: string
  msPlayed: number
}

interface DailyDay {
  date: number
  value: number
  plays?: DayPlay[]
}

interface TodaysListeningCardProps {
  dailyData: DailyDay[] | null | undefined
  loading: boolean
  selectedHeatmapYear: number
  formatDuration: (ms: number) => string
}

export default function TodaysListeningCard({
  dailyData,
  loading,
  selectedHeatmapYear,
  formatDuration,
}: TodaysListeningCardProps) {
  const currentYear = new Date().getFullYear()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today&apos;s listening</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading || !dailyData ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : selectedHeatmapYear !== currentYear ? (
          <p className="text-muted-foreground text-sm">
            Switch to current year in Listening activity to see today.
          </p>
        ) : (() => {
          const today = new Date()
          const todayStart = Date.UTC(
            today.getUTCFullYear(),
            today.getUTCMonth(),
            today.getUTCDate()
          )
          const todayEntry = dailyData.find((d) => d.date === todayStart)
          const ms = todayEntry?.value ?? 0
          const plays = todayEntry?.plays ?? []

          if (ms === 0 && plays.length === 0) {
            return (
              <p className="text-2xl font-bold">No listening yet today</p>
            )
          }

          const byArtist = new Map<string, number>()
          const uniqueSongs = new Map<string, string>()
          for (const play of plays) {
            const artistKey = play.artists?.join(', ') || 'Unknown'
            byArtist.set(artistKey, (byArtist.get(artistKey) ?? 0) + 1)
            const songKey = `${play.songName}\0${artistKey}`
            if (!uniqueSongs.has(songKey)) {
              uniqueSongs.set(songKey, play.artists?.length ? `${play.songName} – ${artistKey}` : play.songName)
            }
          }
          const artistList = Array.from(byArtist.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([artist, playCount]) => ({ artist, playCount }))
          const songList = Array.from(uniqueSongs.values())

          return (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Listening time</p>
                  <p className="text-2xl font-bold">{formatDuration(ms)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Artists</p>
                  <p className="text-2xl font-bold">{artistList.length}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Songs</p>
                  <p className="text-2xl font-bold">{songList.length}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {artistList.length > 0 && (
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground mb-1">Artists</p>
                    <ul className="text-sm space-y-0.5 max-h-32 overflow-y-auto">
                      {artistList.map(({ artist, playCount }) => (
                        <li key={artist} className="truncate" title={artist}>
                          {artist}
                          <span className="text-muted-foreground ml-1">({playCount} plays)</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {songList.length > 0 && (
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground mb-1">Songs</p>
                    <ul className="text-sm space-y-0.5 max-h-32 overflow-y-auto list-disc list-inside">
                      {songList.slice(0, 20).map((name) => (
                        <li key={name} className="truncate" title={name}>
                          {name}
                        </li>
                      ))}
                      {songList.length > 20 && (
                        <li className="text-muted-foreground">+{songList.length - 20} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )
        })()}
      </CardContent>
    </Card>
  )
}
