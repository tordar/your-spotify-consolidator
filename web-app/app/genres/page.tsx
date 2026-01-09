'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Highcharts from 'highcharts'
import HighchartsReact from 'highcharts-react-official'
import SpotifyStatsLayout from '../../components/SpotifyStatsLayout'

interface ArtistGenre {
  name: string
  play_count: number
  genres: string[]
}

interface GenresData {
  metadata: {
    totalArtists: number
    minPlayCount: number
    timestamp: string
    source: string
  }
  artists: ArtistGenre[]
}

interface GenreNode {
  id: string
  value: number
  artistCount: number
  color?: string
  topArtists?: Array<{ name: string; play_count: number }>
}

interface GenreLink {
  from: string
  to: string
  weight: number
}

export default function GenresPage() {
  const [genresData, setGenresData] = useState<GenresData | null>(null)
  const [loading, setLoading] = useState(true)
  const [minGenreCount, setMinGenreCount] = useState(8)
  const [minCoOccurrence, setMinCoOccurrence] = useState(8)
  const chartRef = useRef<HighchartsReact.RefObject>(null)

  useEffect(() => {
    // Load networkgraph module
    if (typeof window !== 'undefined') {
      import('highcharts/modules/networkgraph').then((module: any) => {
        const networkgraphModule = module.default || module
        if (typeof networkgraphModule === 'function') {
          networkgraphModule(Highcharts)
        }
      })
    }

    const fetchGenres = async () => {
      try {
        const response = await fetch('/api/data/genres', {
          cache: 'no-cache'
        })
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.statusText}`)
        }
        const data = await response.json()
        setGenresData(data)
      } catch (error) {
        console.error('Error fetching genres data:', error)
      } finally {
        setLoading(false)
      }
    }
    
    fetchGenres()
  }, [])

  // Build co-occurrence matrix and assign colors to clusters
  const networkData = useMemo(() => {
    if (!genresData) return { nodes: [], links: [] }

    // Count genre frequencies, co-occurrences, and track artists per genre
    const genreCounts = new Map<string, number>()
    const coOccurrenceMap = new Map<string, number>()
    const genreToArtists = new Map<string, Array<{ name: string; play_count: number }>>()

    genresData.artists.forEach(artist => {
      const genres = artist.genres.filter(g => g && g.trim() !== '')
      
      // Count individual genre frequencies and track artists
      genres.forEach(genre => {
        genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1)
        
        if (!genreToArtists.has(genre)) {
          genreToArtists.set(genre, [])
        }
        genreToArtists.get(genre)!.push({
          name: artist.name,
          play_count: artist.play_count
        })
      })

      // Count co-occurrences (pairs)
      for (let i = 0; i < genres.length; i++) {
        for (let j = i + 1; j < genres.length; j++) {
          const pair = [genres[i], genres[j]].sort().join('|')
          coOccurrenceMap.set(pair, (coOccurrenceMap.get(pair) || 0) + 1)
        }
      }
    })

    // Filter genres by minimum count
    const filteredGenres = Array.from(genreCounts.entries())
      .filter(([_, count]) => count >= minGenreCount)
      .sort((a, b) => b[1] - a[1])

    // Create nodes with top artists
    const nodes: GenreNode[] = filteredGenres.map(([genre, count]) => {
      const artists = genreToArtists.get(genre) || []
      const topArtists = artists
        .sort((a, b) => b.play_count - a.play_count)
        .slice(0, 5)
      
      return {
        id: genre,
        value: count,
        artistCount: count,
        topArtists: topArtists.length > 0 ? topArtists : undefined
      }
    })

    // Create links (only between filtered genres)
    const genreSet = new Set(filteredGenres.map(([genre]) => genre))
    const links: GenreLink[] = Array.from(coOccurrenceMap.entries())
      .map(([pair, weight]) => {
        const [genre1, genre2] = pair.split('|')
        return { from: genre1, to: genre2, weight }
      })
      .filter(link => 
        genreSet.has(link.from) && 
        genreSet.has(link.to) && 
        link.weight >= minCoOccurrence
      )

    // Assign colors to clusters using connected components
    const genreToColor = new Map<string, string>()
    const visited = new Set<string>()
    const colorPalette = [
      '#60a5fa', // Blue
      '#34d399', // Green
      '#fbbf24', // Yellow/Orange
      '#f472b6', // Pink
      '#a78bfa', // Purple
      '#fb7185', // Rose
      '#4ade80', // Emerald
      '#38bdf8', // Sky
      '#f59e0b', // Amber
      '#ec4899', // Fuchsia
      '#14b8a6', // Teal
      '#8b5cf6', // Violet
    ]

    // Build adjacency list for connected components
    const adjacencyList = new Map<string, Set<string>>()
    nodes.forEach(node => {
      adjacencyList.set(node.id, new Set())
    })
    links.forEach(link => {
      adjacencyList.get(link.from)?.add(link.to)
      adjacencyList.get(link.to)?.add(link.from)
    })

    // Find connected components and assign colors
    let colorIndex = 0
    const assignColorToComponent = (genre: string, color: string) => {
      if (visited.has(genre)) return
      visited.add(genre)
      genreToColor.set(genre, color)
      
      const neighbors = adjacencyList.get(genre) || new Set()
      neighbors.forEach(neighbor => {
        assignColorToComponent(neighbor, color)
      })
    }

    // Assign colors to each connected component
    nodes.forEach(node => {
      if (!visited.has(node.id)) {
        const color = colorPalette[colorIndex % colorPalette.length]
        assignColorToComponent(node.id, color)
        colorIndex++
      }
    })

    // Add color to nodes
    const nodesWithColors = nodes.map(node => ({
      ...node,
      color: genreToColor.get(node.id) || '#9ca3af' // Default grey for isolated nodes
    }))

    return { nodes: nodesWithColors, links }
  }, [genresData, minGenreCount, minCoOccurrence])

  if (loading) {
    return (
      <SpotifyStatsLayout
        title="Genre Network"
        description="Loading..."
        currentPage="genres"
      >
        <div className="container mx-auto px-4 py-8">
          <p>Loading...</p>
        </div>
      </SpotifyStatsLayout>
    )
  }

  if (!genresData) {
    return (
      <SpotifyStatsLayout
        title="Genre Network"
        description="No data available"
        currentPage="genres"
      >
        <div className="container mx-auto px-4 py-8">
          <p>No data available</p>
        </div>
      </SpotifyStatsLayout>
    )
  }

  // Get CSS variables for theming
  const getCSSVariable = (variable: string): string => {
    if (typeof window === 'undefined') return ''
    return getComputedStyle(document.documentElement)
      .getPropertyValue(variable)
      .trim()
  }

  const getChartOptions = (): Highcharts.Options => {
    // Guard against undefined networkData
    if (!networkData || !networkData.nodes || !networkData.links) {
      return {
        chart: { type: 'networkgraph', height: 800 },
        title: { text: 'Loading...' },
        series: [{ type: 'networkgraph', data: [] }]
      }
    }

    const primary = getCSSVariable('--primary')
    const muted = getCSSVariable('--muted')
    const mutedForeground = getCSSVariable('--muted-foreground')
    const border = getCSSVariable('--border')
    const card = getCSSVariable('--card')
    const foreground = getCSSVariable('--foreground')

    const primaryColor = primary ? `rgb(${primary})` : '#4f46e5'
    const mutedColor = mutedForeground || '#9ca3af'
    const borderColor = border || '#374151'
    const cardColor = card || '#1f2937'
    const foregroundColor = foreground || '#f9fafb'
    
    // Better contrast colors for network graph
    const nodeBorderColor = '#ffffff' // White border for contrast
    const linkColor = '#93c5fd' // Light blue for links
    const labelColor = '#ffffff' // White for labels

    return {
      chart: {
        type: 'networkgraph',
        backgroundColor: cardColor,
        height: 800,
        style: {
          fontFamily: 'inherit'
        },
        plotBackgroundColor: 'transparent',
        plotBorderColor: borderColor,
        plotBorderWidth: 1
      },
      title: {
        text: 'Genre Co-Occurrence Network',
        style: {
          color: foregroundColor
        }
      },
      subtitle: {
        text: `${networkData.nodes?.length || 0} genres, ${networkData.links?.length || 0} connections`,
        style: {
          color: mutedColor
        }
      },
      plotOptions: {
        networkgraph: {
          keys: ['from', 'to'],
          layoutAlgorithm: {
            enableSimulation: true,
            integration: 'verlet',
            linkLength: 100,
            initialPositions: 'circle'
          },
          link: {
            width: 1.5,
            color: linkColor,
            opacity: 0.4
          },
          draggable: true
        }
      },
      tooltip: {
        backgroundColor: cardColor,
        borderColor: borderColor,
        style: {
          color: foregroundColor
        },
        useHTML: true
      },
      series: [{
        type: 'networkgraph',
        data: (networkData.links || []).map(link => [link.from, link.to]),
        nodes: (networkData.nodes || []).map(node => {
          // Calculate size with more significant differences
          // Use a power function to exaggerate differences
          const minSize = 8
          const maxSize = 40
          const minValue = Math.min(...networkData.nodes.map(n => n.value))
          const maxValue = Math.max(...networkData.nodes.map(n => n.value))
          
          // Normalize to 0-1 range, then apply power curve for more dramatic differences
          const normalized = (node.value - minValue) / (maxValue - minValue || 1)
          const powered = Math.pow(normalized, 0.5) // Square root curve for more gradual but visible differences
          const radius = minSize + (maxSize - minSize) * powered
          
          // Use assigned color from clustering, or default
          const nodeColor = node.color || '#60a5fa'
          
          return {
            id: node.id,
            marker: {
              radius: radius,
              fillColor: nodeColor,
              lineWidth: 2,
              lineColor: nodeBorderColor
            },
            // Store node data for tooltip access
            custom: {
              artistCount: node.artistCount,
              topArtists: node.topArtists
            }
          }
        }),
        tooltip: {
          nodeFormatter: function(this: any) {
            // In network graphs, 'this' refers to the node point
            const pointId = this.id || this.name || (this.options && this.options.id)
            if (!pointId) {
              return '<div style="padding: 4px;">Unknown genre</div>'
            }
            
            // Find the node data from our networkData
            const nodeData = networkData.nodes?.find((n: GenreNode) => n.id === pointId)
            if (nodeData) {
              let tooltip = `<div style="padding: 4px;"><b>${pointId}</b><br/>${nodeData.artistCount} artists`
              if (nodeData.topArtists && nodeData.topArtists.length > 0) {
                tooltip += '<br/><br/><b>Top artists:</b><br/>'
                tooltip += nodeData.topArtists
                  .slice(0, 5)
                  .map((artist, index) => `${index + 1}. ${artist.name} (${artist.play_count} plays)`)
                  .join('<br/>')
              }
              tooltip += '</div>'
              return tooltip
            }
            // Fallback if node data not found
            return `<div style="padding: 4px;"><b>${pointId}</b></div>`
          }
        },
        dataLabels: {
          enabled: true,
          linkFormat: '',
          allowOverlap: true,
          style: {
            color: labelColor,
            fontSize: '11px',
            fontWeight: '600',
            textOutline: '2px rgba(0, 0, 0, 0.8)',
            textShadow: '0 0 3px rgba(0, 0, 0, 0.5)'
          }
        }
      }],
      credits: {
        enabled: false
      }
    }
  }

  return (
    <SpotifyStatsLayout
      title="Genre Network"
      description={`${genresData.metadata.totalArtists.toLocaleString()} artists with minimum ${genresData.metadata.minPlayCount} plays`}
      currentPage="genres"
    >
      <div className="w-full">
        <div className="max-w-7xl mx-auto px-4 mb-6 space-y-4">
          {/* Explanation */}
          <div className="bg-card/40 border rounded-lg p-4 mb-4">
            <h3 className="text-lg font-semibold mb-2">How it works</h3>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong>Nodes (circles)</strong> = Music genres. Larger circles mean more artists have that genre.
              </p>
              <p>
                <strong>Lines (edges)</strong> = Connections between genres that appear together on the same artist. 
                For example, if "indie rock" and "alternative rock" both describe 10 artists, they're connected with a line.
              </p>
              <p>
                <strong>Clusters</strong> = Genres that are closely related tend to group together. 
                You can drag nodes around to explore the network.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 items-center">
            <label className="text-sm text-muted-foreground">
              Min genre count:
              <input
                type="number"
                min="1"
                max="50"
                value={minGenreCount}
                onChange={(e) => setMinGenreCount(parseInt(e.target.value) || 1)}
                className="ml-2 px-2 py-1 border rounded bg-background text-foreground w-16"
              />
              <span className="ml-2 text-xs text-muted-foreground">(how many artists must have this genre)</span>
            </label>
            <label className="text-sm text-muted-foreground">
              Min co-occurrence:
              <input
                type="number"
                min="1"
                max="20"
                value={minCoOccurrence}
                onChange={(e) => setMinCoOccurrence(parseInt(e.target.value) || 1)}
                className="ml-2 px-2 py-1 border rounded bg-background text-foreground w-16"
              />
              <span className="ml-2 text-xs text-muted-foreground">(how many artists must share both genres)</span>
            </label>
          </div>
          <div className="text-sm text-muted-foreground">
            <p>Showing <strong>{networkData?.nodes?.length || 0}</strong> genres with <strong>{networkData?.links?.length || 0}</strong> connections</p>
          </div>
        </div>

        <div className="w-screen -ml-[calc((100vw-100%)/2)] px-4">
          <div className="border rounded-lg overflow-hidden w-full">
            {networkData && networkData.nodes && networkData.nodes.length > 0 ? (
              <div className="w-full" style={{ minHeight: '800px' }}>
                <HighchartsReact
                  key={`${minGenreCount}-${minCoOccurrence}`}
                  ref={chartRef}
                  highcharts={Highcharts}
                  options={getChartOptions()}
                />
              </div>
            ) : (
              <div className="p-8 bg-card/40">
                <p className="text-muted-foreground text-center">
                  No genres found with current filters. Try lowering the minimum genre count.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </SpotifyStatsLayout>
  )
}

