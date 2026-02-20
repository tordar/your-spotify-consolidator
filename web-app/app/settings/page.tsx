'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import SpotifyStatsLayout from '@/components/SpotifyStatsLayout'
import { Clock, CheckCircle2, XCircle, Loader2, ExternalLink, Music2, Trash2, FileJson, Key, Github, Zap, Cloud, ChevronDown, ChevronUp } from 'lucide-react'

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
  const [setupGuideOpen, setSetupGuideOpen] = useState(false)

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
      description="Customize your Spotify Pulse experience"
      currentPage="settings"
    >
      <div className="space-y-6">
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => setSetupGuideOpen((o) => !o)}>
            <div className="flex items-center justify-between">
              <CardTitle>Set up your own instance</CardTitle>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground p-1 -mr-1"
                aria-expanded={setupGuideOpen}
                onClick={(e) => {
                  e.stopPropagation()
                  setSetupGuideOpen((o) => !o)
                }}
              >
                {setupGuideOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Step-by-step guide to run your own Spotify Pulse with your data, tokens, and deployment.
            </p>
          </CardHeader>
          {setupGuideOpen && (
            <CardContent className="space-y-6 pt-0">
              <div className="space-y-6">
                <section>
                  <h3 className="flex items-center gap-2 font-semibold text-sm mb-2">
                    <Trash2 className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                    1. Fork the repo
                  </h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    <a href="https://github.com/tordar/spotify-pulse/fork" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Fork the repository <ExternalLink className="w-3 h-3" /></a> to your own GitHub account so you have your own copy to push to and deploy from. The template does not include any personal data—data paths are in .gitignore, so your fork will have empty <code className="text-foreground/80">data/spotify-history/</code>, <code className="text-foreground/80">data/merged-streaming-history/</code>, and <code className="text-foreground/80">data/cleaned-data/</code> folders. Add your own export in the next step.
                  </p>
                  <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                    <li>When adding your data files, use <code className="text-foreground/80 bg-muted px-1 rounded">git add -f data/spotify-history/</code> to force-add (those paths are gitignored so the template stays clean for others).</li>
                  </ul>
                </section>

                <section>
                  <h3 className="flex items-center gap-2 font-semibold text-sm mb-2">
                    <FileJson className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                    2. Export extended streaming history from Spotify
                  </h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Request &quot;Extended streaming history&quot; from Spotify and place the exported files in the repo.
                  </p>
                  <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
                    <li>Go to <a href="https://www.spotify.com/account/privacy/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Spotify Privacy Settings <ExternalLink className="w-3 h-3" /></a>.</li>
                    <li>Under &quot;Download your data&quot;, click <strong>Request data</strong> and select <strong>Extended streaming history</strong>.</li>
                    <li>Wait for the email (can take a few days), download the ZIP, and extract it.</li>
                    <li>Put all <code className="text-foreground/80">Streaming_History_Audio_*.json</code> files into <code className="text-foreground/80">data/spotify-history/</code>.</li>
                  </ol>
                </section>

                <section>
                  <h3 className="flex items-center gap-2 font-semibold text-sm mb-2">
                    <Key className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                    3. Set up your own Spotify Developer application
                  </h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Create an app to get Client ID, Client Secret, and a refresh token for sync and metadata.
                  </p>
                  <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
                    <li>Create an app at <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Spotify Developer Dashboard <ExternalLink className="w-3 h-3" /></a>.</li>
                    <li>Note <strong>Client ID</strong> and <strong>Client Secret</strong>, and set a redirect URI (e.g. <code className="text-foreground/80">http://localhost:3000/callback</code> or <code className="text-foreground/80">https://example.com/callback</code>).</li>
                    <li>Get a refresh token: run <code className="text-foreground/80 bg-muted px-1 rounded">npm run setup-spotify-auth</code> in the project root; open the printed URL, authorize, then paste the <code className="text-foreground/80">code</code> from the redirect URL back into the script.</li>
                    <li>Use the printed values (and the script&apos;s <code className="text-foreground/80">.env.local</code> output) for the next step.</li>
                  </ol>
                </section>

                <section>
                  <h3 className="flex items-center gap-2 font-semibold text-sm mb-2">
                    <Github className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                    4. Add GitHub environment variables (secrets)
                  </h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Add repository secrets so GitHub Actions can sync and push.
                  </p>
                  <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1 mb-2">
                    <li>In the repo: <strong>Settings → Secrets and variables → Actions</strong>.</li>
                    <li>Add repository secrets:</li>
                  </ol>
                  <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1 mb-2">
                    <li><strong>Required:</strong> <code className="text-foreground/80">SPOTIFY_CLIENT_ID</code>, <code className="text-foreground/80">SPOTIFY_CLIENT_SECRET</code>, <code className="text-foreground/80">SPOTIFY_REFRESH_TOKEN</code> (from step 3).</li>
                    <li><strong>Required for sync workflow push:</strong> <code className="text-foreground/80">PERSONAL_ACCESS_TOKEN</code> (GitHub PAT with <code className="text-foreground/80">repo</code> scope).</li>
                    <li><strong>Optional:</strong> <code className="text-foreground/80">VERCEL_DEPLOY_HOOK</code> (trigger Vercel deploy after sync), <code className="text-foreground/80">BLOB_READ_WRITE_TOKEN</code> (if using blob upload in generate step).</li>
                  </ul>
                  <p className="text-sm text-muted-foreground">
                    Without <code className="text-foreground/80">PERSONAL_ACCESS_TOKEN</code>, the sync workflow cannot push; without Spotify secrets, sync and metadata enrichment will not work.
                  </p>
                </section>

                <section>
                  <h3 className="flex items-center gap-2 font-semibold text-sm mb-2">
                    <Zap className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                    5. Set up GitHub Actions
                  </h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Workflows are already in the repo; you only need to enable and understand them.
                  </p>
                  <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
                    <li><strong>Actions</strong> tab → ensure Actions are enabled for the repo.</li>
                    <li><strong>Initial merge:</strong> Pushing your <code className="text-foreground/80">Streaming_History_Audio_*.json</code> files to <code className="text-foreground/80">data/spotify-history/</code> triggers <strong>Merge Streaming History</strong>, which runs merge + generate + add-podcast-data and commits merged/cleaned data (Spotify secrets must be set for metadata).</li>
                    <li><strong>Ongoing sync:</strong> <strong>Spotify Data Sync</strong> runs every 2 hours and on manual &quot;Trigger sync&quot;; it fetches recent plays, merges, regenerates cleaned data, commits and pushes, and optionally triggers Vercel via <code className="text-foreground/80">VERCEL_DEPLOY_HOOK</code>.</li>
                  </ol>
                </section>

                <section>
                  <h3 className="flex items-center gap-2 font-semibold text-sm mb-2">
                    <Cloud className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                    6. Deploy your app to Vercel
                  </h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Deploy the app so the dashboard is available online; data is read from the repo (cleaned data committed by Actions).
                  </p>
                  <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
                    <li>In <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Vercel <ExternalLink className="w-3 h-3" /></a>, <strong>Add New Project</strong> and import the GitHub repository.</li>
                    <li><strong>Root Directory:</strong> Use the <strong>repository root</strong> (not <code className="text-foreground/80">web-app</code>), so the build and runtime can see <code className="text-foreground/80">data/</code>.</li>
                    <li><strong>Environment variables</strong> (in Vercel project settings): <strong>Required for Spotify:</strong> <code className="text-foreground/80">SPOTIFY_CLIENT_ID</code>, <code className="text-foreground/80">SPOTIFY_CLIENT_SECRET</code>, <code className="text-foreground/80">SPOTIFY_REFRESH_TOKEN</code>. <strong>Optional (Settings page):</strong> <code className="text-foreground/80">GITHUB_TOKEN</code>, <code className="text-foreground/80">GITHUB_REPO_OWNER</code>, <code className="text-foreground/80">GITHUB_REPO_NAME</code> for &quot;Trigger sync&quot; and sync status.</li>
                    <li>Deploy. To have each sync update the live site, add the <strong>Vercel Deploy Hook</strong> URL as the <code className="text-foreground/80">VERCEL_DEPLOY_HOOK</code> repository secret (see step 4).</li>
                  </ol>
                </section>
              </div>
            </CardContent>
          )}
        </Card>

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

