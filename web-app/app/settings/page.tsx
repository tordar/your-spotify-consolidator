'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import SpotifyStatsLayout from '@/components/SpotifyStatsLayout'
import { Clock, CheckCircle2, XCircle, Loader2, ExternalLink, Music2, Trash2, FileJson, Key, Github, Zap, Cloud, ChevronDown, ChevronUp, Upload } from 'lucide-react'

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

  const [uploadSecret, setUploadSecret] = useState('')
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{
    uploaded: string[]
    rejected: Array<{ name: string; reason: string }>
    message?: string
    error?: string
    notConfigured?: boolean
  } | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const isValidUploadFilename = (name: string) =>
    name.startsWith('Streaming_History_Audio_') && name.endsWith('.json')

  // Vercel serverless request body limit ~4.5 MB; compress large files so payload stays under
  const COMPRESS_THRESHOLD_BYTES = 3.5 * 1024 * 1024

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    const chunkSize = 8192
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }
    return btoa(binary)
  }

  const gzipFile = async (file: File): Promise<ArrayBuffer> => {
    const stream = file.stream().pipeThrough(new CompressionStream('gzip'))
    return await new Response(stream).arrayBuffer()
  }

  const onUploadFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => isValidUploadFilename(f.name))
    setUploadFiles((prev) => [...prev, ...files])
    setUploadResult(null)
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      isValidUploadFilename(f.name)
    )
    setUploadFiles((prev) => [...prev, ...files])
    setUploadResult(null)
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const onDragLeave = () => setDragOver(false)

  const removeUploadFile = (index: number) => {
    setUploadFiles((prev) => prev.filter((_, i) => i !== index))
    setUploadResult(null)
  }

  const FILES_PER_REQUEST = 3

  const buildFormDataForChunk = async (
    chunk: File[]
  ): Promise<FormData> => {
    const formData = new FormData()
    const useCompression = chunk.some((f) => f.size >= COMPRESS_THRESHOLD_BYTES)
    if (useCompression) {
      for (const file of chunk) {
        if (!isValidUploadFilename(file.name)) continue
        const compressed = await gzipFile(file)
        formData.append('compressed', arrayBufferToBase64(compressed))
        formData.append('filename', file.name)
      }
    } else {
      chunk.forEach((f) => formData.append('files', f))
    }
    return formData
  }

  const submitUpload = async () => {
    if (uploadFiles.length === 0 || !uploadSecret.trim()) return
    setUploading(true)
    setUploadResult(null)
    const allUploaded: string[] = []
    const allRejected: Array<{ name: string; reason: string }> = []
    const secret = uploadSecret.trim()
    const headers = { 'X-Upload-Secret': secret }

    try {
      for (let i = 0; i < uploadFiles.length; i += FILES_PER_REQUEST) {
        const chunk = uploadFiles.slice(i, i + FILES_PER_REQUEST)
        let formData = await buildFormDataForChunk(chunk)
        let res = await fetch('/api/upload-history', {
          method: 'POST',
          body: formData,
          headers,
        })
        let data = await res.json()

        if (res.status === 413 && chunk.length > 1) {
          for (const file of chunk) {
            const singleFormData = await buildFormDataForChunk([file])
            res = await fetch('/api/upload-history', {
              method: 'POST',
              body: singleFormData,
              headers,
            })
            data = await res.json()
            if (res.ok) {
              allUploaded.push(...(data.uploaded || []))
              allRejected.push(...(data.rejected || []))
            } else {
              allRejected.push({
                name: file.name,
                reason: data.error || `Upload failed (${res.status})`,
              })
            }
          }
          continue
        }

        if (res.status === 401) {
          setUploadResult({
            uploaded: allUploaded,
            rejected: allRejected,
            error: data.error || 'Invalid upload secret.',
          })
          return
        }
        if (res.status === 501) {
          setUploadResult({
            uploaded: allUploaded,
            rejected: allRejected,
            error: data.error || 'Upload not configured.',
            notConfigured: true,
          })
          return
        }
        if (res.status === 413) {
          setUploadResult({
            uploaded: allUploaded,
            rejected: allRejected,
            error:
              chunk.length === 1
                ? 'Request too large even for a single file. Add the largest file(s) to the repo manually.'
                : 'Request too large. Retrying one file at a time failed.',
          })
          return
        }
        if (!res.ok) {
          setUploadResult({
            uploaded: allUploaded,
            rejected: allRejected,
            error: data.error || 'Upload failed.',
          })
          return
        }
        allUploaded.push(...(data.uploaded || []))
        allRejected.push(...(data.rejected || []))
      }

      setUploadResult({
        uploaded: allUploaded,
        rejected: allRejected,
        message:
          allUploaded.length > 0
            ? `Uploaded ${allUploaded.length} file(s) in ${Math.ceil(uploadFiles.length / FILES_PER_REQUEST)} commit(s).`
            : undefined,
      })
      if (allUploaded.length > 0) setUploadFiles([])
    } catch {
      setUploadResult({
        uploaded: allUploaded,
        rejected: allRejected,
        error: 'Failed to upload files.',
      })
    } finally {
      setUploading(false)
    }
  }

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
                    <FileJson className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                    1. Request your data from Spotify
                  </h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Request &quot;Extended streaming history&quot; from Spotify.
                  </p>
                  <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
                    <li>Go to <a href="https://www.spotify.com/account/privacy/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Spotify Privacy Settings <ExternalLink className="w-3 h-3" /></a>.</li>
                    <li>Under &quot;Download your data&quot;, click <strong>Request data</strong> and select <strong>Extended streaming history</strong>.</li>
                    <li>Wait for the email (can take a few days), download the ZIP, and extract it. You will upload the files in step 5.</li>
                  </ol>
                </section>

                <section>
                  <h3 className="flex items-center gap-2 font-semibold text-sm mb-2">
                    <Cloud className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                    2. Fork the repo and deploy to Vercel
                  </h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Get the app online first; you will add data and secrets next.
                  </p>
                  <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
                    <li><a href="https://github.com/tordar/spotify-pulse/fork" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Fork the repository <ExternalLink className="w-3 h-3" /></a>.</li>
                    <li>In <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Vercel <ExternalLink className="w-3 h-3" /></a>, <strong>Add New Project</strong> and import your forked GitHub repo.</li>
                    <li>Deploy. The app will be live but without data until you complete the remaining steps.</li>
                  </ol>
                </section>

                <section>
                  <h3 className="flex items-center gap-2 font-semibold text-sm mb-2">
                    <Key className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                    3. Set up your Spotify Developer application
                  </h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Create an app to get Client ID, Client Secret, and a refresh token for sync and metadata.
                  </p>
                  <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
                    <li>Create an app at <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Spotify Developer Dashboard <ExternalLink className="w-3 h-3" /></a>.</li>
                    <li>Note <strong>Client ID</strong> and <strong>Client Secret</strong>, and add this redirect URI in your app: <code className="text-foreground/80">http://127.0.0.1:3847/callback</code>.</li>
                    <li>Get a refresh token: run <code className="text-foreground/80 bg-muted px-1 rounded">npm run setup-spotify-auth</code> in the project root. A browser tab opens—enter your Client ID and Client Secret there, then authorize with Spotify. Tokens are saved automatically.</li>
                    <li>Use the printed values in the next step.</li>
                  </ol>
                </section>

                <section className="space-y-4">
                  <h3 className="flex items-center gap-2 font-semibold text-sm mb-2">
                    <Github className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                    4. Add secrets and enable GitHub Actions
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Add credentials in both GitHub (for Actions) and Vercel (for the app and in-app upload).
                  </p>

                  <div className="space-y-3 pl-1">
                    <p className="text-sm font-medium text-foreground">GitHub</p>
                    <p className="text-sm text-muted-foreground">
                      Repo → Settings → Secrets and variables → Actions. Add these repository secrets:
                    </p>
                    <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1.5">
                      <li><code className="text-foreground/80 bg-muted/70 px-1 rounded">SPOTIFY_CLIENT_ID</code></li>
                      <li><code className="text-foreground/80 bg-muted/70 px-1 rounded">SPOTIFY_CLIENT_SECRET</code></li>
                      <li><code className="text-foreground/80 bg-muted/70 px-1 rounded">SPOTIFY_REFRESH_TOKEN</code></li>
                      <li><code className="text-foreground/80 bg-muted/70 px-1 rounded">PERSONAL_ACCESS_TOKEN</code> (GitHub profile → Settings → Developer settings → Personal access tokens → Tokens (classic) - with repo scope)</li>
                    </ul>
                  </div>

                  <div className="space-y-3 pl-1">
                    <p className="text-sm font-medium text-foreground">Vercel</p>
                    <p className="text-sm text-muted-foreground">
                      Project → Settings → Environment Variables. Add these five:
                    </p>
                    <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1.5">
                      <li><code className="text-foreground/80 bg-muted/70 px-1 rounded">SPOTIFY_CLIENT_ID</code></li>
                      <li><code className="text-foreground/80 bg-muted/70 px-1 rounded">SPOTIFY_CLIENT_SECRET</code></li>
                      <li><code className="text-foreground/80 bg-muted/70 px-1 rounded">SPOTIFY_REFRESH_TOKEN</code></li>
                      <li><code className="text-foreground/80 bg-muted/70 px-1 rounded">GITHUB_TOKEN</code> (same GitHub PAT as above)</li>
                      <li><code className="text-foreground/80 bg-muted/70 px-1 rounded">UPLOAD_SECRET</code> (a secret only you know; you enter it in the upload form to authorize uploads)</li>
                    </ul>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    In the repo, open the <strong>Actions</strong> tab and ensure Actions are enabled.
                  </p>
                </section>

                <section>
                  <h3 className="flex items-center gap-2 font-semibold text-sm mb-2">
                    <Trash2 className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                    5. Upload your data in the app
                  </h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Use <strong>Upload streaming history</strong> below to select or drag your <code className="text-foreground/80">Streaming_History_Audio_*.json</code> files. They are uploaded to your repo and the <strong>Merge Streaming History</strong> workflow runs automatically. Alternatively, add the files to <code className="text-foreground/80">data/spotify-history/</code> in your repo and push manually.
                  </p>
                </section>
              </div>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload streaming history
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Add your <code className="text-foreground/80">Streaming_History_Audio_*.json</code> files here. They will be uploaded to your repo and the Merge Streaming History workflow will run automatically.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="upload-secret" className="text-sm font-medium">
                Upload secret
              </label>
              <input
                id="upload-secret"
                type="password"
                value={uploadSecret}
                onChange={(e) => {
                  setUploadSecret(e.target.value)
                  setUploadResult(null)
                }}
                placeholder="Upload secret"
                className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                autoComplete="off"
              />
            </div>
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
              }`}
            >
              <input
                type="file"
                accept=".json"
                multiple
                onChange={onUploadFileChange}
                className="hidden"
                id="upload-history-input"
              />
              <label
                htmlFor="upload-history-input"
                className="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
              >
                Choose files or drag and drop. Only <code className="text-foreground/80">Streaming_History_Audio_*.json</code> are accepted.
              </label>
            </div>
            {uploadFiles.length > 0 && (
              <ul className="space-y-1 text-sm">
                {uploadFiles.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2">
                    <span className="truncate text-muted-foreground">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removeUploadFile(i)}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                      aria-label={`Remove ${f.name}`}
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={submitUpload}
              disabled={uploadFiles.length === 0 || !uploadSecret.trim() || uploading}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>Upload {uploadFiles.length > 0 ? `${uploadFiles.length} file(s)` : 'files'}</>
              )}
            </button>
            {uploadResult && (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-2">
                {uploadResult.notConfigured && (
                  <p className="text-amber-600 dark:text-amber-500">
                    {uploadResult.error} Add <code className="bg-muted px-1 rounded">GITHUB_TOKEN</code>, <code className="bg-muted px-1 rounded">GITHUB_REPO_OWNER</code>, and <code className="bg-muted px-1 rounded">GITHUB_REPO_NAME</code> in Vercel project settings. Alternatively, add files to <code className="text-foreground/80">data/spotify-history/</code> in your repo and push manually.
                  </p>
                )}
                {uploadResult.error && !uploadResult.notConfigured && (
                  <p className="text-red-500">{uploadResult.error}</p>
                )}
                {uploadResult.uploaded.length > 0 && (
                  <p className="text-green-600 dark:text-green-500">
                    Uploaded: {uploadResult.uploaded.join(', ')}. {uploadResult.message}
                  </p>
                )}
                {uploadResult.rejected.length > 0 && (
                  <p className="text-muted-foreground">
                    Rejected: {uploadResult.rejected.map((r) => `${r.name} (${r.reason})`).join('; ')}
                  </p>
                )}
              </div>
            )}
          </CardContent>
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

