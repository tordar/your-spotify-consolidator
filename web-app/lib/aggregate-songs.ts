/**
 * Aggregate streaming history to cleaned songs (top 500, consolidated, with ranks).
 * Mirrors scripts/cleaner/generate-cleaned-files-from-history.ts generateCleanedSongs.
 */

import type { CompleteSongLike, CleanedSong, CompleteListeningHistoryLike } from './streaming-history-types'
import { ConsolidationRulesManager, Consolidator } from './consolidation'

const TOP_SONGS_LIMIT = 1000

export function aggregateToCleanedSongs(
  history: CompleteListeningHistoryLike
): { songs: CleanedSong[]; originalCount: number; consolidatedCount: number } {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const cutoffTimestamp = thirtyDaysAgo.getTime()

  const songIdToSong = new Map<string, CompleteSongLike>()
  history.songs.forEach((s) => songIdToSong.set(s.songId, s))

  const songs: CleanedSong[] = history.songs.map((song) => {
    const events30DaysAgo = song.listeningEvents.filter(
      (e) => new Date(e.playedAt).getTime() < cutoffTimestamp
    )
    const yearlyPlayTimeMap = new Map<string, number>()
    song.listeningEvents.forEach((e) => {
      if (!e.playedAt) return
      const year = new Date(e.playedAt).getFullYear().toString()
      yearlyPlayTimeMap.set(year, (yearlyPlayTimeMap.get(year) ?? 0) + e.msPlayed)
    })
    const yearly_play_time = Array.from(yearlyPlayTimeMap.entries())
      .map(([year, totalListeningTimeMs]) => ({ year, totalListeningTimeMs }))
      .sort((a, b) => a.year.localeCompare(b.year))

    return {
      rank: 0,
      duration_ms: song.totalListeningTime,
      count: song.playCount,
      count_30_days_ago: events30DaysAgo.length,
      songId: song.songId,
      song: {
        name: song.name,
        preview_url: song.preview_url,
        external_urls: song.external_urls,
      },
      album: {
        name: song.album.name,
        images: song.album.images ?? [],
      },
      artist: {
        name: song.artist.name,
        genres: song.artist.genres ?? [],
        ...(song.artist.images?.length && { images: song.artist.images }),
      },
      consolidated_count: song.playCount,
      original_songIds: [song.songId],
      yearly_play_time: yearly_play_time.length > 0 ? yearly_play_time : undefined,
    }
  })

  songs.sort((a, b) => b.count - a.count)
  const consolidator = new Consolidator(new ConsolidationRulesManager())
  const consolidatedSongs = consolidator.consolidateSongs(songs)

  const updatedConsolidatedSongs = consolidatedSongs.map((consolidatedSong) => {
    let mostRecentSong: CompleteSongLike | null = null
    let mostRecentPlayTime = 0
    const allSongIds = [consolidatedSong.songId, ...consolidatedSong.original_songIds]
    for (const songId of allSongIds) {
      const completeSong = songIdToSong.get(songId)
      if (completeSong?.listeningEvents?.length) {
        const lastEvent = completeSong.listeningEvents[completeSong.listeningEvents.length - 1]
        const t = new Date(lastEvent.playedAt).getTime()
        if (t > mostRecentPlayTime) {
          mostRecentPlayTime = t
          mostRecentSong = completeSong
        }
      }
    }
    if (mostRecentSong && mostRecentSong.songId !== consolidatedSong.songId) {
      return {
        ...consolidatedSong,
        songId: mostRecentSong.songId,
        song: {
          name: mostRecentSong.name,
          preview_url: mostRecentSong.preview_url,
          external_urls: mostRecentSong.external_urls,
        },
        album: {
          name: mostRecentSong.album.name,
          images: mostRecentSong.album.images ?? [],
        },
        artist: {
          name: mostRecentSong.artist.name,
          genres: mostRecentSong.artist.genres ?? [],
          ...(mostRecentSong.artist.images?.length && { images: mostRecentSong.artist.images }),
        },
      }
    }
    return consolidatedSong
  })

  const songs30DaysAgo = updatedConsolidatedSongs
    .map((s) => ({ ...s, count: s.count_30_days_ago ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_SONGS_LIMIT)
  const rankMap30DaysAgo = new Map<string, number>()
  songs30DaysAgo.forEach((song, index) => {
    rankMap30DaysAgo.set(song.songId, index + 1)
    song.original_songIds.forEach((id) => rankMap30DaysAgo.set(id, index + 1))
  })

  const topSongs = updatedConsolidatedSongs.slice(0, TOP_SONGS_LIMIT).map((song, index) => {
    let rank_30_days_ago: number | undefined = rankMap30DaysAgo.get(song.songId)
    if (rank_30_days_ago === undefined) {
      for (const id of song.original_songIds) {
        if (rankMap30DaysAgo.has(id)) {
          rank_30_days_ago = rankMap30DaysAgo.get(id)
          break
        }
      }
    }
    return {
      ...song,
      rank: index + 1,
      rank_30_days_ago,
    }
  })

  return {
    songs: topSongs,
    originalCount: songs.length,
    consolidatedCount: updatedConsolidatedSongs.length,
  }
}
