import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export default async function middleware(req: NextRequest) {
  const session = await auth()
  const { pathname } = req.nextUrl
  const isAuthenticated = !!session

  // Public routes
  const publicRoutes = ['/auth/signin', '/auth/signout', '/auth/error']
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))

  // If not authenticated and trying to access protected route
  if (!isAuthenticated && !isPublicRoute) {
    const signInUrl = new URL('/auth/signin', req.url)
    signInUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(signInUrl)
  }

  if (isAuthenticated && pathname.startsWith('/auth/signin')) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}

