import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  decryptSpotifyOAuthPayload,
  getSpotifyCallbackRedirectUri,
  SPOTIFY_OAUTH_COOKIE_NAME,
} from '@/lib/spotify-oauth-state'

interface SpotifyTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
  scope: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} – Spotify Pulse</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 2rem auto; padding: 1rem; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    .error { color: #dc2626; }
    .success { color: #16a34a; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    pre { background: #f0f0f0; padding: 1rem; border-radius: 6px; overflow-x: auto; word-break: break-all; margin: 0.5rem 0; font-size: 0.8rem; }
    a { color: #2563eb; }
    ul { line-height: 1.7; }
    .copy-btn { padding: 0.5rem 0.75rem; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer; font-size: 0.875rem; }
  </style>
</head>
<body>${body}</body>
</html>`
}

function errorBody(message: string, hint: string): string {
  return `
  <h1 class="error">Authorization failed</h1>
  <p>${escapeHtml(message)}</p>
  <p>${escapeHtml(hint)}</p>
  <p><a href="/settings">Back to Settings</a></p>
  `
}

function successBody(clientId: string, refreshToken: string): string {
  const safeToken = escapeHtml(refreshToken)
  return `
  <h1 class="success">Setup complete</h1>
  <p>Add these to <strong>GitHub</strong> (Settings → Secrets and variables → Actions) and <strong>Vercel</strong> (Project → Settings → Environment Variables):</p>
  <ul>
    <li><code>SPOTIFY_CLIENT_ID</code> – your Client ID</li>
    <li><code>SPOTIFY_CLIENT_SECRET</code> – your Client Secret</li>
    <li><code>SPOTIFY_REFRESH_TOKEN</code> – see below</li>
  </ul>
  <p style="margin-bottom: 0.25rem;">Refresh token (copy and add to secrets):</p>
  <div style="display: flex; align-items: flex-start; gap: 0.5rem;">
    <pre id="token">${safeToken}</pre>
    <button type="button" id="copyBtn" class="copy-btn">Copy</button>
  </div>
  <script>
    document.getElementById('copyBtn').onclick = function() {
      var el = document.getElementById('token');
      var btn = document.getElementById('copyBtn');
      navigator.clipboard.writeText(el.textContent).then(function() { btn.textContent = 'Copied!'; setTimeout(function() { btn.textContent = 'Copy'; }, 1500); });
    };
  </script>
  <p><a href="/settings">Back to Settings</a></p>
  `
}

function clearCookieResponse(html: string, title: string): NextResponse {
  const res = new NextResponse(htmlPage(title, html), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
  res.cookies.set(SPOTIFY_OAUTH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return res
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return clearCookieResponse(
      errorBody(
        `Spotify returned an error: ${error}`,
        'Start the flow again from Settings and make sure your app redirect URI matches this app’s URL.'
      ),
      'Spotify auth failed'
    )
  }

  if (!code || !state) {
    return clearCookieResponse(
      errorBody(
        'Missing code or state from Spotify.',
        'Start the flow from Settings: enter Client ID and Client Secret, then click Authorize with Spotify.'
      ),
      'Spotify callback'
    )
  }

  const cookieStore = await cookies()
  const cookie = cookieStore.get(SPOTIFY_OAUTH_COOKIE_NAME)?.value
  if (!cookie) {
    return clearCookieResponse(
      errorBody(
        'Session expired or missing.',
        'Start the flow again from Settings (enter Client ID and Client Secret, then Authorize with Spotify).'
      ),
      'Spotify callback'
    )
  }

  const payload = decryptSpotifyOAuthPayload(cookie)
  if (!payload) {
    return clearCookieResponse(
      errorBody(
        'Could not read session. Is SPOTIFY_OAUTH_STATE_SECRET set in this environment?',
        'Start the flow again from Settings.'
      ),
      'Spotify callback'
    )
  }

  if (payload.state !== state) {
    return clearCookieResponse(
      errorBody('State mismatch. Possible CSRF.', 'Start the flow again from Settings.'),
      'Spotify callback'
    )
  }

  const redirectUri = getSpotifyCallbackRedirectUri(request)
  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${payload.clientId}:${payload.clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!tokenRes.ok) {
    const errText = await tokenRes.text()
    return clearCookieResponse(
      errorBody(
        `Token exchange failed (${tokenRes.status}). Often this means the redirect URI in your Spotify app does not exactly match: ${redirectUri}`,
        'Add this exact redirect URI in the Spotify Developer Dashboard, then try again from Settings.'
      ),
      'Spotify callback'
    )
  }

  const tokens = (await tokenRes.json()) as SpotifyTokenResponse
  if (!tokens.refresh_token) {
    return clearCookieResponse(
      errorBody('Spotify did not return a refresh token.', 'Try again from Settings.'),
      'Spotify callback'
    )
  }

  return clearCookieResponse(
    successBody(payload.clientId, tokens.refresh_token),
    'Spotify auth done'
  )
}
