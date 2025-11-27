'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import SpotifyStatsLayout from '../components/SpotifyStatsLayout'
import Highcharts from 'highcharts'
import HighchartsReact from 'highcharts-react-official'
import { Music2, Users, Play, Clock } from 'lucide-react'

interface YearlyListeningTime {
  year: string
  totalListeningTimeMs: number
  totalListeningHours: number
  playCount: number
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
  }
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
  const chartComponentRef = useRef<HighchartsReact.RefObject>(null)
  const hourlyChartComponentRef = useRef<HighchartsReact.RefObject>(null)
  
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // Set default selected year to most recent year with data
  useEffect(() => {
    if (statsData?.stats?.yearlyTopItems && statsData.stats.yearlyTopItems.length > 0 && !selectedYear) {
      const years = statsData.stats.yearlyTopItems.map(item => item.year).sort((a, b) => parseInt(b) - parseInt(a))
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
          // Access the category (year) from the categories array
          // this.x should be the category when using categories, but we'll use the index as fallback
          const pointIndex = typeof this.x === 'number' ? this.x : (this.index ?? 0)
          const year = categories[pointIndex] || String(this.x)
          return `<b>${year}</b><br/>${this.y?.toFixed(2)} hours`
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
    const sortedData = [...statsData.stats.hourlyListeningDistribution].sort((a, b) => a.hour - b.hour)
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
  const availableYears = statsData?.stats?.yearlyTopItems?.map(item => item.year).sort((a, b) => parseInt(b) - parseInt(a)) || []
  
  // Format duration helper
  const formatDuration = (durationMs: number) => {
    const totalMinutes = Math.floor(durationMs / 60000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  }
  
  return (
    <SpotifyStatsLayout
      title="Spotify Statistics"
      description="Detailed insights into your listening habits"
      currentPage="stats"
    >
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading stats...</p>
          </div>
        </div>
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
                    <div className="flex flex-wrap gap-2">
                      {availableYears.map((year) => (
                        <button
                          key={year}
                          onClick={() => setSelectedYear(year)}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
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

