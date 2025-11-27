import { handlers } from '@/lib/auth'
import type { NextRequest } from 'next/server'

// Export handlers as functions - NextAuth v5 pattern
export async function GET(request: NextRequest) {
  return handlers.GET(request)
}

export async function POST(request: NextRequest) {
  return handlers.POST(request)
}

