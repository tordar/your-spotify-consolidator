'use client'

import { LayoutGrid, List, PieChart } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '../lib/utils'

interface ViewToggleProps {
  viewMode: 'grid' | 'list' | 'chart'
  onViewModeChange: (mode: 'grid' | 'list' | 'chart') => void
  showChart?: boolean
  compact?: boolean
}

export default function ViewToggle({ viewMode, onViewModeChange, showChart = true, compact = false }: ViewToggleProps) {
  const iconSize = compact ? 'w-3.5 h-3.5' : 'w-4 h-4'
  const buttonHeight = compact ? 'h-7' : 'h-8'
  const buttonPadding = compact ? 'px-2' : 'px-3'
  const containerPadding = compact ? 'p-0.5' : 'p-1'

  return (
    <div className={`inline-flex items-center border border-white/10 rounded-md bg-card/40 backdrop-blur-sm ${containerPadding}`}>
      <Button
        variant={viewMode === 'grid' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onViewModeChange('grid')}
        className={cn(
          `${buttonHeight} ${buttonPadding}`,
          viewMode === 'grid' && 'bg-primary/20 text-primary border border-primary/30'
        )}
        aria-label="Grid view"
      >
        <LayoutGrid className={iconSize} />
      </Button>
      <Button
        variant={viewMode === 'list' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onViewModeChange('list')}
        className={cn(
          `${buttonHeight} ${buttonPadding}`,
          viewMode === 'list' && 'bg-primary/20 text-primary border border-primary/30'
        )}
        aria-label="List view"
      >
        <List className={iconSize} />
      </Button>
      {showChart && (
        <Button
          variant={viewMode === 'chart' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onViewModeChange('chart')}
          className={cn(
            `${buttonHeight} ${buttonPadding}`,
            viewMode === 'chart' && 'bg-primary/20 text-primary border border-primary/30'
          )}
          aria-label="Chart view"
        >
          <PieChart className={iconSize} />
        </Button>
      )}
    </div>
  )
}

