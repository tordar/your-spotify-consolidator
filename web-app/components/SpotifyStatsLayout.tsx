import { ReactNode } from 'react'
import SpotifyStatsNav from './SpotifyStatsNav'

type SpotifyStatsPage = 'albums' | 'songs' | 'artists' | 'stats' | 'profile'

interface SpotifyStatsLayoutProps {
  children: ReactNode
  title: string
  description: string
  currentPage: SpotifyStatsPage
  additionalControls?: ReactNode
}

export default function SpotifyStatsLayout({
  children,
  title,
  description,
  currentPage,
  additionalControls
}: SpotifyStatsLayoutProps) {
  return (
    <div className="min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">{title}</h1>
          <p className="text-muted-foreground mb-6">
            {description}
          </p>
          
          {/* Controls */}
          <div className="space-y-4">
            {/* Navigation */}
            <div className="flex justify-center items-center">
              <SpotifyStatsNav currentPage={currentPage} />
            </div>
            
            {/* Additional Controls */}
            {additionalControls && (
              <div className="flex justify-center items-center">
                {additionalControls}
              </div>
            )}
          </div>
        </div>
        
        {/* Content */}
        {children}
      </div>
    </div>
  )
}

