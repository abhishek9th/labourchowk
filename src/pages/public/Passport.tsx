import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { UserX } from 'lucide-react'
import { useT } from '@/i18n'
import { api } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { PUBLIC_ID_RE } from '@/lib/passport'
import { Container, EmptyState, ErrorState, Skeleton, buttonClass } from '@/components/ui'
import WorkerProfile from '@/pages/public/WorkerProfile'

/**
 * /p/:publicId - the permanent Digital Skill Passport link (QR codes, WhatsApp, printed cards).
 * Works signed out. Missing, malformed and hidden profiles all show the same neutral page, so
 * nothing about a hidden worker is disclosed.
 */
export default function Passport() {
  const { publicId = '' } = useParams()
  const t = useT()
  const id = publicId.trim().toUpperCase()
  const valid = PUBLIC_ID_RE.test(id)
  const q = useQuery({ queryKey: ['resolve', id], queryFn: () => api.resolvePublicId(id), enabled: valid, staleTime: 60_000 })

  if (valid && q.isLoading) return <Container className="max-w-4xl space-y-4 py-8"><Skeleton className="h-40" /><Skeleton className="h-64" /></Container>
  if (valid && q.isError) return <Container className="max-w-4xl py-8"><ErrorState message={friendlyError(q.error, t)} onRetry={() => q.refetch()} /></Container>
  if (!valid || !q.data) {
    return (
      <Container className="max-w-xl py-16">
        <EmptyState icon={UserX} title={t('passport.unavailable.title')} text={t('passport.unavailable.text')}
          action={<Link to="/workers" className={buttonClass('primary')}>{t('nav.findWorkers')}</Link>} />
      </Container>
    )
  }
  return <WorkerProfile workerId={q.data} viaPassport />
}
