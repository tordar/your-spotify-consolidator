import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

// Generate PKCE code verifier (43-128 characters, URL-safe)
function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Buffer.from(array).toString('base64url')
}

// Generate PKCE code challenge from verifier
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Buffer.from(digest).toString('base64url')
}

export async function GET(request: NextRequest) {
  const session = await auth()
  
  if (!session?.user?.id) {
    // Redirect to sign-in page instead of returning JSON
    // This provides a better user experience
    const signInUrl = new URL('/auth/signin', request.url)
    signInUrl.searchParams.set('callbackUrl', '/profile')
    return NextResponse.redirect(signInUrl)
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'Spotify client ID not configured' }, { status: 500 })
  }

  // Get base URL from environment or request
  const baseUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || 
    `${request.nextUrl.protocol}//${request.nextUrl.host}`

  // Use a custom callback route instead of NextAuth's callback
  const redirectUri = `${baseUrl}/api/spotify/callback`
  const scopes = 'user-read-recently-played user-read-email user-read-private'
  
  // Generate PKCE values
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  
  // Generate state for CSRF protection (include user ID to link account)
  const state = `${crypto.randomUUID()}:${session.user.id}`
  
  // Build authorization URL with PKCE
  const authUrl = `https://accounts.spotify.com/authorize?${new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    show_dialog: 'true'
  }).toString()}`
  
  // Store PKCE code verifier and state in database (cookies don't persist through external redirects)
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  // Store in verification_tokens table (temporary storage, expires in 15 minutes)
  // Use a longer expiration to account for timezone issues and user interaction time
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes from now
  
  const { error: dbError } = await supabaseAdmin
    .from('verification_tokens')
    .insert({
      identifier: `spotify_oauth:${state}`,
      token: codeVerifier, // Store code verifier as the token
      expires: expiresAt.toISOString(),
    })

  if (dbError) {
    console.error('Error storing OAuth state:', dbError)
    return NextResponse.json({ error: 'Failed to store OAuth state' }, { status: 500 })
  }


  return NextResponse.redirect(authUrl)
}

