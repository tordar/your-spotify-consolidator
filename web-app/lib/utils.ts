import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface DetailedStats {
  stats: {
    yearlyListeningTime: Array<{
      year: string
      totalListeningTimeMs?: number
      totalListeningHours?: number
      playCount?: number
    }>
  }
}

/**
 * Calculate the number of years of listening history from detailed stats
 * @param detailedStats - The detailed stats object containing yearlyListeningTime
 * @returns The number of years (inclusive from first year to current year), or 15 as fallback
 */
export function getYearsOfListeningHistory(detailedStats: DetailedStats | null): number {
  const firstYear = detailedStats?.stats?.yearlyListeningTime?.[0]?.year
  if (!firstYear) return 15 // Fallback to 15 if no data
  const currentYear = new Date().getFullYear()
  return currentYear - parseInt(firstYear) + 1
}
