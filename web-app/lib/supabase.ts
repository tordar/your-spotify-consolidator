import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
// Service role key for server-side operations (bypasses RLS)
// Use this for admin operations like creating users in NextAuth callbacks
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Supabase client for public operations (works in Edge runtime)
let supabaseInstance: SupabaseClient | null = null
if (supabaseUrl && supabaseAnonKey) {
  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey)
}

// Supabase client for server-side admin operations (works in Edge runtime)
// This bypasses Row Level Security and is safe to use in server-side code
let supabaseAdminInstance: SupabaseClient | null = null
if (supabaseUrl && supabaseServiceKey) {
  supabaseAdminInstance = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

// Client for use in Server Components and API Routes (public operations)
export const supabase = supabaseInstance

// Client for admin operations (server-side only, bypasses RLS)
export const supabaseAdmin = supabaseAdminInstance

// Client for use in Client Components (browser)
export function createBrowserClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase client not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  return createClient(supabaseUrl, supabaseAnonKey)
}

