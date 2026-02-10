/**
 * Aggregate streaming history to cleaned artists (top 500, consolidated).
 * Mirrors scripts/cleaner/generate-cleaned-files-from-history.ts generateCleanedArtists.
 */

import type {
  CompleteListeningHistoryLike,
  CompleteSongLike,
  CleanedArtist,
  ArtistTopSong,
  ArtistTopAlbum,
} from './streaming-history-types'
import { ConsolidationRulesManager, Consolidator } from './consolidation'

const TOP_ARTISTS_LIMIT = 100

export function aggregateToCleanedArtists(
  history: CompleteListeningHistoryLike
): { artists: CleanedArtist[]; originalCount: number; consolidatedCount: number } {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const cutoffTimestamp = thirtyDaysAgo.getTime()

  const consolidator = new Consolidator(new ConsolidationRulesManager())
  const artistMap = new Map<
    string,
    {
      songs: CompleteSongLike[]
      totalPlayCount: number
      totalListeningTime: number
      totalPlayCount30DaysAgo: number
      differentSongs: Set<string>
    }
  >()

  history.songs.forEach((song) => {
    const artistName = song.artist?.name || song.artists?.[0] || 'Unknown Artist'
    const events30DaysAgo = (song.listeningEvents ?? []).filter(
      (e) => new Date(e.playedAt).getTime() < cutoffTimestamp
    )
    const count30DaysAgo = events30DaysAgo.length

    if (!artistMap.has(artistName)) {
      artistMap.set(artistName, {
        songs: [],
        totalPlayCount: 0,
        totalListeningTime: 0,
        totalPlayCount30DaysAgo: 0,
        differentSongs: new Set(),
      })
    }
    const data = artistMap.get(artistName)!
    data.songs.push(song)
    data.totalPlayCount += song.playCount
    data.totalListeningTime += song.totalListeningTime
    data.totalPlayCount30DaysAgo += count30DaysAgo
    data.differentSongs.add(song.songId)
  })

  const artists: CleanedArtist[] = Array.from(artistMap.entries()).map(([artistName, data]) => {
    let representativeSong = data.songs[0]
    let mostRecentPlayTime = 0
    const yearlyPlayTimeMap = new Map<string, number>()

    data.songs.forEach((song) => {
      const events = song.listeningEvents ?? []
      if (events.length) {
        const lastTime = new Date(events[events.length - 1].playedAt).getTime()
        if (lastTime > mostRecentPlayTime) {
          mostRecentPlayTime = lastTime
          representativeSong = song
        }
      }
      events.forEach((e) => {
        if (e.playedAt) {
          const year = new Date(e.playedAt).getFullYear().toString()
          yearlyPlayTimeMap.set(year, (yearlyPlayTimeMap.get(year) ?? 0) + e.msPlayed)
        }
      })
    })

    const yearly_play_time = Array.from(yearlyPlayTimeMap.entries())
      .map(([year, totalListeningTimeMs]) => ({ year, totalListeningTimeMs }))
      .sort((a, b) => a.year.localeCompare(b.year))

    const songMap = new Map<
      string,
      {
        songId: string
        name: string
        playCount: number
        totalListeningTime: number
        album: { name: string; images: Array<{ height: number; url: string; width: number }> }
      }
    >()
    data.songs.forEach((song) => {
      const key = song.name.toLowerCase().trim()
      if (songMap.has(key)) {
        const ex = songMap.get(key)!
        ex.playCount += song.playCount
        ex.totalListeningTime += song.totalListeningTime
        if (
          song.playCount > ex.playCount ||
          (song.album?.images?.length && !ex.album.images?.length)
        ) {
          ex.songId = song.songId
          ex.name = song.name
          if (song.album?.images?.length) ex.album.images = song.album.images
        }
      } else {
        songMap.set(key, {
          songId: song.songId,
          name: song.name,
          playCount: song.playCount,
          totalListeningTime: song.totalListeningTime,
          album: { name: song.album?.name ?? '', images: song.album?.images ?? [] },
        })
      }
    })
    const top_songs: ArtistTopSong[] = Array.from(songMap.values())
      .sort((a, b) => b.totalListeningTime - a.totalListeningTime)
      .slice(0, 5)
      .map((s) => ({
        songId: s.songId,
        name: s.name,
        play_count: s.playCount,
        total_listening_time_ms: s.totalListeningTime,
        album: { name: s.album.name, images: s.album.images },
      }))

    const albumMap = new Map<
      string,
      {
        primaryAlbumId: string
        name: string
        playCount: number
        totalListeningTime: number
        images: Array<{ height: number; url: string; width: number }>
        artists: string[]
      }
    >()
    data.songs.forEach((song) => {
      const albumName = (song.album?.name ?? '').trim()
      if (!albumName) return
      const normalized = consolidator.normalizeAlbumNameForGrouping(albumName, artistName)
      const albumKey = normalized.toLowerCase()
      if (albumMap.has(albumKey)) {
        const ex = albumMap.get(albumKey)!
        ex.playCount += song.playCount
        ex.totalListeningTime += song.totalListeningTime
        if (
          song.playCount > ex.playCount ||
          (song.album?.images?.length && !ex.images?.length)
        ) {
          ex.primaryAlbumId = song.songId
          const base = consolidator.getBaseAlbumNameForGrouping(albumName, artistName)
          ex.name = base ?? albumName
          if (song.album?.images?.length) ex.images = song.album.images
        }
      } else {
        const base = consolidator.getBaseAlbumNameForGrouping(albumName, artistName)
        albumMap.set(albumKey, {
          primaryAlbumId: song.songId,
          name: base ?? albumName,
          playCount: song.playCount,
          totalListeningTime: song.totalListeningTime,
          images: song.album?.images ?? [],
          artists: song.artists?.length ? song.artists : [artistName],
        })
      }
    })
    const top_albums: ArtistTopAlbum[] = Array.from(albumMap.values())
      .sort((a, b) => b.totalListeningTime - a.totalListeningTime)
      .slice(0, 5)
      .map((a) => ({
        primaryAlbumId: a.primaryAlbumId,
        name: a.name,
        play_count: a.playCount,
        total_listening_time_ms: a.totalListeningTime,
        images: a.images,
        artists: a.artists,
      }))

    const duration_ms = data.songs.reduce((sum, s) => sum + (s.duration_ms ?? 0), 0)

    return {
      rank: 0,
      duration_ms,
      count: data.totalPlayCount,
      count_30_days_ago: data.totalPlayCount30DaysAgo,
      differents: data.differentSongs.size,
      primaryArtistId: representativeSong.songId,
      total_count: data.totalPlayCount,
      total_duration_ms: data.totalListeningTime,
      artist: {
        name: artistName,
        genres: representativeSong.artist?.genres ?? [],
        popularity: 0,
        followers: { total: 0 },
        images: representativeSong.artist?.images ?? [],
        external_urls: {},
      },
      consolidated_count: data.totalPlayCount,
      original_artistIds: [representativeSong.songId],
      yearly_play_time: yearly_play_time.length > 0 ? yearly_play_time : undefined,
      top_songs: top_songs.length > 0 ? top_songs : undefined,
      top_albums: top_albums.length > 0 ? top_albums : undefined,
    }
  })

  artists.sort((a, b) => b.count - a.count)
  const originalCount = artists.length
  const consolidatedArtists = consolidator.consolidateArtists(artists)

  const artists30DaysAgo = consolidatedArtists
    .map((a) => ({ ...a, count: a.count_30_days_ago ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_ARTISTS_LIMIT)
  const rankMap30DaysAgo = new Map<string, number>()
  artists30DaysAgo.forEach((a, i) => {
    rankMap30DaysAgo.set(a.artist.name.toLowerCase().trim(), i + 1)
    if (a.primaryArtistId) rankMap30DaysAgo.set(a.primaryArtistId, i + 1)
  })

  const rankedArtists = consolidatedArtists.slice(0, TOP_ARTISTS_LIMIT).map((artist, index) => {
    const rank_30_days_ago =
      rankMap30DaysAgo.get(artist.artist.name.toLowerCase().trim()) ??
      rankMap30DaysAgo.get(artist.primaryArtistId)
    return { ...artist, rank: index + 1, rank_30_days_ago }
  })

  return {
    artists: rankedArtists,
    originalCount,
    consolidatedCount: consolidatedArtists.length,
  }
}
