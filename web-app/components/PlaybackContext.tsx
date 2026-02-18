'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

export interface PlaybackTrack {
  id: string
  name: string
  duration_ms: number
  type: 'track'
  uri: string
  is_local: boolean
  artists: Array<{ id: string; name: string; type: string }>
  album: {
    id: string
    name: string
    images: Array<{ url: string; height: number | null; width: number | null }>
  }
  external_urls?: { spotify: string }
}

export interface PlaybackState {
  device: { name: string; type: string; is_active: boolean }
  repeat_state: string
  shuffle_state: boolean
  timestamp: number
  progress_ms: number | null
  is_playing: boolean
  item: PlaybackTrack | null
  currently_playing_type: string
}

type PlaybackContextValue = {
  state: PlaybackState | null
  error: string | null
  loading: boolean
  refetch: () => void
}

const PlaybackContext = createContext<PlaybackContextValue | undefined>(undefined)

const POLL_INTERVAL_MS = 3000

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlaybackState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchPlayback = useCallback(async () => {
    try {
      const res = await fetch('/api/spotify/playback-state', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to load playback')
        setState(null)
        return
      }
      setError(data.error ?? null)
      setState(data.state ?? null)
    } catch {
      setError('Failed to load playback')
      setState(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPlayback()
    const interval = setInterval(fetchPlayback, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchPlayback])

  return (
    <PlaybackContext.Provider value={{ state, error, loading, refetch: fetchPlayback }}>
      {children}
    </PlaybackContext.Provider>
  )
}

export function usePlayback() {
  const ctx = useContext(PlaybackContext)
  if (ctx === undefined) {
    throw new Error('usePlayback must be used within a PlaybackProvider')
  }
  return ctx
}
