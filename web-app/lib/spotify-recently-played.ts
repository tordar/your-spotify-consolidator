/**
 * Server-only helper: fetch recently played tracks from Spotify with caching.
 * Used by the recently-played API route and by data routes that merge recent plays.
 */

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

async function getAccessToken(): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Spotify credentials not configured')
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Token refresh failed: ${response.status} ${text}`)
  }

  const data = await response.json()
  return data.access_token
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
    const accessToken = await getAccessToken()
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
