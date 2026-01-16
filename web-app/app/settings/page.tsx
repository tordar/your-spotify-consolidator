'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import SpotifyStatsLayout from '@/components/SpotifyStatsLayout'
import { Clock, CheckCircle2, XCircle, Loader2, ExternalLink } from 'lucide-react'

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

  useEffect(() => {
    fetchSyncStatus()
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
      </div>
    </SpotifyStatsLayout>
  )
}

