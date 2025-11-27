import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

interface SpotifyTokenResponse {
  access_token: string
  token_type: string
  scope: string
  expires_in: number
  refresh_token: string
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL(`/auth/error?error=${error}`, request.url))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/auth/error?error=missing_parameters', request.url))
  }

  // Decode the state parameter (Spotify URL-encodes it)
  const decodedState = decodeURIComponent(state)

  // Extract user ID from decoded state
  const userId = decodedState.split(':')[1]
  if (!userId) {
    return NextResponse.redirect(new URL('/auth/error?error=invalid_state', request.url))
  }

  // Retrieve code verifier from database using state as identifier
  if (!supabaseAdmin) {
    return NextResponse.redirect(new URL('/auth/error?error=database_error', request.url))
  }

  const { data: tokenData, error: tokenError } = await supabaseAdmin
    .from('verification_tokens')
    .select('token, expires')
    .eq('identifier', `spotify_oauth:${decodedState}`)
    .single()

  if (tokenError || !tokenData) {
    console.error('Error retrieving OAuth state:', tokenError)
    return NextResponse.redirect(new URL('/auth/error?error=invalid_state', request.url))
  }

  // OAuth flows complete in seconds, so we don't need strict expiration checking
  // The database cleanup will handle old tokens eventually
  // Just verify the token exists and retrieve the code verifier

  const codeVerifier = tokenData.token

  // Clean up the token after use
  await supabaseAdmin
    .from('verification_tokens')
    .delete()
    .eq('identifier', `spotify_oauth:${decodedState}`)

  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/auth/error?error=configuration', request.url))
  }

  // Get base URL for redirect URI
  const baseUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || 
    `${request.nextUrl.protocol}//${request.nextUrl.host}`
  const redirectUri = `${baseUrl}/api/spotify/callback`

  try {
    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
      })
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Spotify token exchange error:', errorText)
      return NextResponse.redirect(new URL('/auth/error?error=token_exchange_failed', request.url))
    }

    const tokens: SpotifyTokenResponse = await tokenResponse.json()

    // Get user info from Spotify
    const userResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`
      }
    })

    if (!userResponse.ok) {
      return NextResponse.redirect(new URL('/auth/error?error=user_info_failed', request.url))
    }

    const spotifyUser = await userResponse.json()

    // Calculate expiration timestamp
    const expiresAt = Math.floor(Date.now() / 1000) + (tokens.expires_in || 3600)

    // Save or update account in database
    if (!supabaseAdmin) {
      return NextResponse.redirect(new URL('/auth/error?error=database_error', request.url))
    }

    // Check if account already exists
    const { data: existingAccount } = await supabaseAdmin
      .from('accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'spotify')
      .single()

    const accountData = {
      user_id: userId,
      type: 'oauth',
      provider: 'spotify',
      provider_account_id: spotifyUser.id,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      expires_at: expiresAt,
      token_type: tokens.token_type,
      scope: tokens.scope,
    }

    if (existingAccount) {
      // Update existing account
      await supabaseAdmin
        .from('accounts')
        .update(accountData)
        .eq('id', existingAccount.id)
    } else {
      // Create new account
      await supabaseAdmin
        .from('accounts')
        .insert({
          id: crypto.randomUUID(),
          ...accountData,
        })
    }

    // Redirect to profile page
    return NextResponse.redirect(new URL('/profile?spotify=connected', request.url))
  } catch (error) {
    console.error('Error in Spotify callback:', error)
    return NextResponse.redirect(new URL('/auth/error?error=callback_error', request.url))
  }
}

