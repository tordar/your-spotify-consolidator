/**
 * Types for streaming history and cleaned song aggregation.
 * Kept in sync with scripts/cleaner/utils/types.ts for API output.
 */

export interface CleanedSong {
  rank: number
  duration_ms: number
  count: number
  songId: string
  song: {
    name: string
    preview_url: string | null
    external_urls: Record<string, string>
  }
  album: {
    name: string
    images: Array<{ height: number; url: string; width: number }>
  }
  artist: {
    name: string
    genres: string[]
    images?: Array<{ height: number; url: string; width: number }>
  }
  consolidated_count: number
  original_songIds: string[]
  yearly_play_time?: Array<{ year: string; totalListeningTimeMs: number }>
  rank_30_days_ago?: number
  count_30_days_ago?: number
}

/** One song with inline album/artist (merged or resolved from deduplicated). */
export interface CompleteSongLike {
  songId: string
  name: string
  duration_ms: number
  artists: string[]
  album: {
    id: string
    name: string
    images: Array<{ height: number; url: string; width: number }>
    release_date?: string
    release_date_precision?: string
  }
  artist: {
    name: string
    genres: string[]
    images?: Array<{ height: number; url: string; width: number }>
  }
  external_urls: { spotify: string }
  preview_url: string | null
  playCount: number
  totalListeningTime: number
  listeningEvents: Array<{ playedAt: string; msPlayed: number; conn_country?: string }>
}

export interface CompleteListeningHistoryLike {
  songs: CompleteSongLike[]
}

// Album aggregation (for albums-with-songs API)
export interface AlbumSong {
  songId: string
  name: string
  duration_ms: number
  track_number: number
  disc_number: number
  explicit: boolean
  preview_url: string | null
  external_urls: Record<string, string>
  play_count: number
  total_listening_time_ms: number
  artists: string[]
}

export interface CleanedAlbum {
  rank: number
  duration_ms: number
  count: number
  differents: number
  primaryAlbumId: string
  total_count: number
  total_duration_ms: number
  album: {
    name: string
    album_type: string
    artists: string[]
    release_date: string
    release_date_precision: string
    popularity: number
    images: Array<{ height: number; url: string; width: number }>
    external_urls: Record<string, string>
    genres: string[]
  }
  consolidated_count: number
  original_albumIds: string[]
  rank_30_days_ago?: number
  count_30_days_ago?: number
}

export interface AlbumWithSongs extends CleanedAlbum {
  total_songs: number
  played_songs: number
  unplayed_songs: number
  songs: AlbumSong[]
  earliest_played_at?: string
  yearly_play_time?: Array<{ year: string; totalListeningTimeMs: number }>
}

// Artist aggregation (for artists API)
export interface ArtistTopSong {
  songId: string
  name: string
  play_count: number
  total_listening_time_ms: number
  album: {
    name: string
    images: Array<{ height: number; url: string; width: number }>
  }
}

export interface ArtistTopAlbum {
  primaryAlbumId: string
  name: string
  play_count: number
  total_listening_time_ms: number
  images: Array<{ height: number; url: string; width: number }>
  artists: string[]
}

export interface CleanedArtist {
  rank: number
  duration_ms: number
  count: number
  differents: number
  primaryArtistId: string
  total_count: number
  total_duration_ms: number
  artist: {
    name: string
    genres: string[]
    popularity: number
    followers: { total: number }
    images: Array<{ height: number; url: string; width: number }>
    external_urls: Record<string, string>
  }
  consolidated_count: number
  original_artistIds: string[]
  yearly_play_time?: Array<{ year: string; totalListeningTimeMs: number }>
  top_songs?: ArtistTopSong[]
  top_albums?: ArtistTopAlbum[]
  rank_30_days_ago?: number
  count_30_days_ago?: number
}
