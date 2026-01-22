'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Music, Play, Disc, Clock, ExternalLink, Calendar, ChevronDown, ChevronUp } from 'lucide-react'
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

interface Song {
  songId: string
  name: string
  duration_ms: number
  track_number: number
  disc_number: number
  explicit: boolean
  preview_url: string | null
  external_urls: {
    spotify: string
  }
  play_count: number
  total_listening_time_ms: number
  artists: string[]
}

interface AlbumInfo {
  name: string
  album_type: string
  artists: string[]
  release_date: string
  release_date_precision: string
  popularity: number
  images: AlbumImage[]
  external_urls: {
    spotify: string
  }
  genres: string[]
}

interface YearlyPlayTime {
  year: string
  totalListeningTimeMs: number
}

interface AlbumData {
  duration_ms: number
  count: number
  differents: number
  primaryAlbumId: string
  total_count: number
  total_duration_ms: number
  album: AlbumInfo
  consolidated_count: number
  original_albumIds: string[]
  original_counts?: number[]
  rank: number
  total_songs?: number
  played_songs?: number
  unplayed_songs?: number
  songs?: Song[]
  earliest_played_at?: string
  yearly_play_time?: YearlyPlayTime[]
  rank_30_days_ago?: number
  count_30_days_ago?: number
}

interface AlbumsData {
  metadata: {
    originalTotalAlbums: number
    consolidatedTotalAlbums: number
    duplicatesRemoved: number
    consolidationRate: number
    timestamp: string
    source?: string
    totalListeningEvents?: number
  }
  albums: AlbumData[]
}

// Format duration helper
const formatDuration = (durationMs: number) => {
  const duration = durationMs || 0
  const totalMinutes = Math.floor(duration / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

// Format song duration helper
const formatSongDuration = (durationMs: number) => {
  const minutes = Math.floor(durationMs / 60000)
  const seconds = Math.floor((durationMs % 60000) / 1000)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// Format date helper
const formatDate = (dateString: string) => {
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    })
  } catch {
    return dateString
  }
}

// Helper function to get computed CSS variable value
const getCSSVariable = (variable: string): string => {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim()
}

// Lazy loading image component
const LazyAlbumImage = ({ album, rank, size = 'default' }: { album: AlbumInfo; rank: number; size?: 'default' | 'mobile' }) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isInView, setIsInView] = useState(false)
  
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
    
    const imgRef = document.getElementById(`album-${rank}-${size}`)
    if (imgRef) {
      observer.observe(imgRef)
    }
    
    return () => observer.disconnect()
  }, [rank, size])
  
  // Guard clause to prevent errors with invalid album data
  if (!album) {
    return (
      <div className={`relative bg-muted rounded-lg overflow-hidden ${
        size === 'mobile' ? 'w-16 h-16' : 'aspect-square'
      }`}>
        <div className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center">
          <Disc className={`${size === 'mobile' ? 'w-6 h-6' : 'w-8 h-8'} text-muted-foreground`} />
        </div>
      </div>
    )
  }
  
  const imageUrl = album.images?.[0]?.url
  
  return (
    <div 
      id={`album-${rank}-${size}`}
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

export default function TopAlbumsPage() {
  const [albumsData, setAlbumsData] = useState<AlbumsData | null>(null)
  const [detailedStats, setDetailedStats] = useState<DetailedStats | null>(null)
  const { searchTerm, setSearchTerm, viewMode, setViewMode } = useSpotifyStats()
  const [loading, setLoading] = useState(true)
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumData | null>(null)
  const [sortBy, setSortBy] = useState<SortOption>('plays')
  const [showNewOnly, setShowNewOnly] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [yearlyPlayTimeExpanded, setYearlyPlayTimeExpanded] = useState(true)
  const [songsExpanded, setSongsExpanded] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [showAllArtists, setShowAllArtists] = useState(false)
  const yearlyChartRef = useRef<HighchartsReact.RefObject>(null)
  const artistChartRef = useRef<HighchartsReact.RefObject>(null)
  
  useEffect(() => {
    setMounted(true)
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  
  // Use a consistent viewMode for skeleton to avoid hydration mismatch
  // Always use 'grid' until mounted to match server render
  const skeletonViewMode = mounted ? viewMode : 'grid'
  
  // Reset expanded state when album changes
  useEffect(() => {
    if (selectedAlbum) {
      setYearlyPlayTimeExpanded(true)
      setSongsExpanded(true)
    }
  }, [selectedAlbum])
  
  useEffect(() => {
    const fetchAlbums = async () => {
      try {
        const response = await fetch('/api/data/albums-with-songs', {
          cache: 'no-cache' // Validate with server but allow short-term caching
        })
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.statusText}`)
        }
        const data = await response.json()
        setAlbumsData(data)
      } catch (error) {
        console.error('Error fetching albums:', error)
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
    
    fetchAlbums()
    fetchDetailedStats()
  }, [])
  
  // Helper function to get plays in past 30 days
  const getPlays30Days = (album: AlbumData): number => {
    return album.count - (album.count_30_days_ago || 0)
  }

  // Helper function to check if album is new in past 30 days
  const isNewInPast30Days = (album: AlbumData): boolean => {
    // An item is "new" if it wasn't in the top 500, 30 days ago
    // rank_30_days_ago is undefined if the item wasn't ranked 30 days ago
    return album.rank_30_days_ago === undefined && album.count > 0
  }

  const filteredAlbums = albumsData?.albums.filter(album => {
    // Search filter
    const matchesSearch = album.album.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      album.album.artists?.some(artist => artist.toLowerCase().includes(searchTerm.toLowerCase()))
    
    // New filter
    const matchesNewFilter = !showNewOnly || isNewInPast30Days(album)
    
    return matchesSearch && matchesNewFilter
  }) || []
  
  // Helper function to compare release dates
  const compareReleaseDates = (a: AlbumData, b: AlbumData, ascending: boolean): number => {
    const dateA = new Date(a.album.release_date).getTime()
    const dateB = new Date(b.album.release_date).getTime()
    // Handle invalid dates
    if (isNaN(dateA) && isNaN(dateB)) return 0
    if (isNaN(dateA)) return 1
    if (isNaN(dateB)) return -1
    return ascending ? dateA - dateB : dateB - dateA
  }

  // Helper function to compare first played dates
  const compareFirstPlayedDates = (a: AlbumData, b: AlbumData): number => {
    const dateA = a.earliest_played_at ? new Date(a.earliest_played_at).getTime() : NaN
    const dateB = b.earliest_played_at ? new Date(b.earliest_played_at).getTime() : NaN
    // Handle missing dates - put them at the end
    if (isNaN(dateA) && isNaN(dateB)) return 0
    if (isNaN(dateA)) return 1
    if (isNaN(dateB)) return -1
    // Sort earliest first (oldest first played dates first)
    return dateA - dateB
  }

  // Sort filtered albums based on selected sort option
  const sortedAlbums = [...filteredAlbums].sort((a, b) => {
    switch (sortBy) {
      case 'duration':
        return (b.total_duration_ms || 0) - (a.total_duration_ms || 0)
      case 'plays_30_days':
        return getPlays30Days(b) - getPlays30Days(a)
      case 'release_date':
        // Sort by release date, newest first
        return compareReleaseDates(a, b, false)
      case 'release_date_old':
        // Sort by release date, oldest first
        return compareReleaseDates(a, b, true)
      case 'first_played':
        // Sort by first played date, earliest first
        return compareFirstPlayedDates(a, b)
      case 'plays':
      default:
        return b.count - a.count
    }
  })

  // Group albums by release year for yearly view
  const getAlbumsByYear = (): Map<string, AlbumData[]> => {
    const albumsByYear = new Map<string, AlbumData[]>()
    
    filteredAlbums.forEach(album => {
      const releaseDate = album.album.release_date
      if (!releaseDate) return
      
      // Extract year from release_date (format: YYYY-MM-DD or YYYY-MM or YYYY)
      const year = releaseDate.split('-')[0]
      if (!year || year.length !== 4) return
      
      if (!albumsByYear.has(year)) {
        albumsByYear.set(year, [])
      }
      albumsByYear.get(year)!.push(album)
    })
    
    // Sort albums within each year by plays (count)
    albumsByYear.forEach((albums, year) => {
      albums.sort((a, b) => (b.count || 0) - (a.count || 0))
    })
    
    return albumsByYear
  }
  
  const handleAlbumClick = (album: AlbumData) => {
    setSelectedAlbum(album)
  }
  
  // Process artist data for pie chart
  const getArtistChartData = (includeOthers: boolean = false): { name: string; y: number }[] => {
    if (!albumsData?.albums) return []
    
    // Count artist appearances in filtered/sorted albums
    const artistCounts = new Map<string, number>()
    
    sortedAlbums.forEach(album => {
      // Use the first artist (primary artist) for each album
      const primaryArtist = album.album.artists?.[0]
      if (primaryArtist) {
        artistCounts.set(primaryArtist, (artistCounts.get(primaryArtist) || 0) + 1)
      }
    })
    
    // Separate artists that appear more than once from those that appear once
    const multipleAppearances: { name: string; y: number }[] = []
    let othersCount = 0
    
    artistCounts.forEach((count, artist) => {
      if (count > 1) {
        multipleAppearances.push({ name: artist, y: count })
      } else {
        othersCount += count
      }
    })
    
    // Sort by count (descending)
    multipleAppearances.sort((a, b) => b.y - a.y)
    
    // Add "Others" only if includeOthers is true
    if (includeOthers && othersCount > 0) {
      multipleAppearances.push({ name: 'Others', y: othersCount })
    }
    
    return multipleAppearances
  }

  // Prepare pie chart options for artist distribution
  const getArtistPieChartOptions = (): Highcharts.Options => {
    const chartData = getArtistChartData(showAllArtists)
    
    if (chartData.length === 0) {
      return {
        chart: {
          type: 'pie',
          height: 400
        },
        title: {
          text: 'No data available'
        }
      }
    }

    // Get theme colors
    const card = getCSSVariable('--card')
    const border = getCSSVariable('--border')
    const primary = getCSSVariable('--primary')

    const foregroundColor = '#ffffff'
    const mutedColor = '#808080'
    const cardColor = card ? `rgb(${card})` : '#ffffff'
    const borderColor = border ? `rgb(${border})` : '#e5e7eb'
    const primaryColor = primary ? `rgb(${primary})` : '#4f46e5'

    // Generate colors for pie slices using a color palette
    const baseColors = [
      '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
      '#ef4444', '#06b6d4', '#f97316', '#84cc16', '#6366f1',
      '#14b8a6', '#a855f7', '#f43f5e', '#eab308', '#22c55e'
    ]
    
    const colors = chartData.map((_, index) => {
      return baseColors[index % baseColors.length]
    })

    return {
      chart: {
        type: 'pie',
        backgroundColor: 'transparent',
        height: isMobile ? 400 : 650,
        style: {
          fontFamily: 'inherit'
        },
        spacingLeft: 0,
        spacingRight: 0,
        spacingTop: 20,
        spacingBottom: 20
      },
      title: {
        text: 'Artists by Album Count',
        style: {
          color: foregroundColor,
          fontSize: '18px',
          fontWeight: '600'
        }
      },
      subtitle: {
        text: 'Only artists with multiple albums are shown individually',
        style: {
          color: mutedColor,
          fontSize: '12px'
        }
      },
      tooltip: {
        backgroundColor: cardColor,
        borderColor: borderColor,
        borderRadius: 8,
        style: {
          color: foregroundColor
        },
        formatter: function(this: Highcharts.Point) {
          const percentage = this.percentage?.toFixed(1) || 0
          return `<b>${this.name}</b><br/>${this.y} ${this.y === 1 ? 'album' : 'albums'} (${percentage}%)`
        }
      },
      plotOptions: {
        pie: {
          allowPointSelect: true,
          cursor: 'pointer',
          dataLabels: {
            enabled: false
          },
          showInLegend: true,
          colors: colors,
          borderColor: borderColor,
          borderWidth: 1
        }
      },
      legend: {
        enabled: false // Disable built-in legend, we'll use custom one
      },
      series: [{
        name: 'Albums',
        data: chartData,
        type: 'pie'
      }],
      credits: {
        enabled: false
      }
    }
  }
  
  // Prepare chart options for yearly play time
  const getYearlyPlayTimeChartOptions = (): Highcharts.Options => {
    if (!selectedAlbum?.yearly_play_time || selectedAlbum.yearly_play_time.length === 0) {
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

    const categories = selectedAlbum.yearly_play_time.map(item => item.year)
    const data = selectedAlbum.yearly_play_time.map(item => {
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

    // Calculate responsive height - use state if available, otherwise check window
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
      title="My Top Albums"
      description={loading ? 'Loading...' : (() => {
        const years = getYearsOfListeningHistory(detailedStats)
        return `From ${albumsData?.metadata.originalTotalAlbums} different albums across ${years} ${years === 1 ? 'year' : 'years'} of listening history`
      })()}
      currentPage="albums"
      additionalControls={
        <div className="flex items-center gap-2">
          <ViewToggle viewMode={mounted ? viewMode : 'grid'} onViewModeChange={setViewMode} showYearly={true} />
          <FilterSortToggle
            sortBy={sortBy}
            onSortChange={setSortBy}
            showNewOnly={showNewOnly}
            onFilterToggle={setShowNewOnly}
            sortOptions={[
              { value: 'plays', label: 'Total Plays' },
              { value: 'plays_30_days', label: 'Plays (30d)' },
              { value: 'duration', label: 'Total Duration' },
              { value: 'release_date', label: 'Release Date (new to old)' },
              { value: 'release_date_old', label: 'Release Date (old to new)' },
              { value: 'first_played', label: 'First Played' },
            ]}
          />
        </div>
      }
    >
      {loading ? (
        skeletonViewMode === 'grid' || skeletonViewMode === 'yearly' ? (
          <GridSkeleton count={12} />
        ) : (
          <ListSkeleton count={10} />
        )
      ) : (
        <>
          {/* Albums Display */}
        {viewMode === 'chart' ? (
          <div className="w-full">
            {mounted && (
              <div className="flex flex-col lg:flex-row gap-4">
                {/* Chart */}
                <Card className="backdrop-blur-md bg-card/70 border-white/10 shadow-md p-4 sm:p-6 lg:w-1/2 flex-shrink-0">
                  <HighchartsReact
                    highcharts={Highcharts}
                    options={getArtistPieChartOptions()}
                    ref={artistChartRef}
                  />
                  {/* Show all artists checkbox */}
                  <div className="mt-4 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="show-all-artists"
                      checked={showAllArtists}
                      onChange={(e) => setShowAllArtists(e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-card text-primary focus:ring-2 focus:ring-primary focus:ring-offset-0 cursor-pointer"
                    />
                    <label
                      htmlFor="show-all-artists"
                      className="text-sm text-foreground cursor-pointer select-none"
                    >
                      Show all artist data
                    </label>
                  </div>
                </Card>
                
                {/* Custom Legend */}
                <Card className="backdrop-blur-md bg-card/70 border-white/10 shadow-md p-4 sm:p-6 w-full lg:w-1/2 flex-shrink-0">
                  <h3 className="text-sm font-semibold mb-4 text-foreground">Artists</h3>
                  <div className="overflow-y-auto max-h-[650px] pr-2 space-y-2 custom-scrollbar">
                    {getArtistChartData(showAllArtists).map((item, index) => {
                      const colors = (() => {
                        const baseColors = [
                          '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
                          '#ef4444', '#06b6d4', '#f97316', '#84cc16', '#6366f1',
                          '#14b8a6', '#a855f7', '#f43f5e', '#eab308', '#22c55e'
                        ]
                        return baseColors[index % baseColors.length]
                      })()
                      
                      return (
                        <div
                          key={item.name}
                          className="flex items-center gap-3 py-1.5 hover:opacity-80 transition-opacity cursor-pointer"
                          onClick={() => {
                            // Toggle series visibility on click
                            const chart = artistChartRef.current?.chart
                            if (chart) {
                              const series = chart.series[0]
                              const point = series.data.find((p: Highcharts.Point) => p.name === item.name)
                              if (point) {
                                point.setVisible(!point.visible)
                              }
                            }
                          }}
                        >
                          <div
                            className="w-4 h-4 rounded-sm flex-shrink-0"
                            style={{ backgroundColor: colors }}
                          />
                          <span className="text-sm text-foreground flex-1">{item.name}</span>
                          <span className="text-xs text-muted-foreground">{item.y}</span>
                        </div>
                      )
                    })}
                  </div>
                </Card>
              </div>
            )}
          </div>
        ) : viewMode === 'yearly' ? (
          <div className="space-y-6">
            {(() => {
              const albumsByYear = getAlbumsByYear()
              const sortedYears = Array.from(albumsByYear.keys()).sort((a, b) => parseInt(b) - parseInt(a))
              
              if (sortedYears.length === 0) {
                return (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">No albums with release dates found</p>
                  </div>
                )
              }
              
              return sortedYears.map(year => {
                const albums = albumsByYear.get(year)!
                return (
                  <div key={year} className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-start">
                    {/* Year Label */}
                    <div className="flex-shrink-0 w-full sm:w-20 md:w-24 flex items-start sm:items-center justify-start sm:justify-end pt-0 sm:pt-1">
                      <span className="text-base sm:text-lg md:text-xl font-bold text-foreground bg-muted/50 backdrop-blur-sm border border-white/10 rounded px-2 sm:px-3 py-1.5 sm:py-2 whitespace-nowrap">
                        {year}
                      </span>
                    </div>
                    
                    {/* Album Covers Row */}
                    <div className="flex-1 w-full grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2 sm:gap-3 md:gap-4">
                      {albums.map((album) => (
                        <Card
                          key={album.primaryAlbumId}
                          className="group backdrop-blur-md bg-card/70 border-white/10 shadow-md hover:shadow-xl hover:bg-card/85 hover:border-white/20 transition-all duration-200 cursor-pointer"
                          onClick={() => handleAlbumClick(album)}
                        >
                          <CardContent className="p-2 sm:p-3">
                            <div className="mb-2">
                              <LazyAlbumImage album={album.album} rank={album.rank} />
                            </div>
                            <div className="space-y-1">
                              <h3 className="font-semibold text-xs leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                                {album.album.name}
                              </h3>
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {album.album.artists[0]}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {sortedAlbums.map((album) => (
              <Card 
                key={album.primaryAlbumId} 
                className="group backdrop-blur-md bg-card/70 border-white/10 shadow-md hover:shadow-xl hover:bg-card/85 hover:border-white/20 transition-all duration-200 cursor-pointer"
                onClick={() => handleAlbumClick(album)}
              >
                <CardContent className="p-3">
                  {/* Album Image */}
                  <div className="mb-3">
                    <LazyAlbumImage album={album.album} rank={album.rank} />
                  </div>
                  
                  {/* Album Info */}
                  <div className="space-y-2">
                    {/* Rank Badge */}
                    <div className="flex flex-col gap-1 items-start">
                      <RankingMovement
                        currentRank={album.rank}
                        rank30DaysAgo={album.rank_30_days_ago}
                        currentCount={album.count}
                        count30DaysAgo={album.count_30_days_ago}
                        size="sm"
                        type="rank"
                      />
                      <RankingMovement
                        currentRank={album.rank}
                        rank30DaysAgo={album.rank_30_days_ago}
                        currentCount={album.count}
                        count30DaysAgo={album.count_30_days_ago}
                        size="sm"
                        type="playCount"
                      />
                    </div>
                    
                    {/* Album Name */}
                    <h3 className="font-semibold text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                      {album.album.name}
                    </h3>
                    
                    {/* Artist Name */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setSearchTerm(album.album.artists[0])
                      }}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors line-clamp-1 text-left"
                    >
                      {album.album.artists[0]}
                    </button>
                    
                    {/* Duration */}
                    <p className="text-xs text-muted-foreground">
                      {(() => {
                        const duration = album.total_duration_ms || 0
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
              <div className="col-span-4">Album</div>
              <div className="col-span-3">Artist</div>
              <div className="col-span-1">Plays</div>
              <div className="col-span-2">Duration</div>
            </div>
            
            {sortedAlbums.map((album) => (
              <Card 
                key={album.primaryAlbumId} 
                className="group backdrop-blur-md bg-card/70 border-white/10 shadow-md hover:shadow-xl hover:bg-card/85 hover:border-white/20 transition-all duration-200 cursor-pointer"
                onClick={() => handleAlbumClick(album)}
              >
                <CardContent className="p-3 md:p-2">
                  {/* Desktop Layout */}
                  <div className="hidden md:grid grid-cols-12 gap-2 items-center">
                    {/* Rank */}
                    <div className="col-span-1">
                      <RankingMovement
                        currentRank={album.rank}
                        rank30DaysAgo={album.rank_30_days_ago}
                        currentCount={album.count}
                        count30DaysAgo={album.count_30_days_ago}
                        size="sm"
                        type="rank"
                      />
                    </div>
                    
                    {/* Album Image */}
                    <div className="col-span-1">
                      <div className="w-12 h-12 aspect-square">
                        <LazyAlbumImage album={album.album} rank={album.rank} />
                      </div>
                    </div>
                    
                    {/* Album Name */}
                    <div className="col-span-4 min-w-0">
                      <h3 className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors break-words">
                        {album.album.name}
                      </h3>
                    </div>
                    
                    {/* Artist Name */}
                    <div className="col-span-3 min-w-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSearchTerm(album.album.artists[0])
                        }}
                        className="text-sm text-muted-foreground hover:text-primary transition-colors text-left break-words"
                      >
                        {album.album.artists[0]}
                      </button>
                    </div>
                    
                    {/* Play Count */}
                    <div className="col-span-1">
                      <RankingMovement
                        currentRank={album.rank}
                        rank30DaysAgo={album.rank_30_days_ago}
                        currentCount={album.count}
                        count30DaysAgo={album.count_30_days_ago}
                        size="sm"
                        type="playCount"
                      />
                    </div>
                    
                    {/* Duration */}
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground">
                        {(() => {
                          const totalMinutes = Math.floor(album.total_duration_ms / 60000)
                          const hours = Math.floor(totalMinutes / 60)
                          const minutes = totalMinutes % 60
                          return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
                        })()}
                      </p>
                    </div>
                  </div>
                  
                  {/* Mobile Layout */}
                  <div className="md:hidden flex items-start gap-3">
                    {/* Album Image */}
                    <div className="flex-shrink-0">
                      <LazyAlbumImage album={album.album} rank={album.rank} size="mobile" />
                    </div>
                    
                    {/* Album Info */}
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <RankingMovement
                            currentRank={album.rank}
                            rank30DaysAgo={album.rank_30_days_ago}
                            currentCount={album.count}
                            count30DaysAgo={album.count_30_days_ago}
                            size="sm"
                            type="rank"
                          />
                          <h3 className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors mt-1 break-words">
                            {album.album.name}
                          </h3>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setSearchTerm(album.album.artists[0])
                            }}
                            className="text-sm text-muted-foreground hover:text-primary transition-colors text-left break-words"
                          >
                            {album.album.artists[0]}
                          </button>
                        </div>
                        <div className="flex flex-col items-end ml-2 flex-shrink-0">
                          <RankingMovement
                            currentRank={album.rank}
                            rank30DaysAgo={album.rank_30_days_ago}
                            currentCount={album.count}
                            count30DaysAgo={album.count_30_days_ago}
                            size="sm"
                            type="playCount"
                          />
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {(() => {
                              const totalMinutes = Math.floor(album.total_duration_ms / 60000)
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
        
          {sortedAlbums.length === 0 && searchTerm && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No albums found matching &quot;{searchTerm}&quot;</p>
            </div>
          )}
        </>
      )}
      
      {/* Album Details Modal */}
      <Dialog open={!!selectedAlbum} onOpenChange={(open) => !open && setSelectedAlbum(null)}>
        <DialogContent className="max-w-2xl p-4 sm:p-6 sm:max-h-[90vh] flex flex-col">
          {selectedAlbum && (
            <div className="flex flex-col h-full min-h-0">
              <DialogHeader className="flex-shrink-0 pb-4">
                <div className="flex flex-col items-center gap-4 mb-2">
                  <div className="relative w-32 h-32 flex-shrink-0 rounded-lg overflow-hidden bg-muted">
                    {selectedAlbum.album.images?.[0]?.url ? (
                      <Image
                        src={selectedAlbum.album.images[0].url}
                        alt={`${selectedAlbum.album.name} album cover`}
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
                      {selectedAlbum.album.name}
                    </DialogTitle>
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <span className="text-muted-foreground">
                          {selectedAlbum.album.artists.join(', ')}
                        </span>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-muted-foreground">
                          {selectedAlbum.album.release_date}
                        </span>
                        {selectedAlbum.total_songs && (
                          <>
                            <span className="text-muted-foreground">•</span>
                            <span className="text-muted-foreground">
                              {selectedAlbum.total_songs} songs
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center justify-center gap-4 text-sm flex-wrap">
                        <div className="flex items-center gap-1">
                          <Play className="w-4 h-4" />
                          <span>{selectedAlbum.total_count} plays</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          <span>{formatDuration(selectedAlbum.total_duration_ms)}</span>
                        </div>
                        {selectedAlbum.played_songs !== undefined && selectedAlbum.total_songs !== undefined && (
                          <div className="flex items-center gap-1">
                            <Music className="w-4 h-4" />
                            <span>{selectedAlbum.played_songs}/{selectedAlbum.total_songs} played</span>
                          </div>
                        )}
                        {selectedAlbum.earliest_played_at && (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            <span>First played {formatDate(selectedAlbum.earliest_played_at)}</span>
                          </div>
                        )}
                      </div>
                      {selectedAlbum.album.external_urls?.spotify && (
                        <div className="flex justify-center">
                          <a
                            href={selectedAlbum.album.external_urls.spotify}
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
                {selectedAlbum.yearly_play_time && selectedAlbum.yearly_play_time.length > 0 && (
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
                
                {/* Songs Section */}
                {selectedAlbum.songs && selectedAlbum.songs.length > 0 && (
                  <div className="border-t pt-4">
                    <button
                      onClick={() => setSongsExpanded(!songsExpanded)}
                      className="flex items-center justify-between w-full mb-3 hover:opacity-80 transition-opacity"
                    >
                      <h4 className="font-medium text-sm text-muted-foreground">
                        Songs ({selectedAlbum.songs.length})
                      </h4>
                      {songsExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                    <div 
                      className={`transition-all duration-300 ease-in-out ${
                        songsExpanded ? 'opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
                      }`}
                    >
                      {songsExpanded && (
                        <div className="space-y-2">
                          {selectedAlbum.songs
                            .sort((a, b) => b.play_count - a.play_count)
                            .map((song, index) => (
                            <div
                              key={song.songId}
                              className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors min-w-0 w-full flex-shrink-0"
                            >
                              <div className="flex-shrink-0 w-6 text-xs text-muted-foreground text-center">
                                {index + 1}
                              </div>
                              
                              <div className="flex-1 min-w-0 overflow-hidden">
                                <div className="flex items-center gap-2 min-w-0 w-full">
                                  <span className="font-medium text-sm truncate min-w-0 flex-1 whitespace-nowrap">{song.name}</span>
                                  {song.explicit && (
                                    <Badge variant="outline" className="text-xs px-1 py-0 flex-shrink-0">
                                      E
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground truncate whitespace-nowrap">
                                  Track {song.track_number}
                                  {song.duration_ms > 0 ? ` • ${formatSongDuration(song.duration_ms)}` : ''}
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
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SpotifyStatsLayout>
  )
}
