'use client'

import { useState, useEffect } from 'react'
import { usePlayback } from './PlaybackContext'
import { Music2, ExternalLink, Loader2, AlertCircle } from 'lucide-react'

function formatMs(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

const SPOTIFY_OPEN_URL = 'https://open.spotify.com'

const fixedWrapperClass =
  'fixed bottom-4 right-4 z-50 hidden md:flex max-w-[400px] overflow-hidden rounded-lg border border-white/10 bg-card/95 shadow-lg backdrop-blur-md'
const inlineWrapperClass =
  'flex md:hidden w-full overflow-hidden rounded-lg border border-white/10 bg-card/95 shadow-lg backdrop-blur-md'

export default function MiniPlayer({ variant = 'fixed' }: { variant?: 'fixed' | 'inline' }) {
  const { state, error, loading } = usePlayback()
  const [interpolatedProgress, setInterpolatedProgress] = useState<number | null>(null)
  const wrapperClass = variant === 'inline' ? inlineWrapperClass : fixedWrapperClass

  const item = state?.item
  const serverProgressMs = state?.progress_ms ?? 0
  const serverTimestamp = state?.timestamp ?? 0

  useEffect(() => {
    if (!state?.is_playing || !item) {
      setInterpolatedProgress(null)
      return
    }
    setInterpolatedProgress(serverProgressMs)
    const startMs = serverProgressMs
    const startAt = Date.now()
    let rafId = 0
    const tick = () => {
      const elapsed = Date.now() - startAt
      const next = Math.min(startMs + elapsed, item.duration_ms)
      setInterpolatedProgress(next)
      if (next < item.duration_ms) {
        rafId = requestAnimationFrame(tick)
      }
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [state?.is_playing, item?.id, item?.duration_ms, serverProgressMs, serverTimestamp])

  if (loading && !state && !error) {
    return (
      <div className={wrapperClass} aria-label="Now playing">
        <div className="flex items-center gap-3 px-5 py-4 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin flex-shrink-0" />
          <span className="text-base">Loading playback…</span>
        </div>
      </div>
    )
  }

  if (error && !state) {
    const content = (
      <>
        <AlertCircle className="h-6 w-6 flex-shrink-0" />
        <span className="text-base truncate" title={error}>
          Playback unavailable
        </span>
        {variant !== 'inline' && <ExternalLink className="h-5 w-5 flex-shrink-0 ml-1" />}
      </>
    )
    return variant === 'inline' ? (
      <div className={`${wrapperClass} flex items-center gap-3 px-5 py-4 text-muted-foreground`} aria-label="Playback unavailable">
        {content}
      </div>
    ) : (
      <a
        href={SPOTIFY_OPEN_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`${wrapperClass} flex items-center gap-3 px-5 py-4 text-muted-foreground hover:text-foreground transition-colors`}
        aria-label="Playback unavailable – open Spotify"
      >
        {content}
      </a>
    )
  }

  if (!item || state?.currently_playing_type === 'ad') {
    const content = (
      <>
        <Music2 className="h-6 w-6 flex-shrink-0" />
        <span className="text-base">Nothing playing</span>
        {variant !== 'inline' && <ExternalLink className="h-5 w-5 flex-shrink-0 ml-1" />}
      </>
    )
    return variant === 'inline' ? (
      <div className={`${wrapperClass} flex items-center gap-3 px-5 py-4 text-muted-foreground`} aria-label="Nothing playing">
        {content}
      </div>
    ) : (
      <a
        href={SPOTIFY_OPEN_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`${wrapperClass} flex items-center gap-3 px-5 py-4 text-muted-foreground hover:text-foreground transition-colors`}
        aria-label="Nothing playing – open Spotify"
      >
        {content}
      </a>
    )
  }

  const progressMs = interpolatedProgress ?? serverProgressMs
  const progressPercent = item.duration_ms > 0 ? (progressMs / item.duration_ms) * 100 : 0
  const imageUrl = item.album?.images?.[0]?.url ?? item.album?.images?.[1]?.url

  return (
    <div className={wrapperClass} aria-label="Now playing">
      <div className="flex min-w-0 flex-1 items-center">
        <a
          href={item.external_urls?.spotify ?? SPOTIFY_OPEN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="relative flex-shrink-0 overflow-hidden rounded-lg bg-muted"
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="block h-20 w-20 object-cover"
              width={80}
              height={80}
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center text-muted-foreground">
              <Music2 className="h-8 w-8" />
            </div>
          )}
        </a>
        <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-3">
          <p className="truncate text-base font-medium text-foreground" title={item.name}>
            {item.name}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {item.artists?.map((a) => a.name).join(', ') || 'Unknown'}
          </p>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/80 transition-all duration-1000"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatMs(progressMs)} / {formatMs(item.duration_ms)}
          </p>
        </div>
        {variant !== 'inline' && (
          <a
            href={item.external_urls?.spotify ?? SPOTIFY_OPEN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-shrink-0 items-center justify-center px-3 text-muted-foreground hover:text-foreground"
            aria-label="Open in Spotify"
          >
            <ExternalLink className="h-5 w-5" />
          </a>
        )}
      </div>
    </div>
  )
}
