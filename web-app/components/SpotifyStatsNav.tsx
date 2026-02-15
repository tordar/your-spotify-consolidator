'use client'

import { useRef, useEffect, useState } from 'react'
import Link from 'next/link'
import { Disc, Music2, Users, BarChart3, Search, X, Network, Settings } from 'lucide-react'
import { useSpotifyStats } from './SpotifyStatsContext'

type SpotifyStatsPage = 'albums' | 'songs' | 'artists' | 'stats' | 'genres' | 'settings'

interface SpotifyStatsNavProps {
  currentPage: SpotifyStatsPage
  compact?: boolean
  largeLinks?: boolean
}

export default function SpotifyStatsNav({ currentPage, compact = false, largeLinks = false }: SpotifyStatsNavProps) {
  const { searchTerm, setSearchTerm } = useSpotifyStats()
  const showSearch = currentPage !== 'stats' && currentPage !== 'genres' && currentPage !== 'settings'
  const navRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const [searchWidth, setSearchWidth] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (!compact && navRef.current && searchRef.current) {
      const updateWidth = () => {
        const navWidth = navRef.current?.offsetWidth
        if (navWidth) {
          setSearchWidth(navWidth)
        }
      }
      
      updateWidth()
      window.addEventListener('resize', updateWidth)
      return () => window.removeEventListener('resize', updateWidth)
    }
  }, [compact])

  const getLinkClasses = (page: SpotifyStatsPage, isFirst: boolean) => {
    const baseClasses = compact
      ? 'flex items-center gap-1 px-1.5 sm:px-2 h-7 text-xs transition-colors whitespace-nowrap'
      : largeLinks
        ? 'flex items-center gap-4 px-5 py-4 text-xl transition-colors'
        : 'flex items-center gap-2 px-3 py-2 text-sm transition-colors'
    const isActive = currentPage === page
    
    if (isActive) {
      const activeBorder = largeLinks ? '' : ' border border-primary/30'
      const activeBg = largeLinks ? '' : ' bg-primary/20'
      return `${baseClasses}${activeBg} text-primary${activeBorder}`
    }
    
    const borderClasses = isFirst 
      ? '' 
      : compact
        ? 'border-l border-white/10'
        : largeLinks
          ? ''
          : 'border-t sm:border-t-0 sm:border-l border-white/10'
    
    const hoverBg = largeLinks ? '' : ' hover:bg-surface-800/30'
    return `${baseClasses} text-muted-foreground hover:text-foreground${hoverBg} ${borderClasses}`
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
        <div className="flex items-center border border-white/10 rounded-md bg-card/40 backdrop-blur-sm overflow-hidden flex-shrink-0 p-0.5 whitespace-nowrap">
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
            className={getLinkClasses('genres', false)}
          >
            <Network className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Genres</span>
          </Link>
          <Link
            href="/settings"
            className={`${getLinkClasses('settings', false)} rounded-r-md`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Settings</span>
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

  const iconSize = largeLinks ? 'w-7 h-7' : 'w-4 h-4'
  return (
    <div className={`space-y-4 w-full max-w-full min-w-0 mx-auto ${largeLinks ? 'max-w-md' : 'max-w-2xl'}`}>
      <div className="flex flex-col items-center space-y-4 min-w-0">
        <div className="flex justify-center w-full sm:w-auto min-w-0">
          <div ref={navRef} className={`flex flex-col sm:flex-row w-full sm:w-auto overflow-hidden min-w-0 ${largeLinks ? 'sm:flex-col' : 'border border-white/10 rounded-md bg-card/40 backdrop-blur-sm'}`}>
            <Link
              href="/"
              className={`${getLinkClasses('stats', true)} ${largeLinks ? '' : 'sm:rounded-l-md'}`}
            >
              <BarChart3 className={iconSize} />
              Stats
            </Link>
            <Link
              href="/top-albums"
              className={getLinkClasses('albums', false)}
            >
              <Disc className={iconSize} />
              Albums
            </Link>
            <Link
              href="/top-songs"
              className={getLinkClasses('songs', false)}
            >
              <Music2 className={iconSize} />
              Songs
            </Link>
            <Link
              href="/top-artists"
              className={getLinkClasses('artists', false)}
            >
              <Users className={iconSize} />
              Artists
            </Link>
            <Link
              href="/genres"
              className={getLinkClasses('genres', false)}
            >
              <Network className={iconSize} />
              Genres
            </Link>
            <Link
              href="/settings"
              className={`${getLinkClasses('settings', false)} ${largeLinks ? '' : 'sm:rounded-r-md'}`}
            >
              <Settings className={iconSize} />
              Settings
            </Link>
          </div>
        </div>
        
        {showSearch && (
          <div className="flex justify-center w-full sm:w-auto min-w-0 px-0">
            <div ref={searchRef} className={`relative backdrop-blur-sm bg-card/40 border border-white/10 rounded-md min-w-0 ${largeLinks ? 'w-full' : 'w-full sm:w-auto'}`} style={!largeLinks && searchWidth ? { width: `${searchWidth}px` } : undefined}>
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4 z-10 flex-shrink-0" />
              <input
                type="text"
                placeholder={getSearchPlaceholder()}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full min-w-0 pl-10 pr-10 py-2 bg-transparent text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 transition-all rounded-md box-border"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors z-10 flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

