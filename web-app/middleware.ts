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
  const session = await auth()
  
  // Very strict check - session must exist, have user, and user must have an ID
  const isAuthenticated = !!(
    session && 
    session.user && 
    session.user.id &&
    typeof session.user.id === 'string' &&
    session.user.id.length > 0
  )

  // Debug logging
  console.log('[Middleware]', {
    pathname,
    isAuthenticated,
    hasSession: !!session,
    hasUser: !!session?.user,
    hasUserId: !!session?.user?.id,
    userId: session?.user?.id || 'none'
  })

  // If not authenticated, redirect to sign-in
  if (!isAuthenticated) {
    console.log('[Middleware] Redirecting to sign-in:', pathname)
    const signInUrl = new URL('/auth/signin', req.url)
    signInUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(signInUrl)
  }

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

