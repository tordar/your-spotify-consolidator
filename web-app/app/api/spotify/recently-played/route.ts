import { NextResponse } from 'next/server'
import { getRecentlyPlayed } from '@/lib/spotify-recently-played'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))

    const items = await getRecentlyPlayed(limit)

    if (items === null) {
      return NextResponse.json(
        {
          error:
            'Recently played is not configured. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REFRESH_TOKEN (with user-read-recently-played scope).',
        },
        { status: 503 }
      )
    }

    return NextResponse.json({
      items,
      total: items.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch recently played'
    console.error('Recently played API error:', err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
