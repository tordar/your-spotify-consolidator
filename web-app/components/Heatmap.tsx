'use client'

import React, { useMemo, useState, useCallback, useLayoutEffect, useRef } from 'react'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MS_PER_DAY = 1000 * 60 * 60 * 24

const DEFAULT_EMPTY = '#334155'
const DEFAULT_FILL = '#10b981'
const DEFAULT_BASE = '#0f172a'

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.replace(/^#/, '').trim()
  if (cleaned.length !== 6) return null
  const r = parseInt(cleaned.slice(0, 2), 16)
  const g = parseInt(cleaned.slice(2, 4), 16)
  const b = parseInt(cleaned.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
  return { r, g, b }
}

function parseHexVar(value: string | undefined, fallback: string): string {
  const v = value?.trim()
  if (v && /^#[0-9A-Fa-f]{6}$/.test(v)) return v
  return fallback
}

const MIN_ACTIVITY_INTENSITY = 0.5
const CONTRAST_EXPONENT = 0.5

function heatColor(fillHex: string, baseHex: string, emptyHex: string, value: number, max: number): string {
  if (max <= 0) return emptyHex
  if (value <= 0) return baseHex
  const rgb = hexToRgb(fillHex)
  const base = hexToRgb(baseHex)
  if (!rgb || !base) return fillHex
  const raw = Math.pow(Math.min(value / max, 1), CONTRAST_EXPONENT)
  const intensity = Math.max(MIN_ACTIVITY_INTENSITY, raw)
  const r = Math.round(base.r + (rgb.r - base.r) * intensity)
  const g = Math.round(base.g + (rgb.g - base.g) * intensity)
  const b = Math.round(base.b + (rgb.b - base.b) * intensity)
  return `rgb(${r}, ${g}, ${b})`
}

function formatUTCDateKey(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function localDayNumberUTC(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / MS_PER_DAY
  )
}

function sundayOnOrBeforeUTC(d: Date): Date {
  const date = new Date(d.getTime())
  const day = date.getUTCDay()
  const offset = day % 7
  date.setUTCDate(date.getUTCDate() - offset)
  return date
}

function saturdayOnOrAfterUTC(d: Date): Date {
  const date = new Date(d.getTime())
  const day = date.getUTCDay()
  const offset = (6 - day + 7) % 7
  date.setUTCDate(date.getUTCDate() + offset)
  return date
}

function weekIndexFromSundayStartUTC(date: Date, start: Date): number {
  return Math.floor((localDayNumberUTC(date) - localDayNumberUTC(start)) / 7)
}


export interface DayRecord {
  date: number
  value: number
  plays?: Array<{ songName: string; artists: string[]; albumName: string; msPlayed: number }>
}

export interface ListeningHeatmapProps {
  year: number
  data: DayRecord[]
  onDayClick?: (day: DayRecord) => void
  formatDuration?: (ms: number) => string
  className?: string
}

const defaultFormatDuration = (ms: number): string => {
  const totalMinutes = Math.round(ms / 60000)
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60)
    return `${hours}h ${totalMinutes % 60}m`
  }
  return `${totalMinutes}m`
}

export function ListeningHeatmap({
  year,
  data,
  onDayClick,
  formatDuration = defaultFormatDuration,
  className = '',
}: ListeningHeatmapProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [themeColors, setThemeColors] = useState({
    empty: DEFAULT_EMPTY,
    fill: DEFAULT_FILL,
    base: DEFAULT_BASE,
  })
  useLayoutEffect(() => {
    const el = rootRef.current ?? document.documentElement
    const s = getComputedStyle(el)
    setThemeColors({
      empty: parseHexVar(s.getPropertyValue('--heatmap-empty-cell'), DEFAULT_EMPTY),
      fill: parseHexVar(s.getPropertyValue('--heatmap-fill'), DEFAULT_FILL),
      base: parseHexVar(s.getPropertyValue('--heatmap-base'), DEFAULT_BASE),
    })
  }, [])
  const [tooltip, setTooltip] = useState<{
    text: string
    x: number
    y: number
  } | null>(null)
  const [activeCell, setActiveCell] = useState<string | null>(null)
  const isTouch = typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches

  const dataByDate = useMemo(() => {
    const map = new Map<string, DayRecord>()
    for (const d of data) {
      const key = formatUTCDateKey(new Date(d.date))
      map.set(key, d)
    }
    return map
  }, [data])

  const { yearStart, start, end, maxValue } = useMemo(() => {
    const yearStart = new Date(Date.UTC(year, 0, 1))
    const yearEnd = new Date(Date.UTC(year, 11, 31))
    const start = sundayOnOrBeforeUTC(yearStart)
    const end = saturdayOnOrAfterUTC(yearEnd)
    const maxValue = data.length
      ? Math.max(...data.map((d) => d.value), 1)
      : 1
    return { yearStart, start, end, maxValue }
  }, [year, data])

  const weeksCount = useMemo(() => {
    return weekIndexFromSundayStartUTC(end, start) + 1
  }, [start, end])

  const monthLabels = useMemo(() => {
    return Array.from({ length: 12 }, (_, month) => {
      const monthStart = new Date(Date.UTC(year, month, 1))
      const weekIndex = weekIndexFromSundayStartUTC(monthStart, start)
      return { month: MONTHS[month], weekIndex }
    })
  }, [year, start])

  const cells = useMemo(() => {
    const list: Array<{
      key: string
      dateStr: string
      weekIndex: number
      row: number
      inYear: boolean
      entry: DayRecord | undefined
    }> = []
    const cursor = new Date(start.getTime())
    while (cursor <= end) {
      const dateStr = formatUTCDateKey(cursor)
      const inYear = cursor.getUTCFullYear() === year
      const weekIndex = weekIndexFromSundayStartUTC(cursor, start)
      const row = cursor.getUTCDay()
      const entry = dataByDate.get(dateStr)
      list.push({
        key: dateStr,
        dateStr,
        weekIndex,
        row,
        inYear,
        entry,
      })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return list
  }, [start, end, year, dataByDate])

  const showTooltip = useCallback(
    (text: string, x: number, y: number, cellKey: string) => {
      setTooltip({ text, x, y })
      if (isTouch) setActiveCell(cellKey)
    },
    [isTouch]
  )
  const hideTooltip = useCallback(() => {
    setTooltip(null)
    setActiveCell(null)
  }, [])

  return (
    <div
      ref={rootRef}
      className={`heatmap-root ${className}`}
      style={{ '--weeks-count': weeksCount } as React.CSSProperties}
    >
      <div className="heatmap-area">
        <div className="year-label" aria-hidden="true">
          {year}
        </div>
        <div className="month-row">
          {monthLabels.map(({ month, weekIndex }) => (
            <div
              key={month}
              className="month-label"
              style={{ gridColumn: weekIndex + 1 }}
            >
              {month}
            </div>
          ))}
        </div>
        <div className="day-col">
          {DAYS.map((label) => (
            <div key={label} className="day-label">
              {label}
            </div>
          ))}
        </div>
        <div
          className="heatmap-grid"
          style={{ aspectRatio: `${weeksCount} / 7` }}
        >
          {cells.map(({ key, dateStr, weekIndex, row, inYear, entry }) => {
            const value = entry?.value ?? 0
            const filled = value > 0
            const bg = !inYear
              ? 'transparent'
              : filled
                ? heatColor(themeColors.fill, themeColors.base, themeColors.empty, value, maxValue)
                : themeColors.empty
            const durationStr = formatDuration(entry?.value ?? 0)
            const playCount = entry?.plays?.length ?? 0
            const songCount = entry?.plays ? new Set(entry.plays.map((p) => p.songName)).size : 0
            const artistCount = entry?.plays
              ? new Set(entry.plays.flatMap((p) => p.artists)).size
              : 0
            const tooltipLines = [
              `${dateStr}: ${durationStr}`,
              playCount > 0
                ? `${songCount} song${songCount !== 1 ? 's' : ''}, ${artistCount} artist${artistCount !== 1 ? 's' : ''}`
                : '',
            ].filter(Boolean)
            const tooltipText = tooltipLines.join('\n')
            const isActive = isTouch && activeCell === key

            return (
              <div
                key={key}
                className={`cell ${!inYear ? 'outside' : ''} ${isActive ? 'active' : ''}`}
                style={{
                  gridColumn: weekIndex + 1,
                  gridRow: row + 1,
                  background: bg,
                }}
                role={onDayClick && inYear ? 'button' : undefined}
                tabIndex={onDayClick && inYear ? 0 : undefined}
                onMouseEnter={
                  !isTouch && inYear
                    ? (e) => showTooltip(tooltipText, e.clientX, e.clientY, key)
                    : undefined
                }
                onMouseMove={
                  !isTouch && tooltip && inYear
                    ? (e) => setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : null))
                    : undefined
                }
                onMouseLeave={!isTouch ? hideTooltip : undefined}
                onPointerDown={
                  isTouch && inYear
                    ? (e) => {
                        if (e.pointerType !== 'touch') return
                        e.preventDefault()
                        if (isActive) {
                          hideTooltip()
                          return
                        }
                        showTooltip(tooltipText, e.clientX, e.clientY, key)
                      }
                    : undefined
                }
                onClick={
                  onDayClick && inYear && entry ? () => onDayClick(entry) : undefined
                }
                onKeyDown={
                  onDayClick && inYear && entry
                    ? (e: React.KeyboardEvent<HTMLDivElement>) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onDayClick(entry!)
                        }
                      }
                    : undefined
                }
              />
            )
          })}
        </div>
      </div>
      {tooltip && (
        <div
          className="heatmap-tooltip"
          style={{
            position: 'fixed',
            left: Math.min(tooltip.x + 12, typeof window !== 'undefined' ? window.innerWidth - 160 : tooltip.x + 12),
            top: Math.min(tooltip.y + 12, typeof window !== 'undefined' ? window.innerHeight - 80 : tooltip.y + 12),
            zIndex: 50,
            padding: '10px 12px',
            background: 'hsl(var(--card))',
            color: 'hsl(var(--card-foreground))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '10px',
            fontSize: '12px',
            lineHeight: 1.4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            pointerEvents: 'none',
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  )
}
