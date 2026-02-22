import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto'

export const SPOTIFY_OAUTH_COOKIE_NAME = 'spotify_oauth'

/**
 * Build the redirect_uri used for Spotify OAuth. Uses the request Host when
 * present (so custom domains like pulse.tordar.no work); otherwise VERCEL_URL
 * or APP_URL. Protocol is https unless host is localhost/127.0.0.1.
 */
export function getSpotifyCallbackRedirectUri(request?: { headers: { get(name: string): string | null } }): string {
  const host = request?.headers?.get('host')?.trim()
  if (host) {
    const forwardedProto = request?.headers?.get('x-forwarded-proto')?.trim()
    const proto = forwardedProto === 'https' ? 'https' : (/^localhost$|^127\.0\.0\.1$/i.test(host) ? 'http' : 'https')
    return `${proto}://${host}/callback`
  }
  const vercelUrl = process.env.VERCEL_URL?.trim()
  if (vercelUrl) return `https://${vercelUrl}/callback`
  return `${(process.env.APP_URL || 'http://127.0.0.1:3000').trim()}/callback`
}

function getEncryptionKey(): Buffer {
  const secret = (process.env.SPOTIFY_OAUTH_STATE_SECRET || '').trim()
  if (!secret) {
    throw new Error(
      'SPOTIFY_OAUTH_STATE_SECRET is not set. Add it in Vercel (or .env.local) to use in-app Spotify auth.'
    )
  }
  return createHash('sha256').update(secret, 'utf8').digest()
}

export function encryptSpotifyOAuthPayload(payload: {
  state: string
  clientId: string
  clientSecret: string
}): string {
  const key = getEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64url')
}

export function decryptSpotifyOAuthPayload(encrypted: string): {
  state: string
  clientId: string
  clientSecret: string
} | null {
  try {
    const key = getEncryptionKey()
    const buf = Buffer.from(encrypted, 'base64url')
    if (buf.length < 12 + 16) return null
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const data = buf.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const json = decipher.update(data) + decipher.final('utf8')
    return JSON.parse(json) as {
      state: string
      clientId: string
      clientSecret: string
    }
  } catch {
    return null
  }
}
