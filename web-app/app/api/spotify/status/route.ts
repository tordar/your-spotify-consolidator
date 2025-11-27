import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { hasSpotifyConnected } from '@/lib/spotify-token'

/**
 * GET /api/spotify/status
 * Check if user has Spotify connected
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const connected = await hasSpotifyConnected(session.user.id)

    return NextResponse.json({
      connected,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to check Spotify status' },
      { status: 500 }
    )
  }
}

