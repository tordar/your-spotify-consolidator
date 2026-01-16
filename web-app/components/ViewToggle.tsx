'use client'

import { LayoutGrid, List, PieChart } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '../lib/utils'

interface ViewToggleProps {
  viewMode: 'grid' | 'list' | 'chart'
  onViewModeChange: (mode: 'grid' | 'list' | 'chart') => void
  showChart?: boolean
}

export default function ViewToggle({ viewMode, onViewModeChange, showChart = true }: ViewToggleProps) {
  return (
    <div className="inline-flex items-center border border-white/10 rounded-md bg-card/40 backdrop-blur-sm p-1">
      <Button
        variant={viewMode === 'grid' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onViewModeChange('grid')}
        className={cn(
          'h-8 px-3',
          viewMode === 'grid' && 'bg-primary/20 text-primary border border-primary/30'
        )}
        aria-label="Grid view"
      >
        <LayoutGrid className="w-4 h-4" />
      </Button>
      <Button
        variant={viewMode === 'list' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onViewModeChange('list')}
        className={cn(
          'h-8 px-3',
          viewMode === 'list' && 'bg-primary/20 text-primary border border-primary/30'
        )}
        aria-label="List view"
      >
        <List className="w-4 h-4" />
      </Button>
      {showChart && (
        <Button
          variant={viewMode === 'chart' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onViewModeChange('chart')}
          className={cn(
            'h-8 px-3',
            viewMode === 'chart' && 'bg-primary/20 text-primary border border-primary/30'
          )}
          aria-label="Chart view"
        >
          <PieChart className="w-4 h-4" />
        </Button>
      )}
    </div>
  )
}

