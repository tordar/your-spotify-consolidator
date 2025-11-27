import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * POST /api/spotify/disconnect
 * Disconnect user's Spotify account
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      )
    }

    const userId = session.user.id

    // Delete Spotify account
    const { error } = await supabaseAdmin
      .from('accounts')
      .delete()
      .eq('user_id', userId)
      .eq('provider', 'spotify')

    if (error) {
      throw new Error(`Failed to disconnect Spotify: ${error.message}`)
    }

    return NextResponse.json({
      success: true,
      message: 'Spotify account disconnected',
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to disconnect Spotify' },
      { status: 500 }
    )
  }
}

