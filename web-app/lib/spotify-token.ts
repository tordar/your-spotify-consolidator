import { supabaseAdmin } from './supabase'

interface SpotifyTokens {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope: string
}

/**
 * Get a valid Spotify access token for a user
 * Refreshes the token if it's expired
 */
export async function getSpotifyAccessToken(userId: string): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured')
  }

  // Get Spotify account for user
  const { data: account, error } = await supabaseAdmin
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'spotify')
    .single()

  if (error || !account) {
    throw new Error('Spotify account not connected. Please connect your Spotify account first.')
  }

  if (!account.refresh_token) {
    throw new Error('No refresh token found. Please reconnect your Spotify account.')
  }

  // Check if token is expired (with 5 minute buffer)
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = account.expires_at || 0
  const needsRefresh = expiresAt < (now + 300) // 5 minute buffer

  // If token is still valid, return it
  if (!needsRefresh && account.access_token) {
    return account.access_token
  }

  // Refresh the token
  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Spotify client credentials not configured')
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: account.refresh_token
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to refresh Spotify token: ${response.status} ${errorText}`)
  }

  const tokens = await response.json() as SpotifyTokens

  // Update the account with new token
  const newExpiresAt = Math.floor(Date.now() / 1000) + (tokens.expires_in || 3600)

  await supabaseAdmin
    .from('accounts')
    .update({
      access_token: tokens.access_token,
      expires_at: newExpiresAt,
      token_type: tokens.token_type,
      scope: tokens.scope,
      // Update refresh_token if provided (Spotify sometimes returns a new one)
      ...(tokens.refresh_token && { refresh_token: tokens.refresh_token })
    })
    .eq('id', account.id)

  return tokens.access_token
}

/**
 * Check if user has Spotify connected
 */
export async function hasSpotifyConnected(userId: string): Promise<boolean> {
  if (!supabaseAdmin) {
    return false
  }

  const { data, error } = await supabaseAdmin
    .from('accounts')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', 'spotify')
    .single()

  return !error && !!data
}

