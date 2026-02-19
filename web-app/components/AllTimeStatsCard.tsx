'use client'

import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface AllTimeStatsCardProps {
  totalListeningHours?: number | null
  totalListeningDays?: number | null
  totalListeningEvents?: number | null
  /** Earliest year with data (for daily average: total hours / days since Jan 1 of this year). */
  earliestYear?: number | null
  /** Number of years with data (for yearly average). If not provided, yearly average is omitted. */
  yearCount?: number | null
  formatDuration?: (ms: number) => string
}

function defaultFormatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

export default function AllTimeStatsCard({
  totalListeningHours,
  totalListeningDays,
  totalListeningEvents,
  earliestYear,
  yearCount,
  formatDuration = defaultFormatDuration,
}: AllTimeStatsCardProps) {
  const hasAny =
    totalListeningHours != null ||
    totalListeningDays != null ||
    totalListeningEvents != null

  const firstDate = earliestYear != null ? new Date(earliestYear, 0, 1) : null
  const now = new Date()
  const daysSinceFirstPlay =
    firstDate != null && totalListeningHours != null
      ? Math.max(1, Math.floor((now.getTime() - firstDate.getTime()) / (24 * 60 * 60 * 1000)))
      : null
  const dailyAvgHours =
    totalListeningHours != null &&
    daysSinceFirstPlay != null &&
    daysSinceFirstPlay > 0
      ? totalListeningHours / daysSinceFirstPlay
      : null

  const yearlyAvgHours =
    totalListeningHours != null &&
    yearCount != null &&
    yearCount > 0
      ? totalListeningHours / yearCount
      : null

  const statBlock = (label: string, value: ReactNode) => (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>All-time stats</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasAny ? (
          <p className="text-muted-foreground text-sm">No stats available.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-4">
              {totalListeningHours != null &&
                statBlock(
                  'Total Listening Hours',
                  formatDuration(totalListeningHours * 60 * 60 * 1000)
                )}
              {totalListeningDays != null &&
                statBlock(
                  'Total Listening Days',
                  totalListeningDays.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })
                )}
              {totalListeningEvents != null &&
                statBlock('Total Songs Played', totalListeningEvents.toLocaleString())}
            </div>
            <div className="space-y-4">
              {dailyAvgHours != null &&
                statBlock(
                  'Daily average (since first play)',
                  formatDuration(dailyAvgHours * 60 * 60 * 1000)
                )}
              {yearlyAvgHours != null &&
                statBlock(
                  'Yearly average',
                  `${formatDuration(yearlyAvgHours * 60 * 60 * 1000)}`
                )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
