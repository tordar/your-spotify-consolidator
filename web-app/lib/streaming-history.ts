/**
 * Load latest merged or deduplicated streaming history and normalize to a single shape.
 */

import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import type { CompleteSongLike, CompleteListeningHistoryLike } from './streaming-history-types'

const DEDUP_PREFIX = 'deduplicated-streaming-history'
const MERGED_PREFIX = 'merged-streaming-history'

export function getMergedHistoryDir(): string {
  const fromWebApp = join(process.cwd(), '..', 'data', 'merged-streaming-history')
  const fromRepoRoot = join(process.cwd(), 'data', 'merged-streaming-history')
  if (existsSync(fromWebApp)) return fromWebApp
  if (existsSync(fromRepoRoot)) return fromRepoRoot
  return fromWebApp
}

/**
 * Returns the path to the latest history file (prefers deduplicated, then merged).
 */
export async function getLatestHistoryPath(): Promise<string | null> {
  const dataDir = getMergedHistoryDir()
  if (!existsSync(dataDir)) return null
  const files = await readdir(dataDir)
  const withTs = files
    .filter(
      (f) =>
        (f.startsWith(DEDUP_PREFIX) || f.startsWith(MERGED_PREFIX)) && f.endsWith('.json')
    )
    .map((f) => ({
      name: f,
      path: join(dataDir, f),
      ts: parseInt(f.replace(/\D/g, ''), 10) || 0,
    }))
    .sort((a, b) => b.ts - a.ts)
  return withTs.length > 0 ? withTs[0].path : null
}

/**
 * Deduplicated file has songs[] with albumId/artistId and albums{}, artists{}.
 * Merged file has songs[] with inline album/artist.
 */
export async function loadHistory(filePath: string): Promise<CompleteListeningHistoryLike> {
  const raw = await readFile(filePath, 'utf-8')
  const data = JSON.parse(raw) as {
    songs: Array<{
      songId: string
      name: string
      albumId?: string
      artistId?: string
      duration_ms?: number
      playCount?: number
      totalListeningTime?: number
      listeningEvents: Array<{ playedAt: string; msPlayed: number; conn_country?: string }>
      external_urls?: { spotify: string }
      preview_url?: string | null
      album?: { id?: string; name: string; images?: Array<{ height: number; url: string; width: number }> }
      artist?: { name: string; genres?: string[] }
      artists?: string[]
    }>
    albums?: Record<string, { id: string; name: string; images: Array<{ height: number; url: string; width: number }>; release_date?: string; release_date_precision?: string }>
    artists?: Record<string, { id: string; name: string; genres?: string[]; images?: Array<{ height: number; url: string; width: number }> }>
  }

  if (data.albums && data.artists && Array.isArray(data.songs)) {
    const songs: CompleteSongLike[] = data.songs.map((s) => {
      const albumId = s.albumId ?? ''
      const artistId = s.artistId ?? ''
      const album = data.albums![albumId] ?? { id: '', name: 'Unknown Album', images: [] }
      const artist = data.artists![artistId] ?? { id: '', name: 'Unknown Artist', genres: [] }
      return {
        songId: s.songId,
        name: s.name,
        duration_ms: s.duration_ms ?? 0,
        artists: [artist.name],
        album: {
          id: album.id,
          name: album.name,
          images: album.images ?? [],
          ...(album.release_date != null && { release_date: album.release_date }),
          ...(album.release_date_precision != null && { release_date_precision: album.release_date_precision }),
        },
        artist: {
          name: artist.name,
          genres: artist.genres ?? [],
          ...(artist.images?.length && { images: artist.images }),
        },
        external_urls: s.external_urls ?? { spotify: `spotify:track:${s.songId}` },
        preview_url: s.preview_url ?? null,
        playCount: s.playCount ?? s.listeningEvents?.length ?? 0,
        totalListeningTime: s.totalListeningTime ?? s.listeningEvents?.reduce((sum, e) => sum + e.msPlayed, 0) ?? 0,
        listeningEvents: s.listeningEvents ?? [],
      }
    })
    return { songs }
  }

  const songs: CompleteSongLike[] = (data.songs ?? []).map((s) => ({
    songId: s.songId,
    name: s.name,
    duration_ms: s.duration_ms ?? 0,
    artists: s.artists ?? [s.artist?.name ?? 'Unknown Artist'],
    album: {
      id: s.album?.id ?? '',
      name: s.album?.name ?? 'Unknown Album',
      images: s.album?.images ?? [],
    },
    artist: {
      name: s.artist?.name ?? s.artists?.[0] ?? 'Unknown Artist',
      genres: s.artist?.genres ?? [],
    },
    external_urls: s.external_urls ?? { spotify: `spotify:track:${s.songId}` },
    preview_url: s.preview_url ?? null,
    playCount: s.playCount ?? s.listeningEvents?.length ?? 0,
    totalListeningTime: s.totalListeningTime ?? s.listeningEvents?.reduce((sum, e) => sum + e.msPlayed, 0) ?? 0,
    listeningEvents: s.listeningEvents ?? [],
  }))
  return { songs }
}
