import Link from 'next/link'
import { Disc, Music2, Users, BarChart3, User } from 'lucide-react'

type SpotifyStatsPage = 'albums' | 'songs' | 'artists' | 'stats' | 'profile'

interface SpotifyStatsNavProps {
  currentPage: SpotifyStatsPage
}

export default function SpotifyStatsNav({ currentPage }: SpotifyStatsNavProps) {
  const getLinkClasses = (page: SpotifyStatsPage, isFirst: boolean) => {
    const baseClasses = 'flex items-center gap-2 px-3 py-2 text-sm transition-colors'
    const isActive = currentPage === page
    
    if (isActive) {
      return `${baseClasses} bg-primary text-primary-foreground`
    }
    
    const borderClasses = isFirst 
      ? '' 
      : 'border-t sm:border-t-0 sm:border-l border-input'
    
    return `${baseClasses} text-muted-foreground hover:text-foreground ${borderClasses}`
  }

  return (
    <div className="flex flex-col sm:flex-row border border-input rounded-md bg-background w-full sm:w-fit overflow-hidden">
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
        href="/profile"
        className={`${getLinkClasses('profile', false)} sm:rounded-r-md`}
      >
        <User className="w-4 h-4" />
        Profile
      </Link>
    </div>
  )
}

