'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import SpotifyStatsLayout from '../components/SpotifyStatsLayout'
import Highcharts from 'highcharts'
import HighchartsReact from 'highcharts-react-official'
import { Music2, Users, Play, Clock, Globe, X } from 'lucide-react'
import { StatsSkeleton } from '@/components/SkeletonLoader'
import { getCountryName } from '@/lib/country-names'
import { ListeningHeatmap } from '@/components/Heatmap'

interface YearlyListeningTime {
  year: string
  totalListeningTimeMs: number
  totalListeningHours: number
  playCount: number
  totalPodcastListeningTimeMs?: number
  totalPodcastListeningHours?: number
}

interface HourlyListeningDistribution {
  hour: number
  totalListeningTimeMs: number
  totalListeningHours: number
  playCount: number
}

interface ImageData {
  url: string
  height: number
  width: number
}

interface YearlyTopItems {
  year: string
  topSongs: Array<{
    songId: string
    name: string
    artist: string
    playCount: number
    totalListeningTimeMs: number
    images: ImageData[]
  }>
  topArtists: Array<{
    artistName: string
    playCount: number
    totalListeningTimeMs: number
    uniqueSongs: number
    images: ImageData[]
  }>
  topAlbums: Array<{
    albumName: string
    artist: string
    playCount: number
    totalListeningTimeMs: number
    uniqueSongs: number
    images: ImageData[]
  }>
}

interface CountryListeningData {
  countryCode: string
  totalMsPlayed: number
  totalHours: number
  playCount: number
  firstPlayedAt: string
  lastPlayedAt: string
}

interface StatsData {
  metadata?: {
    timestamp: string
    source: string
  }
  stats: {
    yearlyListeningTime: YearlyListeningTime[]
    yearlyTopItems: YearlyTopItems[]
    totalListeningHours: number
    totalListeningDays: number
    totalListeningEvents?: number
    hourlyListeningDistribution?: HourlyListeningDistribution[]
    countryListeningData?: CountryListeningData[]
  }
}

interface DayPlay {
  songName: string
  artists: string[]
  albumName: string
  msPlayed: number
}

interface DailyListeningResponse {
  years: number[]
  data: Array<{
    date: number
    value: number
    plays?: DayPlay[]
  }>
}

// Helper function to get computed CSS variable value
const getCSSVariable = (variable: string): string => {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim()
}

export default function StatsPage() {
  const [statsData, setStatsData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [selectedYear, setSelectedYear] = useState<string | null>(null)
  const [countriesExpanded, setCountriesExpanded] = useState(false)
  const [dailyListening, setDailyListening] = useState<DailyListeningResponse | null>(null)
  const [selectedHeatmapYear, setSelectedHeatmapYear] = useState<number>(() => new Date().getFullYear())
  const [dailyListeningLoading, setDailyListeningLoading] = useState(false)
  const [selectedDay, setSelectedDay] = useState<{
    date: number
    value: number
    plays: DayPlay[]
  } | null>(null)
  const [expandedHeatmapArtist, setExpandedHeatmapArtist] = useState<string | null>(null)
  const [expandedHeatmapAlbum, setExpandedHeatmapAlbum] = useState<string | null>(null) // key: `${artist}|${album}`
  const chartComponentRef = useRef<HighchartsReact.RefObject>(null)
  const hourlyChartComponentRef = useRef<HighchartsReact.RefObject>(null)
  useEffect(() => {
    setMounted(true)
  }, [])

  // Set default selected year to most recent year with data
  useEffect(() => {
    if (statsData?.stats?.yearlyTopItems && statsData.stats.yearlyTopItems.length > 0 && !selectedYear) {
      const years = statsData.stats.yearlyTopItems.map(item => item.year).toSorted((a, b) => parseInt(b) - parseInt(a))
      setSelectedYear(years[0])
    }
  }, [statsData, selectedYear])
  
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/data/stats', {
          cache: 'no-cache'
        })
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.statusText}`)
        }
        const data = await response.json()
        setStatsData(data)
      } catch (error) {
        console.error('Error fetching stats:', error)
        setStatsData(null)
      } finally {
        setLoading(false)
      }
    }
    
    fetchStats()
  }, [])

  useEffect(() => {
    let cancelled = false
    setDailyListeningLoading(true)
    const fetchDailyListening = async () => {
      try {
        const res = await fetch(`/api/data/daily-listening?year=${selectedHeatmapYear}`, { cache: 'no-cache' })
        if (cancelled) return
        if (!res.ok) {
          setDailyListening(null)
          return
        }
        const json: DailyListeningResponse = await res.json()
        if (cancelled) return
        setDailyListening(json)
      } catch {
        if (!cancelled) setDailyListening(null)
      } finally {
        if (!cancelled) setDailyListeningLoading(false)
      }
    }
    fetchDailyListening()
    return () => { cancelled = true }
  }, [selectedHeatmapYear])


  // Prepare chart options for yearly listening hours
  const getChartOptions = (): Highcharts.Options => {
    if (!statsData?.stats?.yearlyListeningTime || statsData.stats.yearlyListeningTime.length === 0) {
      return {
        chart: {
          type: 'column',
          height: 400
        },
        title: {
          text: 'No data available'
        }
      }
    }

    const categories = statsData.stats.yearlyListeningTime.map(item => item.year)
    const data = statsData.stats.yearlyListeningTime.map(item => item.totalListeningHours)
    
    // Extract podcast data (in hours)
    const podcastData = statsData.stats.yearlyListeningTime.map(item => 
      item.totalPodcastListeningHours || 0
    )

    // Calculate estimated hours for current year
    const currentYear = new Date().getFullYear().toString()
    const currentYearIndex = categories.indexOf(currentYear)
    let estimatedData: (number | null)[] = new Array(categories.length).fill(null)
    
    if (currentYearIndex !== -1) {
      const currentYearData = statsData.stats.yearlyListeningTime[currentYearIndex]
      const hoursSoFar = currentYearData.totalListeningHours
      const podcastHoursSoFar = currentYearData.totalPodcastListeningHours || 0
      const totalHoursSoFar = hoursSoFar + podcastHoursSoFar
      
      // Calculate day of year (1-365/366)
      const now = new Date()
      const startOfYear = new Date(now.getFullYear(), 0, 1)
      const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1
      
      // Calculate days remaining in year
      const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)
      const daysInYear = isLeapYear(now.getFullYear()) ? 366 : 365
      const daysRemaining = daysInYear - dayOfYear
      
      // Calculate estimated additional hours: (total hours so far / day of year) * days remaining
      const estimatedAdditionalHours = (totalHoursSoFar / dayOfYear) * daysRemaining
      const estimatedTotalHours = totalHoursSoFar + estimatedAdditionalHours
      
      // Set estimated data to show the estimated TOTAL (will be stacked on top of actual)
      // Since we're stacking, we need to subtract actual from total to get the height of the estimated bar
      estimatedData[currentYearIndex] = estimatedTotalHours - totalHoursSoFar
    }

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
    const podcastColor = '#a855f7' // purple-500

    return {
      chart: {
        type: 'column',
        backgroundColor: 'transparent',
        height: 500,
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
        gridLineColor: borderColor,
        reversedStacks: false
      },
      legend: {
        enabled: true,
        itemStyle: {
          color: foregroundColor
        }
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
          
          if (this.series.name === 'Estimated (Projected)') {
            // Calculate estimated total: actual hours + podcast hours + estimated additional hours
            const actualHours = data[pointIndex] || 0
            const podcastHours = podcastData[pointIndex] || 0
            const estimatedAdditional = this.y as number
            const estimatedTotal = actualHours + podcastHours + estimatedAdditional
            return `<b>${year} (Estimated Total)</b><br/>${estimatedTotal.toFixed(2)} hours<br/><span style="color: ${mutedColor}">Projected if current pace continues</span>`
          } else if (this.series.name === 'Podcast Hours') {
            const podcastHours = this.y as number
            const musicHours = data[pointIndex] || 0
            const totalHours = musicHours + podcastHours
            return `<b>${year}</b><br/>Podcast: ${podcastHours.toFixed(2)} hours<br/>Music: ${musicHours.toFixed(2)} hours<br/>Total: ${totalHours.toFixed(2)} hours`
          } else {
            const musicHours = this.y as number
            const podcastHours = podcastData[pointIndex] || 0
            const totalHours = musicHours + podcastHours
            return `<b>${year}</b><br/>Music: ${musicHours.toFixed(2)} hours${podcastHours > 0 ? `<br/>Podcast: ${podcastHours.toFixed(2)} hours<br/>Total: ${totalHours.toFixed(2)} hours` : ''}`
          }
        }
      },
      plotOptions: {
        column: {
          borderRadius: 4,
          dataLabels: {
            enabled: false
          },
          pointPadding: 0.05,
          groupPadding: 0.1,
          stacking: 'normal'
        }
      },
      series: [
        {
          name: 'Listening Hours',
          data: data,
          type: 'column',
          color: primaryColor
        },
        {
          name: 'Podcast Hours',
          data: podcastData,
          type: 'column',
          color: podcastColor,
          visible: false
        },
        {
          name: 'Estimated (Projected)',
          data: estimatedData,
          type: 'column',
          color: mutedColor,
          opacity: 0.6,
          borderColor: borderColor,
          borderWidth: 1
        }
      ],
      credits: {
        enabled: false
      }
    }
  }

  // Prepare chart options for hourly listening distribution
  const getHourlyChartOptions = (): Highcharts.Options => {
    if (!statsData?.stats?.hourlyListeningDistribution || statsData.stats.hourlyListeningDistribution.length === 0) {
      return {
        chart: {
          type: 'column',
          height: 400
        },
        title: {
          text: 'No data available'
        }
      }
    }

    // Sort by hour to ensure correct order (0-23)
    const sortedData = statsData.stats.hourlyListeningDistribution.toSorted((a, b) => a.hour - b.hour)
    const categories = sortedData.map(item => {
      // Format hour in 24-hour format (00-23)
      return `${item.hour.toString().padStart(2, '0')}`
    })
    const data = sortedData.map(item => item.totalListeningHours)

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

    return {
      chart: {
        type: 'column',
        backgroundColor: 'transparent',
        height: 500,
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
          text: 'Hour of Day',
          style: {
            color: mutedColor
          }
        },
        labels: {
          style: {
            color: mutedColor
          },
          rotation: -45
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
          const hourData = sortedData[pointIndex]
          const hourLabel = categories[pointIndex] || `${hourData.hour.toString().padStart(2, '0')}:00`
          return `<b>${hourLabel}</b><br/>${this.y?.toFixed(2)} hours<br/>${hourData.playCount} plays`
        }
      },
      plotOptions: {
        column: {
          color: primaryColor,
          borderRadius: 4,
          dataLabels: {
            enabled: false
          },
          pointPadding: 0.05,
          groupPadding: 0.1
        }
      },
      series: [{
        name: 'Listening Hours',
        data: data,
        type: 'column'
      }],
      credits: {
        enabled: false
      }
    }
  }
  
  // Get selected year data
  const selectedYearData = statsData?.stats?.yearlyTopItems?.find(item => item.year === selectedYear)
  const availableYears = statsData?.stats?.yearlyTopItems?.map(item => item.year).toSorted((a, b) => parseInt(b) - parseInt(a)) || []
  
  // Format duration helper
  const formatDuration = (durationMs: number) => {
    const totalMinutes = Math.floor(durationMs / 60000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  }

  // Get sorted countries (sorted by hours, descending)
  const getSortedCountries = () => {
    if (!statsData?.stats?.countryListeningData) return []
    
    const countries = statsData.stats.countryListeningData
      .filter(country => country.countryCode !== 'ZZ')
      .map(country => ({
        ...country,
        countryName: getCountryName(country.countryCode),
        percentage: (country.totalHours / statsData.stats.totalListeningHours) * 100
      }))
    
    return countries.toSorted((a, b) => b.totalHours - a.totalHours)
  }
  
  return (
    <SpotifyStatsLayout
      title="Spotify Statistics"
      description="Detailed insights into your listening habits"
      currentPage="stats"
    >
      {loading ? (
        <StatsSkeleton />
      ) : (
        <>
          {/* Stats Display */}
        <div className="space-y-6">
          {statsData ? (
            <>
              {/* Yearly Top Items */}
              {statsData.stats?.yearlyTopItems && statsData.stats.yearlyTopItems.length > 0 && selectedYearData && (
                <Card>
                  <CardHeader>
                    <CardTitle className="mb-4">Top Songs, Artists & Albums by Year</CardTitle>
                    <div className="grid grid-cols-5 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-12 gap-2">
                      {availableYears.map((year) => (
                        <button
                          key={year}
                          onClick={() => setSelectedYear(year)}
                          className={`w-full px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            selectedYear === year
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                        >
                          {year}
                        </button>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                      {/* Top Songs */}
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <Music2 className="w-5 h-5 text-muted-foreground" />
                          <h3 className="font-semibold text-lg">Top Songs</h3>
                        </div>
                        <div className="space-y-2">
                          {selectedYearData.topSongs.map((song, index) => {
                            const songImage = song.images?.[0]?.url
                            return (
                              <div
                                key={song.songId}
                                className="p-2 rounded-md hover:bg-muted/50 transition-colors"
                              >
                                <div className="flex items-start gap-3">
                                  <Badge variant="secondary" className="text-xs w-8 flex-shrink-0 justify-center mt-0.5">
                                    {index + 1}
                                  </Badge>
                                  {songImage && (
                                    <div className="relative w-16 h-16 flex-shrink-0 rounded-md overflow-hidden bg-muted">
                                      <Image
                                        src={songImage}
                                        alt={`${song.name} album cover`}
                                        fill
                                        className="object-cover"
                                        sizes="64px"
                                      />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm break-words">{song.name}</p>
                                    <p className="text-xs text-muted-foreground break-words mb-2">{song.artist}</p>
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                      <div className="flex items-center gap-1">
                                        <Play className="w-3 h-3" />
                                        <span>{song.playCount}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        <span>{formatDuration(song.totalListeningTimeMs)}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Top Artists */}
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <Users className="w-5 h-5 text-muted-foreground" />
                          <h3 className="font-semibold text-lg">Top Artists</h3>
                        </div>
                        <div className="space-y-2">
                          {selectedYearData.topArtists.map((artist, index) => {
                            const artistImage = artist.images?.[0]?.url
                            return (
                              <div
                                key={artist.artistName}
                                className="p-2 rounded-md hover:bg-muted/50 transition-colors"
                              >
                                <div className="flex items-start gap-3">
                                  <Badge variant="secondary" className="text-xs w-8 flex-shrink-0 justify-center mt-0.5">
                                    {index + 1}
                                  </Badge>
                                  {artistImage && (
                                    <div className="relative w-16 h-16 flex-shrink-0 rounded-full overflow-hidden bg-muted">
                                      <Image
                                        src={artistImage}
                                        alt={`${artist.artistName} artist image`}
                                        fill
                                        className="object-cover"
                                        sizes="64px"
                                      />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm break-words">{artist.artistName}</p>
                                    <p className="text-xs text-muted-foreground mb-2">{artist.uniqueSongs} songs</p>
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                      <div className="flex items-center gap-1">
                                        <Play className="w-3 h-3" />
                                        <span>{artist.playCount}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        <span>{formatDuration(artist.totalListeningTimeMs)}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Top Albums */}
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <Music2 className="w-5 h-5 text-muted-foreground" />
                          <h3 className="font-semibold text-lg">Top Albums</h3>
                        </div>
                        <div className="space-y-2">
                          {selectedYearData.topAlbums?.map((album, index) => {
                            const albumImage = album.images?.[0]?.url
                            return (
                              <div
                                key={`${album.albumName}-${album.artist}`}
                                className="p-2 rounded-md hover:bg-muted/50 transition-colors"
                              >
                                <div className="flex items-start gap-3">
                                  <Badge variant="secondary" className="text-xs w-8 flex-shrink-0 justify-center mt-0.5">
                                    {index + 1}
                                  </Badge>
                                  {albumImage && (
                                    <div className="relative w-16 h-16 flex-shrink-0 rounded-md overflow-hidden bg-muted">
                                      <Image
                                        src={albumImage}
                                        alt={`${album.albumName} album cover`}
                                        fill
                                        className="object-cover"
                                        sizes="64px"
                                      />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm break-words">{album.albumName}</p>
                                    <p className="text-xs text-muted-foreground break-words mb-2">{album.artist}</p>
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                      <div className="flex items-center gap-1">
                                        <Play className="w-3 h-3" />
                                        <span>{album.playCount}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        <span>{formatDuration(album.totalListeningTimeMs)}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Summary Stats */}
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {statsData.stats?.totalListeningHours && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Total Listening Hours</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">
                        {statsData.stats.totalListeningHours.toLocaleString(undefined, {
                          maximumFractionDigits: 2
                        })}
                      </p>
                    </CardContent>
                  </Card>
                )}
                {statsData.stats?.totalListeningDays && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Total Listening Days</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">
                        {statsData.stats.totalListeningDays.toLocaleString(undefined, {
                          maximumFractionDigits: 2
                        })}
                      </p>
                    </CardContent>
                  </Card>
                )}
                {statsData.stats?.totalListeningEvents && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Total Songs Played</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">
                        {statsData.stats.totalListeningEvents.toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
              {/* Yearly Listening Hours Chart */}
              {statsData.stats?.yearlyListeningTime && statsData.stats.yearlyListeningTime.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Yearly Listening Hours</CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 sm:px-6">
                    <div className="w-full -mx-2 sm:mx-0">
                      {mounted && (
                        <HighchartsReact
                          highcharts={Highcharts}
                          options={getChartOptions()}
                          ref={chartComponentRef}
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Yearly Listening Hours</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">
                      {statsData.stats?.yearlyListeningTime ? 'No yearly data available' : 'Loading chart data...'}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Hourly Listening Distribution Chart */}
              {statsData.stats?.hourlyListeningDistribution && statsData.stats.hourlyListeningDistribution.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Hourly Listening Distribution</CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 sm:px-6">
                    <div className="w-full -mx-2 sm:mx-0">
                      {mounted && (
                        <HighchartsReact
                          highcharts={Highcharts}
                          options={getHourlyChartOptions()}
                          ref={hourlyChartComponentRef}
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {/* Year-to-date listening heatmap (scrollable horizontally on mobile) */}
              <Card>
                <CardHeader>
                  <CardTitle className="mb-4">Listening activity</CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground">Year:</span>
                    <select
                      value={selectedHeatmapYear}
                      onChange={(e) => setSelectedHeatmapYear(parseInt(e.target.value, 10))}
                      className="rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {Array.from(
                        { length: new Date().getFullYear() - 2008 },
                        (_, i) => new Date().getFullYear() - i
                      ).map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                </CardHeader>
                <CardContent>
                  {!mounted || dailyListeningLoading ? (
                    <p className="text-muted-foreground text-sm">Loading…</p>
                  ) : dailyListening === null ? (
                    <p className="text-muted-foreground text-sm">No daily listening data available.</p>
                  ) : (
                    <>
                      {dailyListening.data.length === 0 && (
                        <p className="text-muted-foreground text-sm mb-3">No listening data for {selectedHeatmapYear}.</p>
                      )}
                      <div className="overflow-x-auto -mx-1 md:overflow-visible md:mx-0 min-h-[200px] md:min-h-[200px] w-full block">
                        <ListeningHeatmap
                          year={selectedHeatmapYear}
                          data={dailyListening.data}
                          formatDuration={formatDuration}
                          onDayClick={(day) => {
                            setSelectedDay({ date: day.date, value: day.value, plays: day.plays ?? [] })
                          }}
                          className="min-w-[600px] md:min-w-0 md:w-full md:max-w-full"
                        />
                      </div>
                      {selectedDay && (() => {
                        const totalPlays = selectedDay.plays.length
                        const byArtist = new Map<string, { playCount: number; albums: Map<string, Set<string>> }>()
                        for (const play of selectedDay.plays) {
                          const albumName = play.albumName ?? 'Unknown Album'
                          for (const artist of play.artists) {
                            let cur = byArtist.get(artist)
                            if (!cur) {
                              cur = { playCount: 0, albums: new Map() }
                              byArtist.set(artist, cur)
                            }
                            cur.playCount += 1
                            let albumSongs = cur.albums.get(albumName)
                            if (!albumSongs) {
                              albumSongs = new Set<string>()
                              cur.albums.set(albumName, albumSongs)
                            }
                            albumSongs.add(play.songName)
                          }
                        }
                        const artistRows = Array.from(byArtist.entries())
                          .map(([name, { playCount, albums }]) => {
                            const albumList = Array.from(albums.entries())
                              .map(([albumName, songs]) => ({
                                name: albumName,
                                songCount: songs.size,
                                songs: Array.from(songs).sort(),
                              }))
                              .sort((x, y) => y.songCount - x.songCount)
                            const songCount = new Set(albumList.flatMap((al) => al.songs)).size
                            return {
                              name,
                              playCount,
                              songCount,
                              albums: albumList,
                              percentage: totalPlays > 0 ? (playCount / totalPlays) * 100 : 0,
                            }
                          })
                          .sort((a, b) => b.playCount - a.playCount)
                        return (
                          <div className="mt-4 rounded-lg border bg-muted/50 p-4">
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <h4 className="font-semibold">
                                {new Date(selectedDay.date).toLocaleDateString(undefined, {
                                  weekday: 'long',
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                })}
                                <span className="ml-2 text-sm font-normal text-muted-foreground">
                                  ({formatDuration(selectedDay.value)})
                                </span>
                              </h4>
                              <button
                                type="button"
                                onClick={() => { setSelectedDay(null); setExpandedHeatmapArtist(null); setExpandedHeatmapAlbum(null) }}
                                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                aria-label="Close"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            <div>
                              <h5 className="mb-2 text-sm font-medium text-muted-foreground">
                                By artist (play count)
                              </h5>
                              <ul className="max-h-96 space-y-0 overflow-y-auto text-sm">
                                {artistRows.length === 0 ? (
                                  <li className="py-1 text-muted-foreground">No artists</li>
                                ) : (
                                  artistRows.map((a) => (
                                    <li key={a.name} className="border-b border-border/50 last:border-b-0">
                                      <button
                                        type="button"
                                        onClick={() => setExpandedHeatmapArtist((prev) => (prev === a.name ? null : a.name))}
                                        className="flex w-full cursor-pointer items-center justify-between gap-2 py-2 text-left hover:bg-muted/50"
                                      >
                                        <span className="truncate" title={a.name}>
                                          {a.name}
                                        </span>
                                        <span className="shrink-0 text-muted-foreground">
                                          {a.percentage.toFixed(1)}% ({a.playCount} plays)
                                          <span className={`ml-1 inline-block transition-transform ${expandedHeatmapArtist === a.name ? 'rotate-180' : ''}`}>
                                            ▾
                                          </span>
                                        </span>
                                      </button>
                                      {expandedHeatmapArtist === a.name && (
                                        <ul className="border-t border-border/50 bg-muted/30">
                                          {a.albums.map((alb) => {
                                            const albumKey = `${a.name}|${alb.name}`
                                            const albumExpanded = expandedHeatmapAlbum === albumKey
                                            return (
                                              <li key={albumKey} className="border-b border-border/40 last:border-b-0">
                                                <button
                                                  type="button"
                                                  onClick={() => setExpandedHeatmapAlbum((prev) => (prev === albumKey ? null : albumKey))}
                                                  className="flex w-full cursor-pointer items-center justify-between gap-2 py-1.5 pl-4 pr-2 text-left text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                                >
                                                  <span className="truncate" title={alb.name}>
                                                    {alb.name}
                                                  </span>
                                                  <span className="shrink-0">
                                                    {alb.songCount} song{alb.songCount !== 1 ? 's' : ''}
                                                    <span className={`ml-1 inline-block transition-transform ${albumExpanded ? 'rotate-180' : ''}`}>
                                                      ▾
                                                    </span>
                                                  </span>
                                                </button>
                                                {albumExpanded && (
                                                  <ul className="list-inside list-disc space-y-0.5 bg-muted/20 px-4 py-2 pl-8 text-muted-foreground">
                                                    {alb.songs.map((s) => (
                                                      <li key={s} className="truncate" title={s}>
                                                        {s}
                                                      </li>
                                                    ))}
                                                  </ul>
                                                )}
                                              </li>
                                            )
                                          })}
                                        </ul>
                                      )}
                                    </li>
                                  ))
                                )}
                              </ul>
                            </div>
                          </div>
                        )
                      })()}
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Country Listening Data */}
              {statsData.stats?.countryListeningData && statsData.stats.countryListeningData.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Listening by Country</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* Desktop Table Header */}
                    <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-muted-foreground border-b">
                      <div className="col-span-1">#</div>
                      <div className="col-span-3">Country</div>
                      <div className="col-span-2">Date Range</div>
                      <div className="col-span-2">Hours</div>
                      <div className="col-span-2">Plays</div>
                      <div className="col-span-2">Percentage</div>
                    </div>
                    
                    {/* Country List */}
                    <div className="space-y-1">
                      {getSortedCountries()
                        .slice(0, countriesExpanded ? undefined : 5)
                        .map((country, index) => {
                        const percentage = country.percentage.toFixed(1)
                        const firstYear = new Date(country.firstPlayedAt).getFullYear()
                        const lastYear = new Date(country.lastPlayedAt).getFullYear()
                        const dateRange = firstYear === lastYear ? `${firstYear}` : `${firstYear} - ${lastYear}`
                        
                        return (
                          <div
                            key={country.countryCode}
                            className="p-2 md:p-3 rounded-md hover:bg-muted/50 transition-colors"
                          >
                            {/* Desktop Layout */}
                            <div className="hidden md:grid grid-cols-12 gap-2 items-center">
                              <div className="col-span-1">
                                <Badge variant="secondary" className="text-xs w-8 flex-shrink-0 justify-center">
                                  {index + 1}
                                </Badge>
                              </div>
                              <div className="col-span-3">
                                <p className="font-medium text-sm">{country.countryName}</p>
                              </div>
                              <div className="col-span-2">
                                <p className="text-xs text-muted-foreground">{dateRange}</p>
                              </div>
                              <div className="col-span-2 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-muted-foreground" />
                                <span className="text-sm">{country.totalHours.toLocaleString(undefined, { maximumFractionDigits: 1 })}h</span>
                              </div>
                              <div className="col-span-2 flex items-center gap-1">
                                <Play className="w-3 h-3 text-muted-foreground" />
                                <span className="text-sm">{country.playCount.toLocaleString()}</span>
                              </div>
                              <div className="col-span-2">
                                <span className="text-sm text-muted-foreground">{percentage}%</span>
                              </div>
                            </div>
                            
                            {/* Mobile Layout */}
                            <div className="md:hidden flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Badge variant="secondary" className="text-xs w-8 flex-shrink-0 justify-center">
                                  {index + 1}
                                </Badge>
                                <div>
                                  <p className="font-medium text-sm">{country.countryName}</p>
                                  <p className="text-xs text-muted-foreground">{dateRange}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>{country.totalHours.toLocaleString(undefined, { maximumFractionDigits: 1 })}h</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Play className="w-3 h-3" />
                                  <span>{country.playCount.toLocaleString()}</span>
                                </div>
                                <span>{percentage}%</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    
                    {/* Expand/Collapse Button */}
                    {getSortedCountries().length > 5 && (
                      <div className="mt-4 pt-4 border-t flex justify-center">
                        <button
                          onClick={() => setCountriesExpanded(!countriesExpanded)}
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {countriesExpanded 
                            ? `Show less (${getSortedCountries().length - 5} hidden)`
                            : `Show ${getSortedCountries().length - 5} more countries`
                          }
                        </button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : null}
            </>
          ) : !loading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No stats data available</p>
              <p className="text-sm text-muted-foreground mt-2">
                Check console for errors
              </p>
            </div>
          ) : null}
        </div>
        </>
      )}
    </SpotifyStatsLayout>
  )
}

