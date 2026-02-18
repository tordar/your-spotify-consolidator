import { NextResponse } from 'next/server'

// Types matching Spotify Web API: Get Recently Played Tracks
interface SpotifyImage {
  url: string
  height: number | null
  width: number | null
}

interface SpotifyArtist {
  id: string
  name: string
  external_urls?: { spotify: string }
}

interface SpotifyAlbum {
  id: string
  name: string
  images: SpotifyImage[]
  external_urls?: { spotify: string }
}

interface SpotifyTrack {
  id: string
  name: string
  duration_ms: number
  artists: SpotifyArtist[]
  album: SpotifyAlbum
  external_urls?: { spotify: string }
}

interface PlayHistoryItem {
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))

    const accessToken = await getAccessToken()

    const url = `https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      next: { revalidate: 60 }, // Cache for 1 minute
    })

    if (!response.ok) {
      const text = await response.text()
      return NextResponse.json(
        { error: `Spotify API error: ${response.status}`, details: text },
        { status: response.status >= 500 ? 502 : 502 }
      )
    }

    const data: RecentlyPlayedResponse = await response.json()

    return NextResponse.json({
      items: data.items,
      total: data.items.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch recently played'
    if (message.includes('not configured')) {
      return NextResponse.json(
        { error: 'Recently played is not configured. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REFRESH_TOKEN (with user-read-recently-played scope).' },
        { status: 503 }
      )
    }
    console.error('Recently played API error:', err)
    return NextResponse.json(
      { error: message },
      { status: 502 }
    )
  }
}
