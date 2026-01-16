'use client'

import { ArrowUpDown, Sparkles } from 'lucide-react'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
} from './ui/dropdown-menu'
import { cn } from '../lib/utils'

export type SortOption = 'plays' | 'duration' | 'songs' | 'plays_30_days' | 'release_date' | 'release_date_old' | 'first_played'

interface SortOptionConfig {
  value: SortOption
  label: string
}

interface FilterSortToggleProps {
  sortBy: SortOption
  onSortChange: (sort: SortOption) => void
  showNewOnly: boolean
  onFilterToggle: (showNewOnly: boolean) => void
  sortOptions?: SortOptionConfig[]
  compact?: boolean
}

const defaultSortOptions: SortOptionConfig[] = [
  { value: 'plays', label: 'Total Plays' },
  { value: 'duration', label: 'Total Duration' },
  { value: 'songs', label: 'Different Songs' },
]

export default function FilterSortToggle({
  sortBy,
  onSortChange,
  showNewOnly,
  onFilterToggle,
  sortOptions = defaultSortOptions,
  compact = false,
}: FilterSortToggleProps) {
  const iconSize = compact ? 'w-3.5 h-3.5' : 'w-4 h-4'
  const buttonHeight = compact ? 'h-7' : 'h-8'
  const buttonPadding = compact ? 'px-2' : 'px-3'
  const containerPadding = compact ? 'p-0.5' : 'p-1'
  const textSize = compact ? 'text-xs' : 'text-sm'
  const iconMargin = compact ? 'mr-1' : 'mr-2'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className={`inline-flex items-center border border-white/10 rounded-md bg-card/40 backdrop-blur-sm ${containerPadding}`}>
          <Button 
            variant="outline" 
            size="sm"
            className={cn(
              `${buttonHeight} ${buttonPadding} border-0 bg-transparent ${textSize}`,
              showNewOnly && 'bg-primary/20 text-primary'
            )}
          >
            <ArrowUpDown className={`${iconSize} ${iconMargin}`} />
            <span className="hidden sm:inline">Filter & Sort</span>
            <span className="sm:hidden">Filter</span>
          </Button>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* Filter Section */}
        <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          Filter
        </DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={showNewOnly}
          onCheckedChange={onFilterToggle}
        >
          New (30d)
        </DropdownMenuCheckboxItem>
        
        <DropdownMenuSeparator />
        
        {/* Sort Section */}
        <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          Sort By
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={sortBy} onValueChange={(value) => onSortChange(value as SortOption)}>
          {sortOptions.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} className="pl-8">
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
