import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  encryptSpotifyOAuthPayload,
  getSpotifyCallbackRedirectUri,
  SPOTIFY_OAUTH_COOKIE_NAME,
} from '@/lib/spotify-oauth-state'

const COOKIE_MAX_AGE = 600 // 10 minutes
const SCOPES =
  'user-read-recently-played user-read-playback-state user-read-private user-read-email'

function buildSpotifyAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
    show_dialog: 'true',
  })
  return `https://accounts.spotify.com/authorize?${params.toString()}`
}

export async function POST(request: NextRequest) {
  try {
    let clientId: string
    let clientSecret: string

    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = await request.formData()
      clientId = (form.get('clientId') as string)?.trim() || ''
      clientSecret = (form.get('clientSecret') as string)?.trim() || ''
    } else if (contentType.includes('application/json')) {
      const body = await request.json()
      clientId = (body.clientId as string)?.trim() || ''
      clientSecret = (body.clientSecret as string)?.trim() || ''
    } else {
      return NextResponse.json(
        { error: 'Content-Type must be application/x-www-form-urlencoded or application/json' },
        { status: 400 }
      )
    }

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Missing Client ID or Client Secret' },
        { status: 400 }
      )
    }

    const redirectUri = getSpotifyCallbackRedirectUri(request)
    const state = randomBytes(16).toString('hex')
    const payload = { state, clientId, clientSecret }
    const encrypted = encryptSpotifyOAuthPayload(payload)
    const spotifyAuthUrl = buildSpotifyAuthUrl(clientId, redirectUri, state)

    // Return 200 with redirectUrl so the client can navigate (avoids 302 handling issues with fetch/CORS/proxies)
    const response = NextResponse.json({ redirectUrl: spotifyAuthUrl })
    const isProd = process.env.NODE_ENV === 'production'
    response.cookies.set(SPOTIFY_OAUTH_COOKIE_NAME, encrypted, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    })
    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start Spotify auth'
    if (message.includes('SPOTIFY_OAUTH_STATE_SECRET')) {
      return NextResponse.json(
        { error: message, code: 'OAUTH_NOT_CONFIGURED' },
        { status: 501 }
      )
    }
    console.error('Spotify auth start error:', err)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
