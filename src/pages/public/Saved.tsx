import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Heart } from 'lucide-react'
import { useT } from '@/i18n'
import { api } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { useFavorites } from '@/lib/favorites'
import type { SearchFilters } from '@/lib/types'
import { CardListSkeleton, Container, EmptyState, ErrorState, PageHeading } from '@/components/ui'
import { useSearchLocation } from '@/components/Location'
import { WorkerCard } from '@/components/WorkerCard'
import { useSchedule } from '@/components/useSchedule'

const ALL: SearchFilters = { category: null, q: '', maxDistanceKm: null, minRating: null, minPrice: null, maxPrice: null, minExperience: null, date: null, languages: [], sort: 'rating' }

/** Workers the visitor hearted (stored in this browser). */
export default function Saved() {
  const t = useT()
  const fav = useFavorites()
  const sched = useSchedule()
  const { location } = useSearchLocation()
  const precise = location?.lat != null && location?.lng != null
  const res = useQuery({ queryKey: ['search', ALL, location?.lat, location?.lng, location?.label], queryFn: () => api.searchWorkers(ALL, location), staleTime: 60_000 })
  const data = useMemo(() => (res.data ?? []).filter((w) => fav.has(w.id)), [res.data, fav])
  return (
    <Container className="py-6">
      <PageHeading title={t('saved.title')} subtitle={t('saved.subtitle')} />
      {res.isLoading ? <CardListSkeleton count={3} />
        : res.isError ? <ErrorState message={friendlyError(res.error, t)} onRetry={() => res.refetch()} />
        : data.length === 0 ? <EmptyState icon={Heart} title={t('saved.empty.title')} text={t('saved.empty.text')} />
        : <div className="grid gap-4">{data.map((w) => <WorkerCard key={w.id} w={w} onSchedule={sched.open} hasLocation={precise} />)}</div>}
      {sched.dialog}
    </Container>
  )
}
