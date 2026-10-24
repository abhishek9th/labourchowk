import { LoadingScreen } from '@/components/LoadingScreen'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Button, Container, ErrorState } from '@/components/ui'
import { useT } from '@/i18n'
import type { Role } from '@/lib/types'
import { homePathFor, useAuth } from './AuthProvider'

function FullPageSpinner() {
  return <LoadingScreen />
}

/** Signed in but the account rows could not be loaded (deleted user, network error ...). */
function AccountProblem() {
  const t = useT()
  const { refreshProfile, signOut } = useAuth()
  return (
    <Container className="grid max-w-md gap-3 py-16">
      <ErrorState message={t('auth.noProfile')} onRetry={() => void refreshProfile()} />
      <Button variant="outline" onClick={() => void signOut()}>{t('nav.logout')}</Button>
    </Container>
  )
}

/**
 * Route guard. These redirects are a UX convenience; the real enforcement is in the database
 * (RLS policies and RPC checks), so bypassing the UI gives no access.
 */
export function RequireRole({ role, children }: { role: Role | 'admin'; children: ReactNode }) {
  const { loading, session, profile, isAdmin } = useAuth()
  const loc = useLocation()
  if (loading) return <FullPageSpinner />
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (!profile) return <AccountProblem />
  if (role === 'admin') return isAdmin ? <>{children}</> : <Navigate to={homePathFor(profile)} replace />
  if (profile.role !== role) return <Navigate to={homePathFor(profile, isAdmin)} replace />
  return <>{children}</>
}

/** Keeps signed-in users away from /login and /register. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { loading, session, profile, isAdmin } = useAuth()
  const params = new URLSearchParams(useLocation().search)
  if (loading) return <FullPageSpinner />
  if (session && profile) {
    const next = params.get('next')
    return <Navigate to={next && next.startsWith('/') && !next.startsWith('//') ? next : homePathFor(profile, isAdmin)} replace />
  }
  return <>{children}</>
}
