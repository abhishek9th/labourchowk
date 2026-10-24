import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** False until .env.local is filled in; the app then shows a setup screen instead of crashing. */
export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('YOUR-PROJECT'))

// Only the public anon key is used in the browser; all access is governed by RLS and RPC checks.
export const supabase = createClient(
  isSupabaseConfigured ? url! : 'http://localhost:54321',
  isSupabaseConfigured ? anonKey! : 'not-configured',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
)
