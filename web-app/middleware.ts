import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  
  // Force a response header to verify middleware is running (visible in network tab)
  const response = NextResponse.next()
  response.headers.set('X-Middleware-Executed', 'true')
  response.headers.set('X-Middleware-Pathname', pathname)
  
  // Log EVERY request to confirm middleware is running
  // Use multiple log methods to ensure visibility
  console.log('[Middleware] START - Processing request:', {
    pathname,
    method: req.method,
    url: req.url,
    headers: {
      host: req.headers.get('host'),
      cookie: req.headers.get('cookie') ? 'present' : 'missing',
    }
  })
  
  // Also log to stderr (sometimes more visible)
  console.error('[Middleware ERROR LOG] START:', pathname)
  
  // Public routes that don't require authentication
  const publicRoutes = ['/auth/signin', '/auth/signout', '/auth/error', '/api/auth']
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))

  // Skip auth check for public routes
  if (isPublicRoute) {
    console.log('[Middleware] Public route, skipping auth:', pathname)
    console.error('[Middleware ERROR LOG] Public route:', pathname)
    response.headers.set('X-Middleware-Public', 'true')
    return response
  }

  // Check authentication for protected routes
  let session
  try {
    session = await auth()
    console.log('[Middleware] auth() returned:', {
      sessionType: typeof session,
      isNull: session === null,
      isUndefined: session === undefined,
      hasUser: !!session?.user,
      userKeys: session?.user ? Object.keys(session.user) : [],
      userId: session?.user?.id,
      fullSession: JSON.stringify(session, null, 2).substring(0, 500) // First 500 chars for debugging
    })
  } catch (error) {
    console.error('[Middleware] Auth error:', error)
    console.error('[Middleware] Auth error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
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
    console.error('[Middleware ERROR LOG] NOT AUTHENTICATED - Redirecting:', pathname)
    const signInUrl = new URL('/auth/signin', req.url)
    signInUrl.searchParams.set('callbackUrl', pathname)
    const redirect = NextResponse.redirect(signInUrl)
    redirect.headers.set('X-Middleware-Redirect', 'true')
    return redirect
  }
  
  console.log('[Middleware] AUTHENTICATED - Allowing access:', pathname)
  console.error('[Middleware ERROR LOG] AUTHENTICATED:', pathname)
  response.headers.set('X-Middleware-Authenticated', 'true')

  // If authenticated and trying to access sign-in page, redirect to home
  if (pathname.startsWith('/auth/signin')) {
    const redirect = NextResponse.redirect(new URL('/', req.url))
    redirect.headers.set('X-Middleware-Redirect', 'home')
    return redirect
  }

  return response
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

