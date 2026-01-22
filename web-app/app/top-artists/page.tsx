'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Play, Users, Clock, ExternalLink, ChevronDown, ChevronUp, Music } from 'lucide-react'
import Highcharts from 'highcharts'
import HighchartsReact from 'highcharts-react-official'
import SpotifyStatsLayout from '../../components/SpotifyStatsLayout'
import ViewToggle from '@/components/ViewToggle'
import FilterSortToggle, { SortOption } from '@/components/FilterSortToggle'
import RankingMovement from '@/components/RankingMovement'
import { useSpotifyStats } from '@/components/SpotifyStatsContext'
import { GridSkeleton, ListSkeleton } from '@/components/SkeletonLoader'
import { getYearsOfListeningHistory, type DetailedStats } from '@/lib/utils'

interface ArtistImage {
  height: number
  url: string
  width: number
}

interface Artist {
  name: string
  genres: string[]
  popularity: number
  followers: {
    total: number
  }
  images: ArtistImage[]
  external_urls: {
    spotify: string
  }
}

interface YearlyPlayTime {
  year: string
  totalListeningTimeMs: number
}

interface ArtistTopSong {
  songId: string
  name: string
  play_count: number
  total_listening_time_ms: number
  album: {
    name: string
    images: Array<{
      height: number
      url: string
      width: number
    }>
  }
}

interface ArtistTopAlbum {
  primaryAlbumId: string
  name: string
  play_count: number
  total_listening_time_ms: number
  images: Array<{
    height: number
    url: string
    width: number
  }>
  artists: string[]
}

interface ArtistData {
  duration_ms: number
  count: number
  differents: number
  primaryArtistId: string
  total_count: number
  total_duration_ms: number
  artist: Artist
  consolidated_count: number
  original_artistIds: (string | null)[]
  original_counts: number[]
  rank: number
  yearly_play_time?: YearlyPlayTime[]
  top_songs?: ArtistTopSong[]
  top_albums?: ArtistTopAlbum[]
  rank_30_days_ago?: number
  count_30_days_ago?: number
}

interface ArtistsData {
  metadata: {
    originalTotalArtists: number
    consolidatedTotalArtists: number
    duplicatesRemoved: number
    consolidationRate: number
    timestamp: string
  }
  artists: ArtistData[]
}

// Lazy loading image component for artists
const LazyArtistImage = ({ artist, rank, size = 'default' }: { artist: Artist; rank: number; size?: 'default' | 'mobile' }) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isInView, setIsInView] = useState(false)
  
  const imageUrl = artist.images?.[0]?.url
  
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
    
    const imgRef = document.getElementById(`artist-${rank}-${size}`)
    if (imgRef) {
      observer.observe(imgRef)
    }
    
    return () => observer.disconnect()
  }, [rank, size])
  
  return (
    <div 
      id={`artist-${rank}-${size}`}
      className={`relative bg-muted rounded-full overflow-hidden ${
        size === 'mobile' ? 'w-16 h-16' : 'aspect-square'
      }`}
    >
      {isInView && imageUrl ? (
        <Image
          src={imageUrl}
          alt={`${artist.name} artist image`}
          fill
          className={`object-cover transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setIsLoaded(true)}
          sizes={size === 'mobile' ? '64px' : "(max-width: 768px) 150px, (max-width: 1024px) 200px, 250px"}
        />
      ) : (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <Users className={`${size === 'mobile' ? 'w-6 h-6' : 'w-8 h-8'} text-muted-foreground`} />
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

export default function TopArtistsPage() {
  const [artistsData, setArtistsData] = useState<ArtistsData | null>(null)
  const [detailedStats, setDetailedStats] = useState<DetailedStats | null>(null)
  const { searchTerm, setSearchTerm, viewMode, setViewMode } = useSpotifyStats()
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortOption>('plays')
  const [showNewOnly, setShowNewOnly] = useState(false)
  const [selectedArtist, setSelectedArtist] = useState<ArtistData | null>(null)
  const [mounted, setMounted] = useState(false)
  const [yearlyPlayTimeExpanded, setYearlyPlayTimeExpanded] = useState(true)
  const [topSongsExpanded, setTopSongsExpanded] = useState(true)
  const [topAlbumsExpanded, setTopAlbumsExpanded] = useState(true)
  const yearlyChartRef = useRef<HighchartsReact.RefObject>(null)
  
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // Use a consistent viewMode for skeleton to avoid hydration mismatch
  // Always use 'grid' until mounted to match server render
  const skeletonViewMode = mounted ? viewMode : 'grid'
  
  // Reset expanded state when artist changes
  useEffect(() => {
    if (selectedArtist) {
      setYearlyPlayTimeExpanded(true)
      setTopSongsExpanded(true)
      setTopAlbumsExpanded(true)
    }
  }, [selectedArtist])
  
  useEffect(() => {
    const fetchArtists = async () => {
      try {
        const response = await fetch('/api/data/artists', {
          cache: 'no-cache' // Validate with server but allow short-term caching
        })
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.statusText}`)
        }
        const data = await response.json()
        setArtistsData(data)
      } catch (error) {
        console.error('Error fetching artists:', error)
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
    
    fetchArtists()
    fetchDetailedStats()
  }, [])
  
  // Helper function to get plays in past 30 days
  const getPlays30Days = (artist: ArtistData): number => {
    return artist.count - (artist.count_30_days_ago || 0)
  }

  // Helper function to check if artist is new in past 30 days
  const isNewInPast30Days = (artist: ArtistData): boolean => {
    // An item is "new" if it wasn't in the top 500, 30 days ago
    // rank_30_days_ago is undefined if the item wasn't ranked 30 days ago
    return artist.rank_30_days_ago === undefined && artist.count > 0
  }

  const filteredArtists = artistsData?.artists.filter(artist => {
    // Search filter
    const matchesSearch = artist.artist.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      artist.artist.genres?.some(genre => genre.toLowerCase().includes(searchTerm.toLowerCase()))
    
    // New filter
    const matchesNewFilter = !showNewOnly || isNewInPast30Days(artist)
    
    return matchesSearch && matchesNewFilter
  }) || []
  
  // Sort filtered artists based on selected sort option
  const sortedArtists = [...filteredArtists].sort((a, b) => {
    switch (sortBy) {
      case 'duration':
        return (b.total_duration_ms || 0) - (a.total_duration_ms || 0)
      case 'songs':
        return b.differents - a.differents
      case 'plays_30_days':
        return getPlays30Days(b) - getPlays30Days(a)
      case 'plays':
      default:
        return b.count - a.count
    }
  })
  
  const handleArtistClick = (artist: ArtistData) => {
    setSelectedArtist(artist)
  }
  
  // Prepare chart options for yearly play time
  const getYearlyPlayTimeChartOptions = (): Highcharts.Options => {
    if (!selectedArtist?.yearly_play_time || selectedArtist.yearly_play_time.length === 0) {
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

    const categories = selectedArtist.yearly_play_time.map(item => item.year)
    const data = selectedArtist.yearly_play_time.map(item => {
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
      title="My Top Artists"
      description={loading ? 'Loading...' : (() => {
        const years = getYearsOfListeningHistory(detailedStats)
        return `From ${artistsData?.metadata.consolidatedTotalArtists} different artists across ${years} ${years === 1 ? 'year' : 'years'} of listening history`
      })()}
      currentPage="artists"
      additionalControls={
        <div className="flex items-center gap-2">
          <ViewToggle viewMode={mounted ? viewMode : 'grid'} onViewModeChange={setViewMode} showChart={false} />
          <FilterSortToggle
            sortBy={sortBy}
            onSortChange={setSortBy}
            showNewOnly={showNewOnly}
            onFilterToggle={setShowNewOnly}
            sortOptions={[
              { value: 'plays', label: 'Total Plays' },
              { value: 'plays_30_days', label: 'Plays (30d)' },
              { value: 'duration', label: 'Total Duration' },
              { value: 'songs', label: 'Different Songs' },
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
          {/* Artists Display */}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {sortedArtists.map((artist) => (
              <Card 
                key={artist.primaryArtistId} 
                className="group backdrop-blur-md bg-card/70 border-white/10 shadow-md hover:shadow-xl hover:bg-card/85 hover:border-white/20 transition-all duration-200 cursor-pointer"
                onClick={() => handleArtistClick(artist)}
              >
                <CardContent className="p-3">
                  {/* Artist Image */}
                  <div className="mb-3">
                    <LazyArtistImage artist={artist.artist} rank={artist.rank} />
                  </div>
                  
                  {/* Artist Info */}
                  <div className="space-y-2">
                    {/* Rank Badge */}
                    <div className="flex flex-col gap-1 items-start">
                      <RankingMovement
                        currentRank={artist.rank}
                        rank30DaysAgo={artist.rank_30_days_ago}
                        currentCount={artist.count}
                        count30DaysAgo={artist.count_30_days_ago}
                        size="sm"
                        type="rank"
                      />
                      <RankingMovement
                        currentRank={artist.rank}
                        rank30DaysAgo={artist.rank_30_days_ago}
                        currentCount={artist.count}
                        count30DaysAgo={artist.count_30_days_ago}
                        size="sm"
                        type="playCount"
                      />
                    </div>
                    
                    {/* Artist Name */}
                    <h3 className="font-semibold text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                      {artist.artist.name}
                    </h3>
                    
                    {/* Different Songs */}
                    <p className="text-xs text-muted-foreground">
                      {artist.differents} songs
                    </p>
                    
                    {/* Duration */}
                    <p className="text-xs text-muted-foreground">
                      {(() => {
                        const duration = artist.total_duration_ms || 0
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
              <div className="col-span-5">Artist</div>
              <div className="col-span-1">Plays</div>
              <div className="col-span-1">Songs</div>
              <div className="col-span-3">Duration</div>
            </div>
            
            {sortedArtists.map((artist) => (
              <Card 
                key={artist.primaryArtistId} 
                className="group backdrop-blur-md bg-card/70 border-white/10 shadow-md hover:shadow-xl hover:bg-card/85 hover:border-white/20 transition-all duration-200 cursor-pointer"
                onClick={() => handleArtistClick(artist)}
              >
                <CardContent className="p-3 md:p-2">
                  {/* Desktop Layout */}
                  <div className="hidden md:grid grid-cols-12 gap-2 items-center">
                    {/* Rank */}
                    <div className="col-span-1">
                      <RankingMovement
                        currentRank={artist.rank}
                        rank30DaysAgo={artist.rank_30_days_ago}
                        currentCount={artist.count}
                        count30DaysAgo={artist.count_30_days_ago}
                        size="sm"
                        type="rank"
                      />
                    </div>
                    
                    {/* Artist Image */}
                    <div className="col-span-1">
                      <div className="w-12 h-12 aspect-square">
                        <LazyArtistImage artist={artist.artist} rank={artist.rank} />
                      </div>
                    </div>
                    
                    {/* Artist Name */}
                    <div className="col-span-5 min-w-0">
                      <h3 className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors break-words">
                        {artist.artist.name}
                      </h3>
                    </div>
                    
                    {/* Play Count */}
                    <div className="col-span-1">
                      <RankingMovement
                        currentRank={artist.rank}
                        rank30DaysAgo={artist.rank_30_days_ago}
                        currentCount={artist.count}
                        count30DaysAgo={artist.count_30_days_ago}
                        size="sm"
                        type="playCount"
                      />
                    </div>
                    
                    {/* Different Songs */}
                    <div className="col-span-1">
                      <p className="text-sm text-muted-foreground">
                        {artist.differents}
                      </p>
                    </div>
                    
                    {/* Duration */}
                    <div className="col-span-3">
                      <p className="text-sm text-muted-foreground">
                        {(() => {
                          const totalMinutes = Math.floor(artist.total_duration_ms / 60000)
                          const hours = Math.floor(totalMinutes / 60)
                          const minutes = totalMinutes % 60
                          return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
                        })()}
                      </p>
                    </div>
                  </div>
                  
                  {/* Mobile Layout */}
                  <div className="md:hidden flex items-start gap-3">
                    {/* Artist Image */}
                    <div className="flex-shrink-0">
                      <LazyArtistImage artist={artist.artist} rank={artist.rank} size="mobile" />
                    </div>
                    
                    {/* Artist Info */}
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <RankingMovement
                            currentRank={artist.rank}
                            rank30DaysAgo={artist.rank_30_days_ago}
                            currentCount={artist.count}
                            count30DaysAgo={artist.count_30_days_ago}
                            size="sm"
                            type="rank"
                          />
                          <h3 className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors mt-1 break-words">
                            {artist.artist.name}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {artist.differents} songs
                          </p>
                        </div>
                        <div className="flex flex-col items-end ml-2 flex-shrink-0">
                          <RankingMovement
                            currentRank={artist.rank}
                            rank30DaysAgo={artist.rank_30_days_ago}
                            currentCount={artist.count}
                            count30DaysAgo={artist.count_30_days_ago}
                            size="sm"
                            type="playCount"
                          />
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {(() => {
                              const totalMinutes = Math.floor(artist.total_duration_ms / 60000)
                              const hours = Math.floor(totalMinutes / 60)
                              const minutes = totalMinutes % 60
                              return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
                            })()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        
          {sortedArtists.length === 0 && searchTerm && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No artists found matching &quot;{searchTerm}&quot;</p>
            </div>
          )}
        </>
      )}
      
      {/* Artist Details Modal */}
      <Dialog open={!!selectedArtist} onOpenChange={(open) => !open && setSelectedArtist(null)}>
        <DialogContent className="max-w-2xl p-4 sm:p-6 sm:max-h-[90vh] flex flex-col">
          {selectedArtist && (
            <div className="flex flex-col h-full min-h-0">
              <DialogHeader className="flex-shrink-0 pb-4">
                <div className="flex flex-col items-center gap-4 mb-2">
                  <div className="relative w-32 h-32 flex-shrink-0 rounded-full overflow-hidden bg-muted">
                    {selectedArtist.artist.images?.[0]?.url ? (
                      <Image
                        src={selectedArtist.artist.images[0].url}
                        alt={`${selectedArtist.artist.name} artist image`}
                        fill
                        className="object-cover"
                        sizes="128px"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-muted flex items-center justify-center">
                        <Users className="w-12 h-12 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-center w-full">
                    <DialogTitle className="text-xl sm:text-2xl font-bold mb-2">
                      {selectedArtist.artist.name}
                    </DialogTitle>
                    <div className="space-y-2">
                      {selectedArtist.artist.genres && selectedArtist.artist.genres.length > 0 && (
                        <div className="flex items-center justify-center gap-2 flex-wrap">
                          {selectedArtist.artist.genres.slice(0, 5).map((genre, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {genre}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-center gap-4 text-sm flex-wrap">
                        <div className="flex items-center gap-1">
                          <Play className="w-4 h-4" />
                          <span>{selectedArtist.total_count} plays</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Music className="w-4 h-4" />
                          <span>{selectedArtist.differents} songs</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          <span>{formatDuration(selectedArtist.total_duration_ms)}</span>
                        </div>
                      </div>
                      {selectedArtist.artist.external_urls?.spotify && (
                        <div className="flex justify-center">
                          <a
                            href={selectedArtist.artist.external_urls.spotify}
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
              <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
                {/* Yearly Play Time Section */}
                {selectedArtist.yearly_play_time && selectedArtist.yearly_play_time.length > 0 && (
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
                
                {/* Top Songs Section */}
                {selectedArtist.top_songs && selectedArtist.top_songs.length > 0 && (
                  <div className="border-t pt-4">
                    <button
                      onClick={() => setTopSongsExpanded(!topSongsExpanded)}
                      className="flex items-center justify-between w-full mb-3 hover:opacity-80 transition-opacity"
                    >
                      <h4 className="font-medium text-sm text-muted-foreground">
                        Top Songs ({selectedArtist.top_songs.length})
                      </h4>
                      {topSongsExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                    <div 
                      className={`transition-all duration-300 ease-in-out ${
                        topSongsExpanded ? 'opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
                      }`}
                    >
                      {topSongsExpanded && (
                        <div className="space-y-2">
                          {[...selectedArtist.top_songs]
                            .sort((a, b) => b.play_count - a.play_count)
                            .map((song, index) => (
                            <div
                              key={song.songId}
                              className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors min-w-0 w-full flex-shrink-0"
                            >
                              <div className="flex-shrink-0 w-6 text-xs text-muted-foreground text-center">
                                {index + 1}
                              </div>
                              
                              {/* Album Image */}
                              <div className="flex-shrink-0 w-12 h-12 rounded overflow-hidden bg-muted">
                                {song.album.images && song.album.images.length > 0 ? (
                                  <Image
                                    src={song.album.images[0].url}
                                    alt={`${song.album.name} album cover`}
                                    width={48}
                                    height={48}
                                    className="object-cover w-full h-full"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Music className="w-5 h-5 text-muted-foreground" />
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex-1 min-w-0 overflow-hidden">
                                <div className="flex items-center gap-2 min-w-0 w-full">
                                  <span className="font-medium text-sm truncate min-w-0 flex-1 whitespace-nowrap">{song.name}</span>
                                </div>
                                <div className="text-xs text-muted-foreground truncate whitespace-nowrap">
                                  {song.album.name}
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                                <div className="flex items-center gap-1 whitespace-nowrap">
                                  <Play className="w-3 h-3" />
                                  <span>{song.play_count}</span>
                                </div>
                                <div className="flex items-center gap-1 whitespace-nowrap">
                                  <Clock className="w-3 h-3" />
                                  <span>{formatDuration(song.total_listening_time_ms)}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Top Albums Section */}
                {selectedArtist.top_albums && selectedArtist.top_albums.length > 0 && (
                  <div className="border-t pt-4">
                    <button
                      onClick={() => setTopAlbumsExpanded(!topAlbumsExpanded)}
                      className="flex items-center justify-between w-full mb-3 hover:opacity-80 transition-opacity"
                    >
                      <h4 className="font-medium text-sm text-muted-foreground">
                        Top Albums ({selectedArtist.top_albums.length})
                      </h4>
                      {topAlbumsExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                    <div 
                      className={`transition-all duration-300 ease-in-out ${
                        topAlbumsExpanded ? 'opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
                      }`}
                    >
                      {topAlbumsExpanded && (
                        <div className="space-y-2">
                          {[...selectedArtist.top_albums]
                            .sort((a, b) => b.play_count - a.play_count)
                            .map((album, index) => (
                            <div
                              key={album.primaryAlbumId}
                              className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors min-w-0 w-full flex-shrink-0"
                            >
                              <div className="flex-shrink-0 w-6 text-xs text-muted-foreground text-center">
                                {index + 1}
                              </div>
                              
                              {/* Album Image */}
                              <div className="flex-shrink-0 w-12 h-12 rounded overflow-hidden bg-muted">
                                {album.images && album.images.length > 0 ? (
                                  <Image
                                    src={album.images[0].url}
                                    alt={`${album.name} album cover`}
                                    width={48}
                                    height={48}
                                    className="object-cover w-full h-full"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Music className="w-5 h-5 text-muted-foreground" />
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex-1 min-w-0 overflow-hidden">
                                <div className="flex items-center gap-2 min-w-0 w-full">
                                  <span className="font-medium text-sm truncate min-w-0 flex-1 whitespace-nowrap">{album.name}</span>
                                </div>
                                <div className="text-xs text-muted-foreground truncate whitespace-nowrap">
                                  {album.artists.join(', ')}
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                                <div className="flex items-center gap-1 whitespace-nowrap">
                                  <Play className="w-3 h-3" />
                                  <span>{album.play_count}</span>
                                </div>
                                <div className="flex items-center gap-1 whitespace-nowrap">
                                  <Clock className="w-3 h-3" />
                                  <span>{formatDuration(album.total_listening_time_ms)}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
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
