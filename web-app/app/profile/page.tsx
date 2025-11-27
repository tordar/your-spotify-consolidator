'use client'

import { useState, useRef, useEffect } from 'react'
import { signOut, useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import SpotifyStatsLayout from '@/components/SpotifyStatsLayout'
import { Upload, FileJson, X, CheckCircle2, AlertCircle, LogOut, RefreshCw, Music } from 'lucide-react'

interface UploadFile {
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  progress: number
  error?: string
}

export default function ProfilePage() {
  const { data: session } = useSession()
  
  // Upload state
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Merge state
  const [isMerging, setIsMerging] = useState(false)
  const [mergeResult, setMergeResult] = useState<{ success: boolean; message?: string; data?: any } | null>(null)
  
  // Sync state
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ success: boolean; message?: string; data?: any } | null>(null)
  
  // Generate cleaned files state
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateResult, setGenerateResult] = useState<{ success: boolean; message?: string; data?: any } | null>(null)
  
  // Spotify connection state
  const [hasSpotify, setHasSpotify] = useState(false)
  const [isCheckingSpotify, setIsCheckingSpotify] = useState(true)

  // Check if Spotify is connected
  useEffect(() => {
    const checkSpotifyConnection = async () => {
      if (!session?.user?.id) {
        setIsCheckingSpotify(false)
        return
      }

      try {
        const response = await fetch('/api/spotify/status')
        if (response.ok) {
          const data = await response.json()
          setHasSpotify(data.connected)
        }
      } catch (error) {
        console.error('Error checking Spotify connection:', error)
      } finally {
        setIsCheckingSpotify(false)
      }
    }

    checkSpotifyConnection()
    
    // Check URL params for Spotify connection success
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('spotify') === 'connected') {
      // Refresh connection status
      setTimeout(() => {
        checkSpotifyConnection()
        // Clean up URL
        window.history.replaceState({}, '', '/profile')
      }, 1000)
    }
  }, [session])

  const handleConnectSpotify = async () => {
    // Let the API route handle authentication check
    // Direct navigation - the API route will check auth and redirect appropriately
    window.location.href = '/api/spotify/connect'
  }

  const handleDisconnectSpotify = async () => {
    try {
      const response = await fetch('/api/spotify/disconnect', {
        method: 'POST',
      })

      if (response.ok) {
        setHasSpotify(false)
      }
    } catch (error) {
      console.error('Error disconnecting Spotify:', error)
    }
  }

  // File upload handlers
  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return

    const newFiles: UploadFile[] = Array.from(files)
      .filter(file => {
        // Only accept JSON files that start with "Streaming_History"
        return file.name.endsWith('.json') && file.name.startsWith('Streaming_History')
      })
      .map(file => ({
        file,
        status: 'pending' as const,
        progress: 0,
      }))

    // Add files that don't match the pattern with error status
    const invalidFiles: UploadFile[] = Array.from(files)
      .filter(file => {
        const isValid = file.name.endsWith('.json') && file.name.startsWith('Streaming_History')
        return !isValid
      })
      .map(file => ({
        file,
        status: 'error' as const,
        progress: 0,
        error: file.name.endsWith('.json') 
          ? 'Filename must start with "Streaming_History"'
          : 'Only JSON files are allowed',
      }))

    setUploadFiles(prev => [...prev, ...newFiles, ...invalidFiles])
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    handleFileSelect(e.dataTransfer.files)
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files)
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const uploadFile = async (uploadFile: UploadFile) => {
    // Validate filename before uploading
    if (!uploadFile.file.name.startsWith('Streaming_History')) {
      setUploadFiles(prev =>
        prev.map(f =>
          f.file === uploadFile.file
            ? { ...f, status: 'error', error: 'Filename must start with "Streaming_History"' }
            : f
        )
      )
      return
    }

    const formData = new FormData()
    formData.append('file', uploadFile.file)
    formData.append('category', 'raw-history') // Always raw-history for manual uploads

    // Update status to uploading
    setUploadFiles(prev =>
      prev.map(f =>
        f.file === uploadFile.file
          ? { ...f, status: 'uploading', progress: 0 }
          : f
      )
    )

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      // Update status to success
      setUploadFiles(prev =>
        prev.map(f =>
          f.file === uploadFile.file
            ? { ...f, status: 'success', progress: 100 }
            : f
        )
      )
    } catch (error: any) {
      // Update status to error
      setUploadFiles(prev =>
        prev.map(f =>
          f.file === uploadFile.file
            ? { ...f, status: 'error', error: error.message }
            : f
        )
      )
    }
  }

  const removeFile = (file: File) => {
    setUploadFiles(prev => prev.filter(f => f.file !== file))
  }

  const startUploads = async () => {
    const pendingFiles = uploadFiles.filter(f => f.status === 'pending')
    
    // Upload files sequentially to avoid overwhelming the server
    for (const file of pendingFiles) {
      await uploadFile(file)
      // Small delay between uploads to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/auth/signin' })
  }

  const handleMergeHistory = async () => {
    setIsMerging(true)
    setMergeResult(null)

    try {
      const response = await fetch('/api/process/merge-history', {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Merge failed')
      }

      setMergeResult({
        success: true,
        message: data.message || 'Streaming history merged successfully!',
        data: data.data
      })
    } catch (error: any) {
      setMergeResult({
        success: false,
        message: error.message || 'Failed to merge streaming history'
      })
    } finally {
      setIsMerging(false)
    }
  }

  const handleSyncSpotify = async () => {
    setIsSyncing(true)
    setSyncResult(null)

    try {
      const response = await fetch('/api/process/sync-spotify', {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Sync failed')
      }

      setSyncResult({
        success: true,
        message: data.message || 'Spotify sync completed successfully!',
        data: data.data
      })
    } catch (error: any) {
      setSyncResult({
        success: false,
        message: error.message || 'Failed to sync Spotify data'
      })
    } finally {
      setIsSyncing(false)
    }
  }

  const handleGenerateCleanedFiles = async () => {
    setIsGenerating(true)
    setGenerateResult(null)

    try {
      const response = await fetch('/api/process/generate-cleaned-files', {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Generation failed')
      }

      setGenerateResult({
        success: true,
        message: data.message || 'Cleaned files generated successfully!',
        data: data.data
      })
    } catch (error: any) {
      setGenerateResult({
        success: false,
        message: error.message || 'Failed to generate cleaned files'
      })
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <SpotifyStatsLayout
      title="Profile"
      description="Manage your Spotify history files and account settings"
      currentPage="profile"
    >
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-2">
          <Button
            onClick={handleMergeHistory}
            disabled={isMerging || isSyncing || isGenerating}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isMerging ? 'animate-spin' : ''}`} />
            {isMerging ? 'Merging...' : 'Merge Streaming History'}
          </Button>
          <Button
            onClick={handleSyncSpotify}
            disabled={isMerging || isSyncing || isGenerating}
            variant="outline"
            className="gap-2"
          >
            <Music className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync Recent Plays'}
          </Button>
          <Button
            onClick={handleGenerateCleanedFiles}
            disabled={isMerging || isSyncing || isGenerating}
            variant="outline"
            className="gap-2"
          >
            <FileJson className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
            {isGenerating ? 'Generating...' : 'Generate Cleaned Files'}
          </Button>
        </div>
        <Button
          variant="outline"
          onClick={handleLogout}
          className="gap-2"
        >
          <LogOut className="w-4 h-4" />
          Log Out
        </Button>
      </div>

      {/* Generate Cleaned Files Result */}
      {generateResult && (
        <Card className={`mb-6 border-2 ${generateResult.success ? 'border-green-500' : 'border-destructive'}`}>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              {generateResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className={`font-medium ${generateResult.success ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}>
                  {generateResult.message}
                </p>
                {generateResult.success && generateResult.data && (
                  <div className="mt-3 text-sm text-muted-foreground space-y-1">
                    <p>• {generateResult.data.songs?.count || 0} cleaned songs ({generateResult.data.songs?.originalCount || 0} → {generateResult.data.songs?.consolidatedCount || 0} consolidated)</p>
                    <p>• {generateResult.data.artists?.count || 0} cleaned artists ({generateResult.data.artists?.originalCount || 0} → {generateResult.data.artists?.consolidatedCount || 0} consolidated)</p>
                    <p>• {generateResult.data.albums?.count || 0} cleaned albums ({generateResult.data.albums?.originalCount || 0} → {generateResult.data.albums?.count || 0} consolidated)</p>
                    <p>• {generateResult.data.stats?.totalListeningHours?.toLocaleString()} hours ({generateResult.data.stats?.totalListeningDays?.toLocaleString()} days) total listening time</p>
                    <p>• {generateResult.data.stats?.totalListeningEvents?.toLocaleString()} total listening events</p>
                    {generateResult.data.hasSpotifyEnrichment && (
                      <p className="text-green-600 dark:text-green-400">• Spotify metadata enrichment enabled</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sync Result */}
      {syncResult && (
        <Card className={`mb-6 border-2 ${syncResult.success ? 'border-green-500' : 'border-destructive'}`}>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              {syncResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className={`font-medium ${syncResult.success ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}>
                  {syncResult.message}
                </p>
                {syncResult.success && syncResult.data && (
                  <div className="mt-3 text-sm text-muted-foreground space-y-1">
                    <p>• {syncResult.data.newTracks || 0} new track(s) added</p>
                    <p>• {syncResult.data.totalPlayEvents?.toLocaleString()} total play events</p>
                    <p>• {syncResult.data.uniqueSongs?.toLocaleString()} unique songs</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Merge Result */}
      {mergeResult && (
        <Card className={`mb-6 border-2 ${mergeResult.success ? 'border-green-500' : 'border-destructive'}`}>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              {mergeResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className={`font-medium ${mergeResult.success ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}>
                  {mergeResult.message}
                </p>
                {mergeResult.success && mergeResult.data && (
                  <div className="mt-3 text-sm text-muted-foreground space-y-1">
                    <p>• {mergeResult.data.totalPlayEvents.toLocaleString()} total play events</p>
                    <p>• {mergeResult.data.uniqueSongs.toLocaleString()} unique songs</p>
                    <p>• Date range: {new Date(mergeResult.data.dateRange.earliest).toLocaleDateString()} to {new Date(mergeResult.data.dateRange.latest).toLocaleDateString()}</p>
                    <p>• {mergeResult.data.filesProcessed} file(s) processed</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Spotify Connection Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Spotify Connection</CardTitle>
        </CardHeader>
        <CardContent>
          {isCheckingSpotify ? (
            <p className="text-sm text-muted-foreground">Checking connection...</p>
          ) : hasSpotify ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <p className="text-sm font-medium">Spotify Connected</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnectSpotify}
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium mb-1">Connect your Spotify account</p>
                <p className="text-xs text-muted-foreground">
                  Connect to sync recent plays and access Spotify API features
                </p>
              </div>
              <Button
                onClick={handleConnectSpotify}
                className="gap-2"
              >
                <Music className="w-4 h-4" />
                Connect Spotify
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* File Upload Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Upload Spotify History Files</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drag and Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-muted-foreground/50'
            }`}
          >
            <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm font-medium mb-2">
              Drag and drop Spotify history files here, or click to select
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Files must be JSON and start with "Streaming_History"
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              Select Files
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              multiple
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>

          {/* File List */}
          {uploadFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium">
                    {uploadFiles.filter(f => f.status === 'pending').length} file(s) ready to upload
                  </p>
                  {uploadFiles.some(f => f.status === 'error') && (
                    <p className="text-xs text-destructive mt-1">
                      {uploadFiles.filter(f => f.status === 'error').length} file(s) failed to upload
                    </p>
                  )}
                </div>
                {uploadFiles.some(f => f.status === 'pending') && (
                  <Button onClick={startUploads} size="sm">
                    Upload All
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {uploadFiles.map((uploadFile, index) => (
                  <div
                    key={`${uploadFile.file.name}-${index}`}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                  >
                    <FileJson className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{uploadFile.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(uploadFile.file.size)}
                      </p>
                      {uploadFile.status === 'uploading' && (
                        <div className="mt-2 w-full bg-muted rounded-full h-1.5">
                          <div
                            className="bg-primary h-1.5 rounded-full transition-all"
                            style={{ width: `${uploadFile.progress}%` }}
                          />
                        </div>
                      )}
                      {uploadFile.status === 'error' && uploadFile.error && (
                        <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {uploadFile.error}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {uploadFile.status === 'success' && (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      )}
                      {uploadFile.status === 'error' && (
                        <AlertCircle className="w-5 h-5 text-destructive" />
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(uploadFile.file)}
                        className="h-8 w-8 p-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </SpotifyStatsLayout>
  )
}

