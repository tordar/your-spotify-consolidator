/**
 * Server-only: fetch current playback state from Spotify (GET /me/player).
 * Requires SPOTIFY_* env and refresh token with user-read-playback-state scope.
 */

import { getSpotifyAccessToken } from './spotify-auth'

export interface PlaybackDevice {
  id: string | null
  is_active: boolean
  is_private_session: boolean
  is_restricted: boolean
  name: string
  type: string
  volume_percent: number | null
  supports_volume: boolean
}

export interface PlaybackTrack {
  id: string
  name: string
  duration_ms: number
  type: 'track'
  uri: string
  is_local: boolean
  artists: Array<{ id: string; name: string; type: string }>
  album: {
    id: string
    name: string
    images: Array<{ url: string; height: number | null; width: number | null }>
  }
  external_urls?: { spotify: string }
}

export interface PlaybackState {
  device: PlaybackDevice
  repeat_state: 'off' | 'track' | 'context'
  shuffle_state: boolean
  timestamp: number
  progress_ms: number | null
  is_playing: boolean
  item: PlaybackTrack | null
  currently_playing_type: 'track' | 'episode' | 'ad' | 'unknown'
}

/**
 * Fetch current playback state. Returns null if not configured, no active device, or 204.
 */
export async function getPlaybackState(): Promise<PlaybackState | null> {
  try {
    const accessToken = await getSpotifyAccessToken()
    const response = await fetch('https://api.spotify.com/v1/me/player', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (response.status === 204) return null
    if (!response.ok) return null

    const data = await response.json()
    return data as PlaybackState
  } catch {
    return null
  }
}
