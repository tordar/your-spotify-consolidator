import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export default async function middleware(req: NextRequest) {
  const session = await auth()
  const { pathname } = req.nextUrl
  
  // Very strict check - ensure session exists, has user, and user has an ID
  const hasSession = !!session
  const hasUser = !!session?.user
  const hasUserId = !!session?.user?.id
  const isAuthenticated = hasSession && hasUser && hasUserId

  // Public routes
  const publicRoutes = ['/auth/signin', '/auth/signout', '/auth/error', '/api/auth']
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))

  // Debug logging for both dev and prod to diagnose issues
  console.log('[Middleware]', {
    pathname,
    hasSession,
    hasUser,
    hasUserId,
    isAuthenticated,
    isPublicRoute,
    sessionUser: session?.user ? { id: session.user.id, email: session.user.email } : null
  })

  // If not authenticated and trying to access protected route
  if (!isAuthenticated && !isPublicRoute) {
    // Force redirect to sign-in
    const signInUrl = new URL('/auth/signin', req.url)
    signInUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(signInUrl)
  }

  // If authenticated and trying to access sign-in page, redirect to home
  if (isAuthenticated && pathname.startsWith('/auth/signin')) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}

