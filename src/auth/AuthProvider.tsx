import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { api } from '@/lib/api'
import type { Profile } from '@/lib/types'
import { useI18n } from '@/i18n'

export interface SignUpInput {
  email: string
  password: string
  /** stored as user metadata; the database trigger validates it and builds the profile rows */
  meta: Record<string, unknown>
}

interface AuthValue {
  loading: boolean
  session: Session | null
  profile: Profile | null
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: SignUpInput) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const qc = useQueryClient()
  const { setLang } = useI18n()
  const loadedFor = useRef<string | null>(null)

  const loadAccount = useCallback(async (s: Session | null) => {
    if (!s) {
      loadedFor.current = null
      setProfile(null)
      setIsAdmin(false)
      return
    }
    try {
      const [p, admin] = await Promise.all([api.profile(s.user.id), api.isAdmin().catch(() => false)])
      loadedFor.current = s.user.id
      setProfile(p)
      setIsAdmin(admin)
      if (p?.preferred_language === 'hi' || p?.preferred_language === 'en') setLang(p.preferred_language)
      void api.generateReminders()
    } catch {
      setProfile(null)
    }
  }, [setLang])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let cancelled = false
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return
      setSession(data.session)
      await loadAccount(data.session)
      if (!cancelled) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_OUT') {
        qc.clear()
        void loadAccount(null)
      } else if (event === 'SIGNED_IN' && s && loadedFor.current !== s.user.id) {
        // defer: supabase-js warns against awaiting other client calls inside this callback
        setTimeout(() => { void loadAccount(s) }, 0)
      }
    })
    return () => { cancelled = true; sub.subscription.unsubscribe() }
  }, [loadAccount, qc])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw error
  }, [])

  const signUp = useCallback(async ({ email, password, meta }: SignUpInput) => {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: meta } })
    if (error) throw error
    // Supabase returns an obfuscated user with no identities when the e-mail is already registered
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      throw new Error('User already registered')
    }
    return { needsConfirmation: !data.session }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const refreshProfile = useCallback(async () => {
    if (session) setProfile(await api.profile(session.user.id))
  }, [session])

  const value = useMemo<AuthValue>(
    () => ({ loading, session, profile, isAdmin, signIn, signUp, signOut, refreshProfile }),
    [loading, session, profile, isAdmin, signIn, signUp, signOut, refreshProfile],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext)
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>')
  return v
}

export function homePathFor(profile: Profile | null, isAdmin = false): string {
  if (isAdmin) return '/admin'
  if (profile?.role === 'worker') return '/worker/dashboard'
  if (profile?.role === 'customer') return '/customer/dashboard'
  return '/'
}
