import { handlers } from '@/lib/auth'
import type { NextRequest } from 'next/server'

// Export both GET and POST handlers from NextAuth
export async function GET(request: NextRequest) {
  return handlers.GET(request)
}

export async function POST(request: NextRequest) {
  return handlers.POST(request)
}

