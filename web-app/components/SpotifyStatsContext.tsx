'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

type ViewMode = 'grid' | 'list' | 'chart' | 'yearly'

interface SpotifyStatsContextType {
  searchTerm: string
  setSearchTerm: (term: string) => void
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
}

const SpotifyStatsContext = createContext<SpotifyStatsContextType | undefined>(undefined)

export function SpotifyStatsProvider({ children }: { children: ReactNode }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    // Initialize based on screen size, but default to grid for SSR
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768 ? 'list' : 'grid'
    }
    return 'grid'
  })

  return (
    <SpotifyStatsContext.Provider value={{ searchTerm, setSearchTerm, viewMode, setViewMode }}>
      {children}
    </SpotifyStatsContext.Provider>
  )
}

export function useSpotifyStats() {
  const context = useContext(SpotifyStatsContext)
  if (context === undefined) {
    throw new Error('useSpotifyStats must be used within a SpotifyStatsProvider')
  }
  return context
}

