import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { SlidersHorizontal, SearchX, X } from 'lucide-react'
import { useT } from '@/i18n'
import { api, MAX_NEARBY_KM } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { todayISO, addDays } from '@/lib/dates'
import { LANGUAGE_OPTIONS } from '@/lib/format'
import type { SearchFilters, SortKey } from '@/lib/types'
import { Button, CardListSkeleton, Chip, Container, EmptyState, ErrorState, Field, Input, Notice, PageHeading, Select, useCategoryName, cx } from '@/components/ui'
import { LocationPicker, useSearchLocation } from '@/components/Location'
import { WorkerCard } from '@/components/WorkerCard'
import { useSchedule } from '@/components/useSchedule'

const SORTS: SortKey[] = ['nearest', 'rating', 'price_low', 'price_high', 'reviews', 'soonest']

const num = (v: string | null): number | null => {
  if (v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function readFilters(p: URLSearchParams, hasLocation: boolean): SearchFilters {
  const sort = p.get('sort') as SortKey | null
  return {
    category: p.get('category'),
    q: p.get('q') ?? '',
    maxDistanceKm: num(p.get('dist')),
    minRating: num(p.get('rating')),
    minPrice: num(p.get('min')),
    maxPrice: num(p.get('max')),
    minExperience: num(p.get('exp')),
    date: p.get('date'),
    languages: (p.get('lang') ?? '').split(',').filter(Boolean),
    sort: sort && SORTS.includes(sort) ? sort : hasLocation ? 'nearest' : 'rating',
  }
}

export default function Workers() {
  const t = useT()
  const catName = useCategoryName()
  const [params, setParams] = useSearchParams()
  const { location, setLocation } = useSearchLocation()
  const sched = useSchedule()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const precise = location?.lat != null && location?.lng != null

  const filters = useMemo(() => readFilters(params, Boolean(location)), [params, location])
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: 5 * 60_000 })

  const results = useQuery({
    queryKey: ['search', filters, location?.lat, location?.lng, location?.label],
    queryFn: () => api.searchWorkers(filters, location),
    placeholderData: (prev) => prev,
  })

  function set(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k)
      else next.set(k, v)
    }
    setParams(next, { replace: true })
  }

  // nobody within MAX_NEARBY_KM -> the API fell back to everyone; say so
  const showingAll = precise && filters.maxDistanceKm === null && !!results.data?.length && results.data.every((w) => w.distance_km !== null && Number(w.distance_km) > MAX_NEARBY_KM)
  const activeCount = [filters.maxDistanceKm, filters.minRating, filters.minPrice, filters.maxPrice, filters.minExperience, filters.date, filters.languages.length ? 1 : null].filter((x) => x !== null).length
  const today = todayISO()
  const selectedCat = categories.data?.find((c) => c.slug === filters.category)

  const filterPanel = (
    <div className="space-y-5">
      <Field label={t('filters.location')}>
        <LocationPicker value={location} onChange={setLocation} idPrefix="wl" compact />
      </Field>

      <Field label={t('filters.distance')} htmlFor="f-dist" hint={!precise ? t('filters.distanceNeedsLocation') : undefined}>
        <Select id="f-dist" value={filters.maxDistanceKm ?? ''} disabled={!precise} onChange={(e) => set({ dist: e.target.value })}>
          <option value="">{t('filters.any')}</option>
          {[2, 5, 10, 15].map((d) => <option key={d} value={d}>{t('filters.withinKm', { n: d })}</option>)}
        </Select>
      </Field>

      <Field label={t('filters.rating')} htmlFor="f-rating">
        <Select id="f-rating" value={filters.minRating ?? ''} onChange={(e) => set({ rating: e.target.value })}>
          <option value="">{t('filters.any')}</option>
          {[3, 3.5, 4, 4.5].map((r) => <option key={r} value={r}>{t('filters.starsUp', { n: r })}</option>)}
        </Select>
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">{t('filters.price')}</legend>
        <div className="flex items-center gap-2">
          <Input type="number" inputMode="numeric" min={0} aria-label={t('filters.min')} placeholder={t('filters.min')} defaultValue={filters.minPrice ?? ''} key={`min${filters.minPrice}`} onBlur={(e) => set({ min: e.target.value })} />
          <span aria-hidden>–</span>
          <Input type="number" inputMode="numeric" min={0} aria-label={t('filters.max')} placeholder={t('filters.max')} defaultValue={filters.maxPrice ?? ''} key={`max${filters.maxPrice}`} onBlur={(e) => set({ max: e.target.value })} />
        </div>
        <p className="mt-1 text-xs text-muted">{t('filters.priceHint')}</p>
      </fieldset>

      <Field label={t('filters.experience')} htmlFor="f-exp">
        <Select id="f-exp" value={filters.minExperience ?? ''} onChange={(e) => set({ exp: e.target.value })}>
          <option value="">{t('filters.any')}</option>
          {[1, 3, 5, 10, 15].map((y) => <option key={y} value={y}>{t('filters.yearsUp', { n: y })}</option>)}
        </Select>
      </Field>

      <Field label={t('filters.availableOn')} htmlFor="f-date">
        <div className="flex gap-2">
          <Input id="f-date" type="date" min={today} max={addDays(today, 59)} value={filters.date ?? ''} onChange={(e) => set({ date: e.target.value && e.target.value >= today ? e.target.value : null })} />
          {filters.date && <Button variant="ghost" aria-label={t('common.clear')} onClick={() => set({ date: null })}><X className="size-4" /></Button>}
        </div>
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">{t('filters.languages')}</legend>
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.slice(0, 9).map((l) => (
            <Chip key={l} active={filters.languages.includes(l)} onClick={() => {
              const next = filters.languages.includes(l) ? filters.languages.filter((x) => x !== l) : [...filters.languages, l]
              set({ lang: next.join(',') })
            }}>{l}</Chip>
          ))}
        </div>
      </fieldset>

      {activeCount > 0 && (
        <Button variant="outline" className="w-full" onClick={() => set({ dist: null, rating: null, min: null, max: null, exp: null, date: null, lang: null })}>
          {t('filters.clear')}
        </Button>
      )}
    </div>
  )

  return (
    <Container className="py-6">
      <PageHeading
        title={selectedCat ? catName(selectedCat) : t('workers.title')}
        subtitle={t('workers.subtitle')}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Input type="search" aria-label={t('workers.searchLabel')} placeholder={t('workers.searchPlaceholder')} defaultValue={filters.q} key={filters.q}
            onKeyDown={(e) => { if (e.key === 'Enter') set({ q: (e.target as HTMLInputElement).value }) }}
            onBlur={(e) => { if (e.target.value !== filters.q) set({ q: e.target.value }) }} />
        </div>
        <Select aria-label={t('workers.category')} className="sm:max-w-56" value={filters.category ?? ''} onChange={(e) => set({ category: e.target.value })}>
          <option value="">{t('workers.allCategories')}</option>
          {categories.data?.map((c) => <option key={c.id} value={c.slug}>{catName(c)}</option>)}
        </Select>
        <Select aria-label={t('workers.sortBy')} className="sm:max-w-56" value={filters.sort} onChange={(e) => set({ sort: e.target.value })}>
          {SORTS.map((s) => <option key={s} value={s}>{t(`sort.${s}`)}</option>)}
        </Select>
        <Button variant="outline" className="lg:hidden" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
          <SlidersHorizontal className="size-4" aria-hidden />{t('filters.title')}{activeCount > 0 && ` (${activeCount})`}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className={cx('rounded-[6px] border border-line bg-card p-4 shadow-card lg:block lg:self-start', filtersOpen ? 'block' : 'hidden')} aria-label={t('filters.title')}>
          <h2 className="mb-4 hidden text-lg font-bold lg:block">{t('filters.title')}</h2>
          {filterPanel}
        </aside>

        <section aria-live="polite" aria-busy={results.isFetching}>
          {!location && <div className="mb-4"><Notice tone="info">{t('workers.noLocation')}</Notice></div>}
          {showingAll && <div className="mb-4"><Notice tone="info">{t('workers.showingAll', { n: MAX_NEARBY_KM })}</Notice></div>}
          {location?.source === 'text' && <div className="mb-4"><Notice tone="warn">{t('workers.localityOnly')}</Notice></div>}

          {results.isLoading ? <CardListSkeleton count={4} />
            : results.isError ? <ErrorState message={friendlyError(results.error, t)} onRetry={() => results.refetch()} />
            : results.data && results.data.length === 0 ? (
              <EmptyState icon={SearchX} title={t('workers.empty.title')} text={t('workers.empty.text')}
                action={activeCount > 0 || filters.q || filters.category ? <Button variant="outline" onClick={() => setParams(new URLSearchParams())}>{t('filters.clear')}</Button> : undefined} />
            ) : (
              <>
                <p className="mb-3 text-sm text-muted">{t('workers.count', { n: results.data?.length ?? 0 })}</p>
                <div className="grid gap-4">
                  {results.data?.map((w) => <WorkerCard key={w.id} w={w} onSchedule={sched.open} hasLocation={precise} filterDate={filters.date} />)}
                </div>
              </>
            )}
        </section>
      </div>
      {sched.dialog}
    </Container>
  )
}
