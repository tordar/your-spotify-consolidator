/**
 * Aggregate streaming history to albums with songs (top 500, consolidated).
 * Mirrors scripts/cleaner/generate-cleaned-files-from-history.ts generateAlbumsWithSongs.
 */

import type {
  CompleteListeningHistoryLike,
  CompleteSongLike,
  AlbumWithSongs,
  AlbumSong,
} from './streaming-history-types'
import { ConsolidationRulesManager, Consolidator } from './consolidation'

const TOP_ALBUMS_LIMIT = 5000

export function aggregateToAlbumsWithSongs(
  history: CompleteListeningHistoryLike,
  options?: { limit?: number }
): { albums: AlbumWithSongs[]; originalCount: number; consolidatedCount: number } {
  const limit = options?.limit ?? TOP_ALBUMS_LIMIT
  const effectiveLimit = limit === Infinity || limit > 0 ? limit : TOP_ALBUMS_LIMIT
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const cutoffTimestamp = thirtyDaysAgo.getTime()

  const consolidator = new Consolidator(new ConsolidationRulesManager())
  const albumMap = new Map<string, CompleteSongLike[]>()

  history.songs.forEach((song) => {
    const albumName = (song.album?.name ?? '').trim()
    if (!albumName) return
    const songArtist = (song.artists?.[0] || song.artist?.name || 'Unknown Artist').trim()
    const normalizedAlbumName = consolidator.normalizeAlbumNameForGrouping(albumName, songArtist)
    const albumKey = `${normalizedAlbumName}|${songArtist.toLowerCase()}`
    if (!albumMap.has(albumKey)) albumMap.set(albumKey, [])
    albumMap.get(albumKey)!.push(song)
  })

  const albumsWithSongs: AlbumWithSongs[] = Array.from(albumMap.entries()).map(([, songs]) => {
    const artistCounts = new Map<string, number>()
    songs.forEach((s) => {
      const a = (s.artists?.[0] || s.artist?.name || '').trim().toLowerCase()
      if (a) artistCounts.set(a, (artistCounts.get(a) ?? 0) + 1)
    })
    let mostCommonArtist = ''
    let maxCount = 0
    artistCounts.forEach((c, a) => {
      if (c > maxCount) {
        maxCount = c
        mostCommonArtist = a
      }
    })
    let representativeSong = songs[0]
    let mostRecentPlayTime = 0
    songs.forEach((s) => {
      if (s.listeningEvents?.length) {
        const t = new Date(s.listeningEvents[s.listeningEvents.length - 1].playedAt).getTime()
        if (t > mostRecentPlayTime) {
          mostRecentPlayTime = t
          representativeSong = s
        }
      }
    })
    const matchingSongs = songs.filter((s) => {
      const a = (s.artists?.[0] || s.artist?.name || '').toLowerCase().trim()
      return a === mostCommonArtist || !a
    })
    const validSongs = matchingSongs.length > 0 ? matchingSongs : songs
    const totalPlayCount = validSongs.reduce((sum, s) => sum + s.playCount, 0)
    const totalListeningTime = validSongs.reduce((sum, s) => sum + s.totalListeningTime, 0)
    let totalPlayCount30DaysAgo = 0
    validSongs.forEach((s) => {
      totalPlayCount30DaysAgo += (s.listeningEvents ?? []).filter(
        (e) => new Date(e.playedAt).getTime() < cutoffTimestamp
      ).length
    })
    let earliestPlayedAt: string | undefined
    const yearlyPlayTimeMap = new Map<string, number>()
    validSongs.forEach((s) => {
      (s.listeningEvents ?? []).forEach((e) => {
        if (e.playedAt) {
          if (!earliestPlayedAt || e.playedAt < earliestPlayedAt) earliestPlayedAt = e.playedAt
          const year = new Date(e.playedAt).getFullYear().toString()
          yearlyPlayTimeMap.set(year, (yearlyPlayTimeMap.get(year) ?? 0) + e.msPlayed)
        }
      })
    })
    const yearly_play_time = Array.from(yearlyPlayTimeMap.entries())
      .map(([year, totalListeningTimeMs]) => ({ year, totalListeningTimeMs }))
      .sort((a, b) => a.year.localeCompare(b.year))

    const albumSongs: AlbumSong[] = validSongs.map((s) => ({
      songId: s.songId,
      name: s.name,
      duration_ms: s.duration_ms ?? 0,
      track_number: 1,
      disc_number: 1,
      explicit: false,
      preview_url: s.preview_url ?? null,
      external_urls: s.external_urls ?? {},
      play_count: s.playCount,
      total_listening_time_ms: s.totalListeningTime,
      artists: s.artists ?? [s.artist?.name ?? 'Unknown Artist'],
    }))

    const albumArtists = [...new Set(validSongs.map((s) => s.artists?.[0] || s.artist?.name).filter(Boolean))].slice(0, 1) as string[]
    const firstArtist = validSongs[0]?.artists?.[0] || validSongs[0]?.artist?.name || 'Unknown Artist'
    const baseAlbumName = consolidator.getBaseAlbumNameForGrouping(
      validSongs[0]?.album?.name ?? '',
      firstArtist
    )
    let finalAlbumName: string
    if (baseAlbumName) {
      finalAlbumName = baseAlbumName
    } else {
      const nameCounts = new Map<string, number>()
      validSongs.forEach((s) => {
        const n = (s.album?.name ?? '').toLowerCase().trim()
        if (n) nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1)
      })
      let bestName = ''
      let bestCount = 0
      nameCounts.forEach((c, n) => {
        if (c > bestCount) {
          bestCount = c
          bestName = n
        }
      })
      const match = validSongs.find((s) => (s.album?.name ?? '').toLowerCase().trim() === bestName)
      finalAlbumName = match?.album?.name ?? representativeSong.album?.name ?? 'Unknown Album'
    }
    let repForAlbum = representativeSong
    let repTime = 0
    for (const s of validSongs) {
      if ((s.album?.name ?? '').toLowerCase().trim() !== finalAlbumName.toLowerCase().trim()) continue
      if (s.listeningEvents?.length) {
        const t = new Date(s.listeningEvents[s.listeningEvents.length - 1].playedAt).getTime()
        if (t > repTime) {
          repTime = t
          repForAlbum = s
        }
      }
    }
    const playedSongs = validSongs.filter((s) => s.playCount > 0).length

    return {
      rank: 0,
      duration_ms: totalListeningTime,
      count: totalPlayCount,
      count_30_days_ago: totalPlayCount30DaysAgo,
      differents: validSongs.length,
      primaryAlbumId: repForAlbum.songId,
      total_count: totalPlayCount,
      total_duration_ms: totalListeningTime,
      album: {
        name: finalAlbumName.trim(),
        album_type: 'album',
        artists: albumArtists.length > 0 ? albumArtists : [representativeSong.artists?.[0] || representativeSong.artist?.name || 'Unknown Artist'],
        release_date: repForAlbum.album?.release_date ?? '',
        release_date_precision: repForAlbum.album?.release_date_precision ?? 'day',
        popularity: 0,
        images: repForAlbum.album?.images ?? [],
        external_urls: {},
        genres: representativeSong.artist?.genres ?? [],
      },
      consolidated_count: totalPlayCount,
      original_albumIds: validSongs.map((s) => s.album?.id).filter((id): id is string => id !== '' && id != null) ?? [],
      total_songs: validSongs.length,
      played_songs: playedSongs,
      unplayed_songs: validSongs.length - playedSongs,
      songs: albumSongs.sort((a, b) => b.play_count - a.play_count),
      earliest_played_at: earliestPlayedAt,
      yearly_play_time: yearly_play_time.length > 0 ? yearly_play_time : undefined,
    }
  })

  albumsWithSongs.sort((a, b) => b.count - a.count)
  const originalCount = albumsWithSongs.length
  const consolidatedAlbums = consolidator.consolidateAlbumsWithSongs(albumsWithSongs)

  const albums30DaysAgo = consolidatedAlbums
    .map((a) => ({ ...a, count: a.count_30_days_ago ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, effectiveLimit === Infinity ? undefined : effectiveLimit)
  const rankMap30DaysAgo = new Map<string, number>()
  albums30DaysAgo.forEach((a, i) => {
    const key = `${a.album.name.toLowerCase().trim()}|${(a.album.artists[0] ?? '').toLowerCase().trim()}`
    rankMap30DaysAgo.set(key, i + 1)
    if (a.primaryAlbumId) rankMap30DaysAgo.set(a.primaryAlbumId, i + 1)
  })

  const sliceEnd = effectiveLimit === Infinity ? undefined : effectiveLimit
  const rankedAlbums = consolidatedAlbums.slice(0, sliceEnd).map((album, index) => {
    const key = `${album.album.name.toLowerCase().trim()}|${(album.album.artists[0] ?? '').toLowerCase().trim()}`
    const rank_30_days_ago = rankMap30DaysAgo.get(key) ?? rankMap30DaysAgo.get(album.primaryAlbumId)
    return {
      ...album,
      rank: index + 1,
      rank_30_days_ago,
    }
  })

  return {
    albums: rankedAlbums,
    originalCount,
    consolidatedCount: consolidatedAlbums.length,
  }
}
