import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Spotify from 'next-auth/providers/spotify'
import { supabaseAdmin } from './supabase'

// Generate UUID that works in Edge runtime
function generateUUID(): string {
  // Use crypto.randomUUID() if available (Node 14.17+, Edge runtime)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Using Supabase client directly (works in Edge runtime!)
// Saves users/accounts to Supabase PostgreSQL
// Using JWT sessions for Edge runtime compatibility (middleware)

// Debug: Log environment variables (remove in production)
if (process.env.NODE_ENV === 'development') {
  console.log('NextAuth Config - AUTH_URL:', process.env.AUTH_URL)
  console.log('NextAuth Config - NEXTAUTH_URL:', process.env.NEXTAUTH_URL)
  console.log('NextAuth Config - AUTH_TRUST_HOST:', process.env.AUTH_TRUST_HOST)
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true, // Trust the host header (needed for Vercel and similar)
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Spotify({
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'user-read-recently-played user-read-email user-read-private',
        },
      },
    }),
  ],
  pages: {
    signIn: '/auth/signin',
    signOut: '/auth/signout',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt', // JWT works in Edge runtime (middleware)
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!supabaseAdmin) {
        console.error('Supabase admin client not configured')
        return false
      }

      try {
        let userId: string

        // For Spotify OAuth, we need to link to existing user (must be logged in with Google first)
        if (account?.provider === 'spotify') {
          // Spotify OAuth should only be used for linking, not primary login
          // Try to find user by email (Spotify should provide email)
          if (user.email) {
            const { data: existingUser } = await supabaseAdmin
              .from('users')
              .select('id')
              .eq('email', user.email)
              .single()

            if (existingUser) {
              userId = existingUser.id
            } else {
              console.error('Spotify OAuth: No existing user found with email:', user.email)
              console.error('Please ensure you are logged in with Google first and that your Spotify email matches your Google email.')
              return false
            }
          } else {
            console.error('Spotify OAuth: No email provided by Spotify. Cannot link account.')
            return false
          }
        } else {
          // Google OAuth - primary login method
          // Check if user already exists
          const { data: existingUser } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('email', user.email)
            .single()

          if (existingUser) {
            // User exists, use their ID
            userId = existingUser.id
            
            // Update user info
            await supabaseAdmin
              .from('users')
              .update({
                name: user.name,
                image: user.image,
                updated_at: new Date().toISOString(),
              })
              .eq('id', userId)
          } else {
            // Create new user
            userId = generateUUID()
            const { error: userError } = await supabaseAdmin
              .from('users')
              .insert({
                id: userId,
                email: user.email,
                name: user.name,
                image: user.image,
                email_verified: (user as any).emailVerified ? new Date().toISOString() : null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })

            if (userError) {
              console.error('Error creating user:', userError)
              return false
            }
          }
        }

        // Save or update account (OAuth provider info)
        if (account) {
          // Check if account already exists for this user
          const { data: existingAccount } = await supabaseAdmin
            .from('accounts')
            .select('id')
            .eq('user_id', userId)
            .eq('provider', account.provider)
            .single()

          const accountData = {
            user_id: userId,
            type: account.type,
            provider: account.provider,
            provider_account_id: account.providerAccountId,
            refresh_token: account.refresh_token,
            access_token: account.access_token,
            expires_at: account.expires_at,
            token_type: account.token_type,
            scope: account.scope,
            id_token: account.id_token,
            session_state: account.session_state,
          }

          let accountError
          if (existingAccount) {
            // Update existing account
            const { error } = await supabaseAdmin
              .from('accounts')
              .update(accountData)
              .eq('id', existingAccount.id)
            accountError = error
          } else {
            // Create new account
            const { error } = await supabaseAdmin
              .from('accounts')
              .insert({
                id: generateUUID(),
                ...accountData,
              })
            accountError = error
          }

          if (accountError) {
            console.error('Error saving account:', accountError)
            // Don't fail sign-in if account save fails
          }
        }

        // Update user object with database ID
        user.id = userId
        return true
      } catch (error) {
        console.error('Error in signIn callback:', error)
        return false
      }
    },
    async jwt({ token, user, account }) {
      // Store user ID in token
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      // Add user ID to session
      if (session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
})

