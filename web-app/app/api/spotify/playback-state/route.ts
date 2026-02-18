import { NextResponse } from 'next/server'
import { getPlaybackState } from '@/lib/spotify-playback'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const state = await getPlaybackState()

    if (state === null) {
      return NextResponse.json(
        { state: null, error: null },
        { status: 200 }
      )
    }

    return NextResponse.json({ state })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch playback state'
    console.error('Playback state API error:', err)
    return NextResponse.json(
      {
        state: null,
        error: message,
      },
      { status: 502 }
    )
  }
}
