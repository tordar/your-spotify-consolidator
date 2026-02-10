/**
 * Song consolidation for streaming history aggregation.
 * Loads rules from repo scripts/cleaner/utils/album-consolidation-rules.json.
 */

import * as fs from 'fs'
import * as path from 'path'
import type { CleanedSong, AlbumWithSongs, AlbumSong, CleanedArtist, ArtistTopSong, ArtistTopAlbum } from './streaming-history-types'

interface ConsolidationRule {
  artistName: string
  baseAlbumName: string
  variations: string[]
}
interface ConsolidationRules {
  rules: ConsolidationRule[]
}

function normalizeDashes(text: string): string {
  return text
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '-')
    .replace(/\u2015/g, '-')
    .replace(/\u2212/g, '-')
    .replace(/\uFE63/g, '-')
    .replace(/\uFF0D/g, '-')
}

function getRulesPath(): string {
  const fromWebApp = path.join(process.cwd(), '..', 'scripts', 'cleaner', 'utils', 'album-consolidation-rules.json')
  const fromRepoRoot = path.join(process.cwd(), 'scripts', 'cleaner', 'utils', 'album-consolidation-rules.json')
  if (fs.existsSync(fromWebApp)) return fromWebApp
  if (fs.existsSync(fromRepoRoot)) return fromRepoRoot
  return fromWebApp
}

export class ConsolidationRulesManager {
  private consolidationRules: Map<string, string> | null = null
  private consolidationRulesData: ConsolidationRules | null = null

  loadConsolidationRules(): Map<string, string> {
    if (this.consolidationRules) return this.consolidationRules
    const rulesMap = new Map<string, string>()
    try {
      const rulesPath = getRulesPath()
      if (fs.existsSync(rulesPath)) {
        const rulesData = JSON.parse(fs.readFileSync(rulesPath, 'utf8')) as ConsolidationRules
        this.consolidationRulesData = rulesData
        rulesData.rules.forEach((rule: ConsolidationRule) => {
          const artistKey = normalizeDashes(rule.artistName.toLowerCase().trim())
          const baseAlbumName = normalizeDashes(rule.baseAlbumName.toLowerCase().trim())
          rule.variations.forEach((variation: string) => {
            const variationKey = normalizeDashes(variation.toLowerCase().trim())
            rulesMap.set(`${artistKey}|${variationKey}`, baseAlbumName)
          })
          rulesMap.set(`${artistKey}|${baseAlbumName}`, baseAlbumName)
        })
      }
    } catch (e) {
      console.error('Failed to load consolidation rules:', e)
    }
    this.consolidationRules = rulesMap
    return rulesMap
  }

  normalizeAlbumName(albumName: string, artistName: string): string {
    const rules = this.loadConsolidationRules()
    const normalizedAlbumName = normalizeDashes(albumName.toLowerCase().trim())
    const normalizedArtistName = normalizeDashes(artistName.toLowerCase().trim())
    const key = `${normalizedArtistName}|${normalizedAlbumName}`
    return rules.get(key) ?? normalizedAlbumName
  }

  getBaseAlbumName(albumName: string, artistName: string): string | null {
    if (!this.consolidationRulesData) return null
    const normalized = this.normalizeAlbumName(albumName, artistName)
    const normalizedArtistName = normalizeDashes(artistName.toLowerCase().trim())
    const normalizedBaseAlbumName = normalizeDashes(normalized)
    const rule = this.consolidationRulesData.rules.find(
      (r: ConsolidationRule) =>
        normalizeDashes(r.artistName.toLowerCase().trim()) === normalizedArtistName &&
        normalizeDashes(r.baseAlbumName.toLowerCase().trim()) === normalizedBaseAlbumName
    )
    return rule ? rule.baseAlbumName : null
  }
}

export class Consolidator {
  constructor(private rulesManager: ConsolidationRulesManager) {}

  normalizeAlbumNameForGrouping(albumName: string, artistName: string): string {
    return this.rulesManager.normalizeAlbumName(albumName, artistName)
  }

  getBaseAlbumNameForGrouping(albumName: string, artistName: string): string | null {
    return this.rulesManager.getBaseAlbumName(albumName, artistName)
  }

  consolidateSongs(songs: CleanedSong[]): CleanedSong[] {
    const consolidationMap = new Map<string, CleanedSong>()
    songs.forEach((song) => {
      const key = `${song.song.name.toLowerCase().trim()}|${song.artist.name.toLowerCase().trim()}`
      if (consolidationMap.has(key)) {
        const existing = consolidationMap.get(key)!
        existing.count += song.count
        existing.consolidated_count += song.count
        existing.duration_ms += song.duration_ms
        existing.original_songIds.push(song.songId)
        existing.count_30_days_ago = (existing.count_30_days_ago ?? 0) + (song.count_30_days_ago ?? 0)
        if (song.yearly_play_time?.length) {
          const yearlyMap = new Map<string, number>()
          existing.yearly_play_time?.forEach((y) => yearlyMap.set(y.year, y.totalListeningTimeMs))
          song.yearly_play_time.forEach((y) =>
            yearlyMap.set(y.year, (yearlyMap.get(y.year) ?? 0) + y.totalListeningTimeMs)
          )
          existing.yearly_play_time = Array.from(yearlyMap.entries())
            .map(([year, totalListeningTimeMs]) => ({ year, totalListeningTimeMs }))
            .sort((a, b) => a.year.localeCompare(b.year))
        } else if (song.yearly_play_time) existing.yearly_play_time = song.yearly_play_time
        return
      }
      const finalSong: CleanedSong = { ...song, consolidated_count: song.count }
      const base = this.rulesManager.getBaseAlbumName(song.album.name, song.artist.name)
      if (base) finalSong.album = { ...finalSong.album, name: base }
      consolidationMap.set(key, finalSong)
    })
    return Array.from(consolidationMap.values()).sort((a, b) => b.count - a.count)
  }

  consolidateAlbumsWithSongs(albums: AlbumWithSongs[]): AlbumWithSongs[] {
    const consolidationMap = new Map<string, AlbumWithSongs>()
    albums.forEach((album) => {
      const firstArtist = album.album.artists[0] || 'Unknown Artist'
      const normalizedAlbumName = this.rulesManager.normalizeAlbumName(album.album.name, firstArtist)
      const key = `${normalizedAlbumName}|${firstArtist.toLowerCase().trim()}`
      if (consolidationMap.has(key)) {
        const existing = consolidationMap.get(key)!
        existing.count += album.count
        existing.total_duration_ms += album.total_duration_ms
        existing.consolidated_count += album.consolidated_count
        existing.original_albumIds.push(...album.original_albumIds)
        existing.count_30_days_ago = (existing.count_30_days_ago ?? 0) + (album.count_30_days_ago ?? 0)
        const songMap = new Map<string, AlbumSong>()
        existing.songs.forEach((s) => {
          const sk = `${s.name.toLowerCase().trim()}|${(s.artists?.join(', ') ?? '').toLowerCase()}`
          songMap.set(sk, { ...s })
        })
        album.songs.forEach((s) => {
          const sk = `${s.name.toLowerCase().trim()}|${(s.artists?.join(', ') ?? '').toLowerCase()}`
          if (songMap.has(sk)) {
            const ex = songMap.get(sk)!
            ex.play_count += s.play_count
            ex.total_listening_time_ms += s.total_listening_time_ms
          } else {
            songMap.set(sk, { ...s })
          }
        })
        existing.songs = Array.from(songMap.values()).sort((a, b) => b.play_count - a.play_count)
        existing.total_songs = existing.songs.length
        existing.played_songs = existing.songs.filter((s) => s.play_count > 0).length
        existing.unplayed_songs = existing.songs.length - existing.played_songs
        if (album.earliest_played_at && (!existing.earliest_played_at || album.earliest_played_at < existing.earliest_played_at)) {
          existing.earliest_played_at = album.earliest_played_at
        }
        if (album.yearly_play_time?.length) {
          const yMap = new Map<string, number>()
          existing.yearly_play_time?.forEach((y) => yMap.set(y.year, y.totalListeningTimeMs))
          album.yearly_play_time.forEach((y) => yMap.set(y.year, (yMap.get(y.year) ?? 0) + y.totalListeningTimeMs))
          existing.yearly_play_time = Array.from(yMap.entries())
            .map(([year, totalListeningTimeMs]) => ({ year, totalListeningTimeMs }))
            .sort((a, b) => a.year.localeCompare(b.year))
        } else if (album.yearly_play_time) existing.yearly_play_time = album.yearly_play_time
        if (album.album.release_date && (!existing.album.release_date || new Date(album.album.release_date).getTime() < new Date(existing.album.release_date).getTime())) {
          existing.album.release_date = album.album.release_date
          existing.album.release_date_precision = album.album.release_date_precision || existing.album.release_date_precision
        }
        const baseName = this.rulesManager.getBaseAlbumName(album.album.name, firstArtist)
        if (baseName) existing.album.name = baseName
        if (album.album.images?.length && !existing.album.images?.length) existing.album.images = album.album.images
        return
      }
      const finalAlbum: AlbumWithSongs = { ...album }
      const base = this.rulesManager.getBaseAlbumName(album.album.name, firstArtist)
      if (base) finalAlbum.album = { ...finalAlbum.album, name: base }
      finalAlbum.songs = [...finalAlbum.songs].sort((a, b) => b.play_count - a.play_count)
      consolidationMap.set(key, finalAlbum)
    })
    return Array.from(consolidationMap.values()).sort((a, b) => b.count - a.count)
  }

  consolidateArtists(artists: CleanedArtist[]): CleanedArtist[] {
    const consolidationMap = new Map<string, CleanedArtist>()
    artists.forEach((artist) => {
      const key = artist.artist.name.toLowerCase().trim()
      if (consolidationMap.has(key)) {
        const existing = consolidationMap.get(key)!
        existing.count += artist.count
        existing.total_count += artist.total_count
        existing.duration_ms += artist.duration_ms
        existing.total_duration_ms += artist.total_duration_ms
        existing.differents += artist.differents
        existing.consolidated_count += artist.count
        existing.original_artistIds.push(artist.primaryArtistId)
        existing.count_30_days_ago = (existing.count_30_days_ago ?? 0) + (artist.count_30_days_ago ?? 0)
        if (artist.artist.images?.length && !existing.artist.images?.length) {
          existing.artist.images = artist.artist.images
        }
        if (artist.artist.genres?.length && !existing.artist.genres?.length) {
          existing.artist.genres = artist.artist.genres
        }
        if (artist.yearly_play_time?.length) {
          const yearlyMap = new Map<string, number>()
          existing.yearly_play_time?.forEach((y) => yearlyMap.set(y.year, y.totalListeningTimeMs))
          artist.yearly_play_time.forEach((y) =>
            yearlyMap.set(y.year, (yearlyMap.get(y.year) ?? 0) + y.totalListeningTimeMs)
          )
          existing.yearly_play_time = Array.from(yearlyMap.entries())
            .map(([year, totalListeningTimeMs]) => ({ year, totalListeningTimeMs }))
            .sort((a, b) => a.year.localeCompare(b.year))
        } else if (artist.yearly_play_time) existing.yearly_play_time = artist.yearly_play_time
        if (artist.top_songs?.length) {
          const songMap = new Map<string, ArtistTopSong>()
          existing.top_songs?.forEach((s) => songMap.set(s.name.toLowerCase().trim(), { ...s }))
          artist.top_songs.forEach((s) => {
            const sk = s.name.toLowerCase().trim()
            if (songMap.has(sk)) {
              const ex = songMap.get(sk)!
              ex.play_count += s.play_count
              ex.total_listening_time_ms += s.total_listening_time_ms
              if (s.album.images?.length && !ex.album.images?.length) ex.album.images = s.album.images
            } else songMap.set(sk, { ...s })
          })
          existing.top_songs = Array.from(songMap.values())
            .sort((a, b) => b.total_listening_time_ms - a.total_listening_time_ms)
            .slice(0, 5)
        } else if (artist.top_songs) existing.top_songs = artist.top_songs
        if (artist.top_albums?.length) {
          const artistName = existing.artist.name
          const albumMap = new Map<string, ArtistTopAlbum>()
          existing.top_albums?.forEach((a) => {
            const albumKey = this.rulesManager.normalizeAlbumName(a.name, artistName).toLowerCase()
            albumMap.set(albumKey, { ...a })
          })
          artist.top_albums.forEach((album) => {
            const albumKey = this.rulesManager.normalizeAlbumName(album.name, artistName).toLowerCase()
            if (albumMap.has(albumKey)) {
              const ex = albumMap.get(albumKey)!
              ex.play_count += album.play_count
              ex.total_listening_time_ms += album.total_listening_time_ms
              if (album.images?.length && !ex.images?.length) ex.images = album.images
              const base = this.rulesManager.getBaseAlbumName(album.name, artistName)
              if (base) ex.name = base
            } else {
              const base = this.rulesManager.getBaseAlbumName(album.name, artistName)
              albumMap.set(albumKey, { ...album, name: base ?? album.name })
            }
          })
          existing.top_albums = Array.from(albumMap.values())
            .sort((a, b) => b.total_listening_time_ms - a.total_listening_time_ms)
            .slice(0, 5)
        } else if (artist.top_albums) existing.top_albums = artist.top_albums
        return
      }
      consolidationMap.set(key, { ...artist, consolidated_count: artist.count })
    })
    return Array.from(consolidationMap.values()).sort((a, b) => b.count - a.count)
  }
}
