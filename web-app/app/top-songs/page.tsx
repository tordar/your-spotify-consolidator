'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Music, Play, Clock, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import Highcharts from 'highcharts'
import HighchartsReact from 'highcharts-react-official'
import SpotifyStatsLayout from '../../components/SpotifyStatsLayout'
import ViewToggle from '@/components/ViewToggle'
import FilterSortToggle, { SortOption } from '@/components/FilterSortToggle'
import RankingMovement from '@/components/RankingMovement'
import { useSpotifyStats } from '@/components/SpotifyStatsContext'
import { GridSkeleton, ListSkeleton } from '@/components/SkeletonLoader'
import { getYearsOfListeningHistory, type DetailedStats } from '@/lib/utils'

interface AlbumImage {
  height: number
  url: string
  width: number
}

interface Album {
  name: string
  images: AlbumImage[]
}

interface Artist {
  name: string
  genres: string[]
}

interface Song {
  name: string
  preview_url: string | null
  external_urls: Record<string, string>
}

interface YearlyPlayTime {
  year: string
  totalListeningTimeMs: number
}

interface SongData {
  duration_ms: number
  count: number
  songId: string
  song: Song
  album: Album
  artist: Artist
  consolidated_count: number
  original_songIds: string[]
  rank: number
  yearly_play_time?: YearlyPlayTime[]
  rank_30_days_ago?: number
  count_30_days_ago?: number
}

interface SongsData {
  metadata: {
    originalTotalSongs: number
    consolidatedTotalSongs: number
    duplicatesRemoved: number
    consolidationRate: number
    timestamp: string
  }
  songs: SongData[]
}

// Lazy loading image component for songs
const LazySongImage = ({ album, rank, size = 'default' }: { album: Album; rank: number; size?: 'default' | 'mobile' }) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isInView, setIsInView] = useState(false)
  
  const imageUrl = album.images?.[0]?.url
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )
    
    const imgRef = document.getElementById(`song-${rank}-${size}`)
    if (imgRef) {
      observer.observe(imgRef)
    }
    
    return () => observer.disconnect()
  }, [rank, size])
  
  return (
    <div 
      id={`song-${rank}-${size}`}
      className={`relative bg-muted rounded-lg overflow-hidden ${
        size === 'mobile' ? 'w-16 h-16' : 'aspect-square'
      }`}
    >
      {isInView && imageUrl ? (
        <Image
          src={imageUrl}
          alt={`${album.name} album cover`}
          fill
          className={`object-cover transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setIsLoaded(true)}
          sizes={size === 'mobile' ? '64px' : "(max-width: 768px) 150px, (max-width: 1024px) 200px, 250px"}
        />
      ) : (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <Music className={`${size === 'mobile' ? 'w-6 h-6' : 'w-8 h-8'} text-muted-foreground`} />
        </div>
      )}
    </div>
  )
}

// Format duration helper
const formatDuration = (durationMs: number) => {
  const duration = durationMs || 0
  const totalMinutes = Math.floor(duration / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

// Helper function to get computed CSS variable value
const getCSSVariable = (variable: string): string => {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim()
}

export default function TopSongsPage() {
  const [songsData, setSongsData] = useState<SongsData | null>(null)
  const [detailedStats, setDetailedStats] = useState<DetailedStats | null>(null)
  const { searchTerm, setSearchTerm, viewMode, setViewMode } = useSpotifyStats()
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortOption>('plays')
  const [showNewOnly, setShowNewOnly] = useState(false)
  const [selectedSong, setSelectedSong] = useState<SongData | null>(null)
  const [mounted, setMounted] = useState(false)
  const [yearlyPlayTimeExpanded, setYearlyPlayTimeExpanded] = useState(true)
  const yearlyChartRef = useRef<HighchartsReact.RefObject>(null)
  
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // Use a consistent viewMode for skeleton to avoid hydration mismatch
  // Always use 'grid' until mounted to match server render
  const skeletonViewMode = mounted ? viewMode : 'grid'
  
  // Reset expanded state when song changes
  useEffect(() => {
    if (selectedSong) {
      setYearlyPlayTimeExpanded(true)
    }
  }, [selectedSong])
  
  useEffect(() => {
    const fetchSongs = async () => {
      try {
        const response = await fetch('/api/data/songs', {
          cache: 'no-cache' // Validate with server but allow short-term caching
        })
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.statusText}`)
        }
        const data = await response.json()
        setSongsData(data)
      } catch (error) {
        console.error('Error fetching songs:', error)
      } finally {
        setLoading(false)
      }
    }
    
    const fetchDetailedStats = async () => {
      try {
        const response = await fetch('/api/data/stats', {
          cache: 'no-cache'
        })
        if (response.ok) {
          const data = await response.json()
          setDetailedStats(data)
        }
      } catch (error) {
        console.error('Error fetching detailed stats:', error)
      }
    }
    
    fetchSongs()
    fetchDetailedStats()
  }, [])
  
  // Helper function to get plays in past 30 days
  const getPlays30Days = (song: SongData): number => {
    return song.count - (song.count_30_days_ago || 0)
  }

  // Helper function to check if song is new in past 30 days
  const isNewInPast30Days = (song: SongData): boolean => {
    // An item is "new" if it wasn't in the top 500, 30 days ago
    // rank_30_days_ago is undefined if the item wasn't ranked 30 days ago
    return song.rank_30_days_ago === undefined && song.count > 0
  }

  const filteredSongs = songsData?.songs.filter(song => {
    // Search filter
    const matchesSearch = song.song.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.album.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.artist.name.toLowerCase().includes(searchTerm.toLowerCase())
    
    // New filter
    const matchesNewFilter = !showNewOnly || isNewInPast30Days(song)
    
    return matchesSearch && matchesNewFilter
  }) || []
  
  // Sort filtered songs based on selected sort option
  const sortedSongs = [...filteredSongs].sort((a, b) => {
    switch (sortBy) {
      case 'duration':
        return (b.duration_ms || 0) - (a.duration_ms || 0)
      case 'plays_30_days':
        return getPlays30Days(b) - getPlays30Days(a)
      case 'plays':
      default:
        return b.count - a.count
    }
  })
  
  const handleSongClick = (song: SongData) => {
    setSelectedSong(song)
  }
  
  // Prepare chart options for yearly play time
  const getYearlyPlayTimeChartOptions = (): Highcharts.Options => {
    if (!selectedSong?.yearly_play_time || selectedSong.yearly_play_time.length === 0) {
      return {
        chart: {
          type: 'column',
          height: 250
        },
        title: {
          text: 'No data available'
        }
      }
    }

    const categories = selectedSong.yearly_play_time.map(item => item.year)
    const data = selectedSong.yearly_play_time.map(item => {
      // Convert milliseconds to hours
      return Math.round((item.totalListeningTimeMs / (1000 * 60 * 60)) * 100) / 100
    })

    // Get theme colors
    const foreground = getCSSVariable('--foreground')
    const mutedForeground = getCSSVariable('--muted-foreground')
    const card = getCSSVariable('--card')
    const border = getCSSVariable('--border')
    const primary = getCSSVariable('--primary')
    
    const foregroundColor = foreground ? `rgb(${foreground})` : '#1f2937'
    const mutedColor = mutedForeground ? `rgb(${mutedForeground})` : '#6b7280'
    const cardColor = card ? `rgb(${card})` : '#ffffff'
    const borderColor = border ? `rgb(${border})` : '#e5e7eb'
    const primaryColor = primary ? `rgb(${primary})` : '#4f46e5'

    const chartHeight = 250

    return {
      chart: {
        type: 'column',
        backgroundColor: 'transparent',
        height: chartHeight,
        style: {
          fontFamily: 'inherit'
        },
        spacingLeft: 0,
        spacingRight: 0
      },
      title: {
        text: ''
      },
      xAxis: {
        categories: categories,
        title: {
          text: 'Year',
          style: {
            color: mutedColor
          }
        },
        labels: {
          style: {
            color: mutedColor
          }
        },
        lineColor: borderColor,
        tickColor: borderColor,
        minPadding: 0,
        maxPadding: 0
      },
      yAxis: {
        title: {
          text: 'Hours',
          style: {
            color: mutedColor
          }
        },
        labels: {
          style: {
            color: mutedColor
          }
        },
        gridLineColor: borderColor
      },
      legend: {
        enabled: false
      },
      tooltip: {
        backgroundColor: cardColor,
        borderColor: borderColor,
        style: {
          color: foregroundColor
        },
        formatter: function(this: Highcharts.Point) {
          const pointIndex = typeof this.x === 'number' ? this.x : (this.index ?? 0)
          const year = categories[pointIndex] || String(this.x)
          const hours = this.y || 0
          const totalHours = Math.floor(hours)
          const minutes = Math.floor((hours - totalHours) * 60)
          return `<b>${year}</b><br/>${totalHours > 0 ? `${totalHours}h ` : ''}${minutes}m`
        }
      },
      plotOptions: {
        column: {
          color: primaryColor,
          borderRadius: 4,
          dataLabels: {
            enabled: false
          },
          pointPadding: 0.1,
          groupPadding: 0.15
        }
      },
      series: [{
        name: 'Play Time',
        data: data,
        type: 'column'
      }],
      credits: {
        enabled: false
      }
    }
  }
  
  return (
    <SpotifyStatsLayout
      title="My Top Songs"
      description={loading ? 'Loading...' : (() => {
        const years = getYearsOfListeningHistory(detailedStats)
        return `From ${songsData?.metadata.consolidatedTotalSongs} different songs across ${years} ${years === 1 ? 'year' : 'years'} of listening history`
      })()}
      currentPage="songs"
      additionalControls={
        <div className="flex items-center gap-2">
          <ViewToggle viewMode={mounted ? viewMode : 'grid'} onViewModeChange={setViewMode} />
          <FilterSortToggle
            sortBy={sortBy}
            onSortChange={setSortBy}
            showNewOnly={showNewOnly}
            onFilterToggle={setShowNewOnly}
            sortOptions={[
              { value: 'plays', label: 'Total Plays' },
              { value: 'plays_30_days', label: 'Plays (30d)' },
              { value: 'duration', label: 'Total Duration' },
            ]}
          />
        </div>
      }
    >
      {loading ? (
        skeletonViewMode === 'grid' ? (
          <GridSkeleton count={12} />
        ) : (
          <ListSkeleton count={10} />
        )
      ) : (
        <>
          {/* Songs Display */}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {sortedSongs.map((song) => (
              <Card 
                key={song.songId} 
                className="group backdrop-blur-md bg-card/70 border-white/10 shadow-md hover:shadow-xl hover:bg-card/85 hover:border-white/20 transition-all duration-200 cursor-pointer"
                onClick={() => handleSongClick(song)}
              >
                <CardContent className="p-3">
                  {/* Album Image */}
                  <div className="mb-3">
                    <LazySongImage album={song.album} rank={song.rank} />
                  </div>
                  
                  {/* Song Info */}
                  <div className="space-y-2">
                    {/* Rank Badge */}
                    <div className="flex flex-col gap-1 items-start">
                      <RankingMovement
                        currentRank={song.rank}
                        rank30DaysAgo={song.rank_30_days_ago}
                        currentCount={song.count}
                        count30DaysAgo={song.count_30_days_ago}
                        size="sm"
                        type="rank"
                      />
                      <RankingMovement
                        currentRank={song.rank}
                        rank30DaysAgo={song.rank_30_days_ago}
                        currentCount={song.count}
                        count30DaysAgo={song.count_30_days_ago}
                        size="sm"
                        type="playCount"
                      />
                    </div>
                    
                    {/* Song Name */}
                    <h3 className="font-semibold text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                      {song.song.name}
                    </h3>
                    
                    {/* Artist Name */}
                    <button
                      onClick={() => setSearchTerm(song.artist.name)}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors line-clamp-1 text-left"
                    >
                      {song.artist.name}
                    </button>
                    
                    {/* Album Name */}
                    <button
                      onClick={() => setSearchTerm(song.album.name)}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors line-clamp-1 text-left"
                    >
                      {song.album.name}
                    </button>
                    
                    {/* Duration */}
                    <p className="text-xs text-muted-foreground">
                      {(() => {
                        const duration = song.duration_ms || 0
                        const totalMinutes = Math.floor(duration / 60000)
                        const hours = Math.floor(totalMinutes / 60)
                        const minutes = totalMinutes % 60
                        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
                      })()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {/* Header - Hidden on mobile */}
            <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-1 text-xs font-medium text-muted-foreground border-b">
              <div className="col-span-1">Rank</div>
              <div className="col-span-1"></div>
              <div className="col-span-3">Song</div>
              <div className="col-span-2">Artist</div>
              <div className="col-span-3">Album</div>
              <div className="col-span-1">Plays</div>
              <div className="col-span-1">Duration</div>
            </div>
            
            {sortedSongs.map((song) => (
              <Card 
                key={song.songId} 
                className="group backdrop-blur-md bg-card/70 border-white/10 shadow-md hover:shadow-xl hover:bg-card/85 hover:border-white/20 transition-all duration-200 cursor-pointer"
                onClick={() => handleSongClick(song)}
              >
                <CardContent className="p-3 md:p-2">
                  {/* Desktop Layout */}
                  <div className="hidden md:grid grid-cols-12 gap-2 items-center">
                    {/* Rank */}
                    <div className="col-span-1">
                      <RankingMovement
                        currentRank={song.rank}
                        rank30DaysAgo={song.rank_30_days_ago}
                        currentCount={song.count}
                        count30DaysAgo={song.count_30_days_ago}
                        size="sm"
                        type="rank"
                      />
                    </div>
                    
                    {/* Album Image */}
                    <div className="col-span-1">
                      <div className="w-12 h-12 aspect-square">
                        <LazySongImage album={song.album} rank={song.rank} />
                      </div>
                    </div>
                    
                    {/* Song Name */}
                    <div className="col-span-3 min-w-0">
                      <h3 className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors break-words">
                        {song.song.name}
                      </h3>
                    </div>
                    
                    {/* Artist Name */}
                    <div className="col-span-2 min-w-0">
                      <button
                        onClick={() => setSearchTerm(song.artist.name)}
                        className="text-sm text-muted-foreground hover:text-primary transition-colors text-left break-words"
                      >
                        {song.artist.name}
                      </button>
                    </div>
                    
                    {/* Album Name */}
                    <div className="col-span-3 min-w-0">
                      <button
                        onClick={() => setSearchTerm(song.album.name)}
                        className="text-sm text-muted-foreground hover:text-primary transition-colors line-clamp-1 text-left break-words"
                      >
                        {song.album.name}
                      </button>
                    </div>
                    
                    {/* Play Count */}
                    <div className="col-span-1">
                      <RankingMovement
                        currentRank={song.rank}
                        rank30DaysAgo={song.rank_30_days_ago}
                        currentCount={song.count}
                        count30DaysAgo={song.count_30_days_ago}
                        size="sm"
                        type="playCount"
                      />
                    </div>
                    
                    {/* Duration */}
                    <div className="col-span-1">
                      <p className="text-sm text-muted-foreground">
                        {(() => {
                          const totalMinutes = Math.floor(song.duration_ms / 60000)
                          const hours = Math.floor(totalMinutes / 60)
                          const minutes = totalMinutes % 60
                          return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
                        })()}
                      </p>
                    </div>
                  </div>
                  
                  {/* Mobile Layout */}
                  <div className="md:hidden flex items-center gap-3">
                    {/* Album Image */}
                    <div className="flex-shrink-0">
                      <LazySongImage album={song.album} rank={song.rank} size="mobile" />
                    </div>
                    
                    {/* Song Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <RankingMovement
                          currentRank={song.rank}
                          rank30DaysAgo={song.rank_30_days_ago}
                          currentCount={song.count}
                          count30DaysAgo={song.count_30_days_ago}
                          size="sm"
                          type="rank"
                        />
                        <RankingMovement
                          currentRank={song.rank}
                          rank30DaysAgo={song.rank_30_days_ago}
                          currentCount={song.count}
                          count30DaysAgo={song.count_30_days_ago}
                          size="sm"
                          type="playCount"
                        />
                      </div>
                      
                      <h3 className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors mb-1 break-words">
                        {song.song.name}
                      </h3>
                      
                      <button
                        onClick={() => setSearchTerm(song.artist.name)}
                        className="text-sm text-muted-foreground hover:text-primary transition-colors text-left mb-1 break-words"
                      >
                        {song.artist.name}
                      </button>
                      
                      <button
                        onClick={() => setSearchTerm(song.album.name)}
                        className="text-xs text-muted-foreground hover:text-primary transition-colors mb-1 line-clamp-1 text-left break-words"
                      >
                        {song.album.name}
                      </button>
                      
                      <p className="text-xs text-muted-foreground">
                        {(() => {
                          const totalMinutes = Math.floor(song.duration_ms / 60000)
                          const hours = Math.floor(totalMinutes / 60)
                          const minutes = totalMinutes % 60
                          return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
                        })()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        
          {sortedSongs.length === 0 && searchTerm && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No songs found matching &quot;{searchTerm}&quot;</p>
            </div>
          )}
        </>
      )}
      
      {/* Song Details Modal */}
      <Dialog open={!!selectedSong} onOpenChange={(open) => !open && setSelectedSong(null)}>
        <DialogContent className="max-w-2xl p-4 sm:p-6 sm:max-h-[90vh] flex flex-col">
          {selectedSong && (
            <div className="flex flex-col h-full min-h-0">
              <DialogHeader className="flex-shrink-0 pb-4">
                <div className="flex flex-col items-center gap-4 mb-2">
                  <div className="relative w-32 h-32 flex-shrink-0 rounded-lg overflow-hidden bg-muted">
                    {selectedSong.album.images?.[0]?.url ? (
                      <Image
                        src={selectedSong.album.images[0].url}
                        alt={`${selectedSong.album.name} album cover`}
                        fill
                        className="object-cover"
                        sizes="128px"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-muted flex items-center justify-center">
                        <Music className="w-12 h-12 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-center w-full">
                    <DialogTitle className="text-xl sm:text-2xl font-bold mb-2">
                      {selectedSong.song.name}
                    </DialogTitle>
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <span className="text-muted-foreground">
                          {selectedSong.artist.name}
                        </span>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-muted-foreground">
                          {selectedSong.album.name}
                        </span>
                      </div>
                      <div className="flex items-center justify-center gap-4 text-sm flex-wrap">
                        <div className="flex items-center gap-1">
                          <Play className="w-4 h-4" />
                          <span>{selectedSong.count} plays</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          <span>{formatDuration(selectedSong.duration_ms)}</span>
                        </div>
                      </div>
                      {selectedSong.song.external_urls?.spotify && (
                        <div className="flex justify-center">
                          <a
                            href={selectedSong.song.external_urls.spotify}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Open in Spotify
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </DialogHeader>
              
              {/* Scrollable Content Area */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {/* Yearly Play Time Section */}
                {selectedSong.yearly_play_time && selectedSong.yearly_play_time.length > 0 && (
                  <div className="border-t pt-4">
                    <button
                      onClick={() => setYearlyPlayTimeExpanded(!yearlyPlayTimeExpanded)}
                      className="flex items-center justify-between w-full mb-3 hover:opacity-80 transition-opacity"
                    >
                      <h4 className="font-medium text-sm text-muted-foreground">
                        Play Time by Year
                      </h4>
                      {yearlyPlayTimeExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                    <div 
                      className={`w-full -mx-2 sm:mx-0 overflow-hidden transition-all duration-300 ease-in-out ${
                        yearlyPlayTimeExpanded ? 'opacity-100' : 'max-h-0 opacity-0'
                      }`}
                    >
                      {mounted && yearlyPlayTimeExpanded && (
                        <HighchartsReact
                          highcharts={Highcharts}
                          options={getYearlyPlayTimeChartOptions()}
                          ref={yearlyChartRef}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SpotifyStatsLayout>
  )
}
