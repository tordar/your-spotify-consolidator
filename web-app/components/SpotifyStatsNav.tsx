'use client'

import Link from 'next/link'
import { Disc, Music2, Users, BarChart3, Search, X, Network } from 'lucide-react'
import { useSpotifyStats } from './SpotifyStatsContext'

type SpotifyStatsPage = 'albums' | 'songs' | 'artists' | 'stats' | 'genres'

interface SpotifyStatsNavProps {
  currentPage: SpotifyStatsPage
  compact?: boolean
}

export default function SpotifyStatsNav({ currentPage, compact = false }: SpotifyStatsNavProps) {
  const { searchTerm, setSearchTerm } = useSpotifyStats()
  const showSearch = currentPage !== 'stats' && currentPage !== 'genres'

  const getLinkClasses = (page: SpotifyStatsPage, isFirst: boolean) => {
    const baseClasses = compact
      ? 'flex items-center gap-1.5 px-2 h-7 text-xs transition-colors'
      : 'flex items-center gap-2 px-3 py-2 text-sm transition-colors'
    const isActive = currentPage === page
    
    if (isActive) {
      return `${baseClasses} bg-primary/20 text-primary border border-primary/30`
    }
    
    const borderClasses = isFirst 
      ? '' 
      : compact
        ? 'border-l border-white/10'
        : 'border-t sm:border-t-0 sm:border-l border-white/10'
    
    return `${baseClasses} text-muted-foreground hover:text-foreground hover:bg-surface-800/30 ${borderClasses}`
  }

  const getSearchPlaceholder = () => {
    switch (currentPage) {
      case 'songs':
        return 'Search songs, albums, or artists...'
      case 'albums':
        return 'Search albums or artists...'
      case 'artists':
        return 'Search artists...'
      default:
        return 'Search...'
    }
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
        {/* Navigation Links - Compact Horizontal */}
        <div className="flex items-center border border-white/10 rounded-md bg-card/40 backdrop-blur-sm overflow-hidden flex-shrink-0 p-0.5">
          <Link
            href="/"
            className={`${getLinkClasses('stats', true)} rounded-l-md`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Stats</span>
          </Link>
          <Link
            href="/top-albums"
            className={getLinkClasses('albums', false)}
          >
            <Disc className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Albums</span>
          </Link>
          <Link
            href="/top-songs"
            className={getLinkClasses('songs', false)}
          >
            <Music2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Songs</span>
          </Link>
          <Link
            href="/top-artists"
            className={getLinkClasses('artists', false)}
          >
            <Users className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Artists</span>
          </Link>
          <Link
            href="/genres"
            className={`${getLinkClasses('genres', false)} rounded-r-md`}
          >
            <Network className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Genres</span>
          </Link>
        </div>
        
        {/* Search Bar - Compact Inline */}
        {showSearch && (
          <div className="relative flex-1 min-w-0 max-w-[120px] sm:max-w-xs">
            <div className="relative backdrop-blur-sm bg-card/40 border border-white/10 rounded-md p-0.5">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground w-3.5 h-3.5 z-10" />
              <input
                type="text"
                placeholder={getSearchPlaceholder()}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-7 sm:pl-8 pr-7 sm:pr-8 h-7 text-xs sm:text-sm bg-transparent text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 transition-all rounded-md placeholder:text-muted-foreground"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors z-10"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 w-full max-w-md mx-auto">
      <div className="flex justify-center">
        <div className="flex flex-col sm:flex-row border border-white/10 rounded-md bg-card/40 backdrop-blur-sm w-full sm:w-fit overflow-hidden">
          <Link
            href="/"
            className={`${getLinkClasses('stats', true)} sm:rounded-l-md`}
          >
            <BarChart3 className="w-4 h-4" />
            Stats
          </Link>
          <Link
            href="/top-albums"
            className={getLinkClasses('albums', false)}
          >
            <Disc className="w-4 h-4" />
            Albums
          </Link>
          <Link
            href="/top-songs"
            className={getLinkClasses('songs', false)}
          >
            <Music2 className="w-4 h-4" />
            Songs
          </Link>
          <Link
            href="/top-artists"
            className={getLinkClasses('artists', false)}
          >
            <Users className="w-4 h-4" />
            Artists
          </Link>
          <Link
            href="/genres"
            className={`${getLinkClasses('genres', false)} sm:rounded-r-md`}
          >
            <Network className="w-4 h-4" />
            Genres
          </Link>
        </div>
      </div>
      
      {showSearch && (
        <div className="relative w-full">
          <div className="relative backdrop-blur-sm bg-card/40 border border-white/10 rounded-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4 z-10" />
            <input
              type="text"
              placeholder={getSearchPlaceholder()}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-10 py-2 bg-transparent text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 transition-all rounded-md"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors z-10"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

