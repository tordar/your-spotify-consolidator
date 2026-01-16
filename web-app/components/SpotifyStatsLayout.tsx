'use client'

import { ReactNode, useEffect, useState, useRef } from 'react'
import { Menu } from 'lucide-react'
import SpotifyStatsNav from './SpotifyStatsNav'
import { Button } from './ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from './ui/sheet'

type SpotifyStatsPage = 'albums' | 'songs' | 'artists' | 'stats' | 'genres' | 'settings'

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
  const [showSticky, setShowSticky] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const headerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || window.pageYOffset
      // Show sticky navbar when scrolled down 100px
      setShowSticky(scrollY > 100)
    }

    // Initial check
    handleScroll()

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="min-h-screen py-8">
      {/* Mobile Sidebar using Sheet */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent 
          side="right" 
          className="w-80 max-w-[85vw] md:hidden"
          onClick={(e) => {
            // Close menu when clicking on navigation links or view toggle buttons
            const target = e.target as HTMLElement
            
            // Close on navigation links
            if (target.closest('a')) {
              setMobileMenuOpen(false)
              return
            }
            
            // Close on ViewToggle buttons (they change view immediately)
            const button = target.closest('button')
            if (button) {
              // Check if it's a ViewToggle button (has aria-label with "view")
              const isViewToggle = button.getAttribute('aria-label')?.toLowerCase().includes('view')
              
              // Check if it's inside a dropdown menu content (should not close)
              const isInDropdown = button.closest('[role="menu"]') || 
                                   button.closest('[role="menuitem"]') || 
                                   button.closest('[role="menuitemradio"]') ||
                                   button.closest('[data-radix-popper-content-wrapper]')
              
              // Close on ViewToggle buttons, but keep open for dropdown interactions
              if (isViewToggle && !isInDropdown) {
                setMobileMenuOpen(false)
              }
              
              // Also close on dropdown menu item selection (after they choose an option)
              if (isInDropdown && (button.closest('[role="menuitem"]') || button.closest('[role="menuitemradio"]'))) {
                // Small delay to allow the selection to register
                setTimeout(() => setMobileMenuOpen(false), 100)
              }
            }
          }}
        >
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            {/* Navigation - Full Width */}
            <div>
              <SpotifyStatsNav currentPage={currentPage} />
            </div>

            {/* Additional Controls */}
            {additionalControls && (
              <div className="space-y-4">
                {additionalControls}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Sticky Navbar */}
      <div
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-out ${
          showSticky
            ? 'translate-y-0 opacity-100'
            : '-translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="bg-card/95 backdrop-blur-md border-b border-white/10 shadow-lg">
          <div className="max-w-7xl mx-auto px-2 sm:px-4">
            <div className="flex items-center justify-between gap-2 sm:gap-4 py-2 sm:py-3">
              {/* Mobile Menu Button - Only on mobile, hidden when menu is open */}
              {!mobileMenuOpen && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobileMenuOpen(true)}
                  className="mobile-menu-button md:hidden h-8 w-8 p-0 flex-shrink-0"
                >
                  <Menu className="w-5 h-5" />
                </Button>
              )}

              {/* Condensed Title - Hidden on very small screens, shown on md+ */}
              <div className="flex-shrink-0 min-w-0 hidden md:block">
                <h2 className="text-base sm:text-lg font-bold truncate max-w-[150px] sm:max-w-none">{title}</h2>
              </div>

              {/* Navigation - Compact Mode - Hidden on mobile, shown on desktop */}
              <div className="hidden md:flex flex-1 items-center justify-center min-w-0">
                <SpotifyStatsNav currentPage={currentPage} compact={true} />
              </div>

              {/* Additional Controls - Hidden on mobile, shown on desktop */}
              {additionalControls && (
                <div className="hidden md:flex flex-shrink-0 items-center gap-1 sm:gap-2">
                  {additionalControls}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div ref={headerRef} className="text-center mb-4">
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

