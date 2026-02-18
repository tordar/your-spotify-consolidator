'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import SpotifyStatsLayout from '@/components/SpotifyStatsLayout'
import { Clock, CheckCircle2, XCircle, Loader2, ExternalLink, Music2 } from 'lucide-react'

interface RecentPlayItem {
  track: {
    id: string
    name: string
    duration_ms: number
    artists: Array<{ id: string; name: string }>
    album: {
      id: string
      name: string
      images: Array<{ url: string; height: number | null; width: number | null }>
    }
    external_urls?: { spotify: string }
  }
  played_at: string
}

interface SyncStatus {
  timestamp: string | null
  status: string
  conclusion: string | null
  url: string
  name: string
  commit?: {
    sha: string
    message: string
    date: string
    url: string
    stats?: {
      additions: number
      deletions: number
      total: number
    }
  }
  job?: {
    status: string
    conclusion: string | null
    steps: Array<{
      name: string
      status: string
      conclusion: string | null
    }>
  }
}

export default function SettingsPage() {
  const [toggleEnabled, setToggleEnabled] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [recentTracks, setRecentTracks] = useState<RecentPlayItem[]>([])
  const [recentTracksLoading, setRecentTracksLoading] = useState(true)
  const [recentTracksError, setRecentTracksError] = useState<string | null>(null)

  useEffect(() => {
    fetchSyncStatus()
  }, [])

  useEffect(() => {
    const fetchRecentTracks = async () => {
      setRecentTracksLoading(true)
      setRecentTracksError(null)
      try {
        const res = await fetch('/api/spotify/recently-played?limit=50', { cache: 'no-store' })
        const data = await res.json()
        if (!res.ok) {
          setRecentTracksError(data.error || 'Failed to load recently played')
          setRecentTracks([])
          return
        }
        setRecentTracks(data.items || [])
      } catch {
        setRecentTracksError('Failed to load recently played')
        setRecentTracks([])
      } finally {
        setRecentTracksLoading(false)
      }
    }
    fetchRecentTracks()
  }, [])

  const handleToggle = () => {
    const newValue = !toggleEnabled
    setToggleEnabled(newValue)
    console.log(`Toggle is now: ${newValue ? 'ON' : 'OFF'}`)
  }

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return 'Never'
    
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
    
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusIcon = () => {
    if (loading) return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
    if (error || !syncStatus) return <XCircle className="w-4 h-4 text-muted-foreground" />
    if (syncStatus.conclusion === 'success') return <CheckCircle2 className="w-4 h-4 text-green-500" />
    if (syncStatus.conclusion === 'failure') return <XCircle className="w-4 h-4 text-red-500" />
    return <Clock className="w-4 h-4 text-yellow-500" />
  }

  const fetchSyncStatus = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sync-status', {
        cache: 'no-store', // Temporarily disable cache for testing
      })
      const data = await response.json()
      
      if (data.error) {
        setError(data.error)
      } else {
        setSyncStatus(data.lastSync)
      }
    } catch (err) {
      setError('Failed to load sync status')
      console.error('Error fetching sync status:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <SpotifyStatsLayout
      title="Settings"
      description="Customize your Spotify statistics experience"
      currentPage="settings"
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Data Sync Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading sync status...</span>
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 text-sm text-red-500">
                <XCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            ) : syncStatus ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon()}
                    <span className="text-sm font-medium">Last Sync</span>
                  </div>
                  {syncStatus.url && (
                    <a
                      href={syncStatus.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    >
                      View run
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <div className="pl-6 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {formatTimestamp(syncStatus.timestamp)}
                  </p>
                  {syncStatus.conclusion && (
                    <p className="text-xs text-muted-foreground">
                      Status: <span className="capitalize">{syncStatus.conclusion}</span>
                    </p>
                  )}
                  
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No sync information available
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music2 className="w-4 h-4" />
              Recently played tracks
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Last 50 played tracks from your Spotify account.
            </p>
          </CardHeader>
          <CardContent>
            {recentTracksLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading recently played...</span>
              </div>
            ) : recentTracksError ? (
              <p className="text-sm text-muted-foreground">{recentTracksError}</p>
            ) : recentTracks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recently played tracks to show.</p>
            ) : (
              <ul className="space-y-3 max-h-[400px] overflow-y-auto">
                {recentTracks.map((item) => {
                  const track = item.track
                  const artists = track.artists?.map((a) => a.name).join(', ') || ''
                  const img = track.album?.images?.[0]?.url
                  const playedAt = new Date(item.played_at).toLocaleString(undefined, {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })
                  return (
                    <li key={`${item.played_at}-${track.id}`} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                      {img && (
                        <img
                          src={img}
                          alt=""
                          className="w-10 h-10 rounded object-cover flex-shrink-0"
                          width={40}
                          height={40}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{track.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {artists}
                          {track.album?.name ? ` · ${track.album.name}` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground/80 mt-0.5">{playedAt}</p>
                      </div>
                      {track.external_urls?.spotify && (
                        <a
                          href={track.external_urls.spotify}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label="Open in Spotify"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </SpotifyStatsLayout>
  )
}

