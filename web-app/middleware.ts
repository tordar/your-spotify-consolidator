import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  
  // Public routes that don't require authentication
  const publicRoutes = ['/auth/signin', '/auth/signout', '/auth/error', '/api/auth']
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))

  // Skip auth check for public routes
  if (isPublicRoute) {
    return NextResponse.next()
  }

  // Check authentication for protected routes
  let session
  try {
    session = await auth()
  } catch (error) {
    console.error('[Middleware] Auth error:', error)
    session = null
  }
  
  // Very strict check - session must exist, have user, and user must have an ID
  // Explicitly check for null/undefined and ensure user.id is a valid string
  const isAuthenticated = (
    session !== null &&
    session !== undefined &&
    typeof session === 'object' &&
    session.user !== null &&
    session.user !== undefined &&
    typeof session.user === 'object' &&
    session.user.id !== null &&
    session.user.id !== undefined &&
    typeof session.user.id === 'string' &&
    session.user.id.length > 0
  )

  // Debug logging
  console.log('[Middleware]', {
    pathname,
    isAuthenticated,
    sessionType: typeof session,
    sessionIsNull: session === null,
    sessionIsUndefined: session === undefined,
    hasUser: !!session?.user,
    userId: session?.user?.id || 'none',
    userIdType: typeof session?.user?.id
  })

  // If not authenticated, ALWAYS redirect to sign-in
  if (!isAuthenticated) {
    console.log('[Middleware] NOT AUTHENTICATED - Redirecting to sign-in:', pathname)
    const signInUrl = new URL('/auth/signin', req.url)
    signInUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(signInUrl)
  }
  
  console.log('[Middleware] AUTHENTICATED - Allowing access:', pathname)

  // If authenticated and trying to access sign-in page, redirect to home
  if (pathname.startsWith('/auth/signin')) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}

