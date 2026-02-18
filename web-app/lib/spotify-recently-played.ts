/**
 * Server-only helper: fetch recently played tracks from Spotify with caching.
 * Used by the recently-played API route and by data routes that merge recent plays.
 */

import { getSpotifyAccessToken } from './spotify-auth'

const CACHE_TTL_MS = 90 * 1000 // 90 seconds

let cache: { items: PlayHistoryItem[]; fetchedAt: number } | null = null

export interface SpotifyImage {
  url: string
  height: number | null
  width: number | null
}

export interface SpotifyArtist {
  id: string
  name: string
  external_urls?: { spotify: string }
}

export interface SpotifyAlbum {
  id: string
  name: string
  images: SpotifyImage[]
  external_urls?: { spotify: string }
}

export interface SpotifyTrack {
  id: string
  name: string
  duration_ms: number
  artists: SpotifyArtist[]
  album: SpotifyAlbum
  external_urls?: { spotify: string }
}

export interface PlayHistoryItem {
  track: SpotifyTrack
  played_at: string
  context?: { type: string; href: string; uri: string }
}

interface RecentlyPlayedResponse {
  items: PlayHistoryItem[]
  next: string | null
  cursors?: { after: string; before: string }
  limit: number
  href: string
}

/**
 * Fetch recently played tracks from Spotify. Result is cached for 90 seconds.
 * Returns null if credentials are missing or the request fails (caller should fall back to base data).
 */
export async function getRecentlyPlayed(limit: number = 50): Promise<PlayHistoryItem[] | null> {
  const now = Date.now()
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.items.slice(0, limit)
  }

  try {
    const accessToken = await getSpotifyAccessToken()
    const url = `https://api.spotify.com/v1/me/player/recently-played?limit=${Math.min(50, limit)}`
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) return null

    const data: RecentlyPlayedResponse = await response.json()
    const items = data.items ?? []
    cache = { items, fetchedAt: now }
    return items
  } catch {
    return null
  }
}

/** Clear the in-memory cache (e.g. for tests). */
export function clearRecentlyPlayedCache(): void {
  cache = null
}
