import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, CalendarCheck, CheckCircle2, ClipboardList, Info, LocateFixed, Star, Home as HomeIcon, MessageSquareText } from 'lucide-react'
import { useI18n, useT } from '@/i18n'
import { useAuth } from '@/auth/AuthProvider'
import { api } from '@/lib/api'
import { errorCode, errorDetail, friendlyError } from '@/lib/errors'
import { LOCALITIES, requestBrowserLocation } from '@/lib/geo'
import { formatDate, formatTime, monthRange, todayISO } from '@/lib/dates'
import { profileCompleteness, SUGGESTED_UNITS } from '@/lib/format'
import { workerProfileSchema, type WorkerProfileForm } from '@/lib/schemas'
import { PRICING_UNITS, type CalendarDay, type PricingUnit } from '@/lib/types'
import {
  Badge, Button, Card, CardListSkeleton, Chip, ConfirmDialog, DemoBadge, EmptyState, ErrorState, Field, Input, Notice,
  PageHeading, Select, Skeleton, Stars, Textarea, VerificationBadge, useCategoryName, useToast, cx,
} from '@/components/ui'
import { Calendar, CalendarLegend } from '@/components/Calendar'
import { LanguageChips, PhotoPicker, TagInput, useFieldError } from '@/components/forms'
import { Section, useUnreadCount } from '@/components/Layout'
import { WorkerVisitCard, useWorkerVisits } from '@/components/Bookings'
import { Stat } from '@/pages/customer/Customer'

function useOwnWorker() {
  const { profile } = useAuth()
  return useQuery({ queryKey: ['ownWorker', profile?.id], queryFn: () => api.ownWorker(profile!.id), enabled: Boolean(profile) })
}
function useOwnSkills() {
  const { profile } = useAuth()
  return useQuery({ queryKey: ['ownSkills', profile?.id], queryFn: () => api.ownSkills(profile!.id), enabled: Boolean(profile) })
}

// ------------------------------------------------------------------ overview
export function WorkerDashboard() {
  const t = useT()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const own = useOwnWorker()
  const skills = useOwnSkills()
  const stats = useQuery({ queryKey: ['workerStats'], queryFn: api.stats, staleTime: 10_000 })
  const visits = useWorkerVisits()
  const unread = useUnreadCount()

  const completeness = own.data && profile ? profileCompleteness(profile, own.data, skills.data?.length ?? 0) : null
  const pending = visits.data?.filter((v) => v.status === 'pending' && v.requested_date >= todayISO()) ?? []

  const verify = useMutation({
    mutationFn: api.requestVerification,
    onSuccess: async () => { toast.success(t('worker.verify.requested')); await qc.invalidateQueries({ queryKey: ['ownWorker'] }) },
    onError: (e) => toast.error(friendlyError(e, t)),
  })

  const s = stats.data
  return (
    <>
      <PageHeading title={t('customer.hello', { name: profile?.full_name.split(' ')[0] ?? '' })} subtitle={t('worker.dash.subtitle')} />
      {stats.isError && <div className="mb-4"><ErrorState message={friendlyError(stats.error, t)} onRetry={() => stats.refetch()} /></div>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={t('worker.stat.views')} value={s ? s.profile_views : null} />
        <Stat label={t('worker.stat.pending')} value={s ? s.pending : null} />
        <Stat label={t('worker.stat.upcoming')} value={s ? s.upcoming : null} />
        <Stat label={t('worker.stat.completed')} value={s ? s.completed : null} />
        <Stat label={t('worker.stat.rating')} value={s ? (s.review_count ? Number(s.rating_avg).toFixed(1) : '—') : null} hint={s ? t('reviews.count', { n: s.review_count }) : undefined} />
        <Stat label={t('worker.stat.completeness')} value={completeness === null ? null : `${completeness}%`} hint={completeness !== null && completeness < 100 ? t('worker.stat.completenessHint') : undefined} />
      </div>

      {completeness !== null && completeness < 100 && (
        <div className="mb-6"><Notice tone="warn" icon={Info}>{t('worker.complete.prompt')} <Link className="font-bold underline" to="/worker/profile">{t('worker.complete.cta')}</Link></Notice></div>
      )}
      {!!unread.data && <div className="mb-6"><Notice tone="info">{t('worker.unread', { n: unread.data })} <Link className="font-bold underline" to="/worker/notifications">{t('notif.view')}</Link></Notice></div>}

      <Section title={t('worker.pendingRequests')} action={<Link to="/worker/requests" className="text-sm font-bold text-navy-700 hover:underline">{t('common.viewAll')}</Link>}>
        {visits.isLoading ? <CardListSkeleton count={2} /> : visits.isError ? <ErrorState message={friendlyError(visits.error, t)} onRetry={() => visits.refetch()} />
          : pending.length === 0 ? <EmptyState icon={ClipboardList} title={t('worker.requests.empty')} text={t('worker.requests.emptyText')} />
          : <div className="grid gap-4">{pending.slice(0, 3).map((v) => <WorkerVisitCard key={v.id} v={v} />)}</div>}
      </Section>

      {own.data && (
        <Section title={t('worker.verify.title')}>
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <div className="mb-1 flex items-center gap-2"><VerificationBadge status={own.data.verification_status} />{own.data.verification_status === 'unverified' && <Badge>{t('verification.unverified')}</Badge>}{own.data.verification_status === 'rejected' && <Badge tone="bad">{t('verification.rejected')}</Badge>}</div>
              <p className="max-w-xl text-sm text-muted">{t('worker.verify.text')}</p>
            </div>
            {(own.data.verification_status === 'unverified' || own.data.verification_status === 'rejected') &&
              <Button variant="outline" loading={verify.isPending} onClick={() => verify.mutate()}><BadgeCheck className="size-4" aria-hidden />{t('worker.verify.request')}</Button>}
          </Card>
        </Section>
      )}
    </>
  )
}

// ------------------------------------------------------------------ requests / visits
export function WorkerRequests() {
  const t = useT()
  const q = useWorkerVisits()
  const list = q.data?.filter((v) => v.status === 'pending') ?? []
  return (
    <>
      <PageHeading title={t('nav.requests')} subtitle={t('worker.requests.subtitle')} />
      {q.isLoading ? <CardListSkeleton /> : q.isError ? <ErrorState message={friendlyError(q.error, t)} onRetry={() => q.refetch()} />
        : list.length === 0 ? <EmptyState icon={ClipboardList} title={t('worker.requests.empty')} text={t('worker.requests.emptyText')} />
        : <div className="grid gap-4">{list.map((v) => <WorkerVisitCard key={v.id} v={v} />)}</div>}
    </>
  )
}

export function WorkerBookings() {
  const t = useT()
  const q = useWorkerVisits()
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming')
  const upcoming = q.data?.filter((v) => v.status === 'accepted').sort((a, b) => (a.requested_date + a.start_time).localeCompare(b.requested_date + b.start_time)) ?? []
  const history = q.data?.filter((v) => v.status === 'completed' || v.status === 'declined' || v.status === 'cancelled') ?? []
  const list = tab === 'upcoming' ? upcoming : history
  return (
    <>
      <PageHeading title={t('nav.visits')} subtitle={t('worker.visits.subtitle')} />
      <div className="mb-4 flex gap-2" role="group">
        <Chip active={tab === 'upcoming'} onClick={() => setTab('upcoming')}>{t('worker.visits.upcoming')} ({upcoming.length})</Chip>
        <Chip active={tab === 'history'} onClick={() => setTab('history')}>{t('worker.visits.history')} ({history.length})</Chip>
      </div>
      {q.isLoading ? <CardListSkeleton /> : q.isError ? <ErrorState message={friendlyError(q.error, t)} onRetry={() => q.refetch()} />
        : list.length === 0 ? <EmptyState icon={HomeIcon} title={t(tab === 'upcoming' ? 'worker.visits.emptyUpcoming' : 'worker.visits.emptyHistory')} />
        : <div className="grid gap-4">{list.map((v) => <WorkerVisitCard key={v.id} v={v} />)}</div>}
    </>
  )
}

// ------------------------------------------------------------------ reviews
export function WorkerReviews() {
  const t = useT()
  const { locale } = useI18n()
  const { profile } = useAuth()
  const q = useQuery({ queryKey: ['reviews', profile?.id], queryFn: () => api.ownReviews(profile!.id), enabled: Boolean(profile) })
  const own = useOwnWorker()
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: q.data?.filter((r) => r.rating === n).length ?? 0 }))
  const total = q.data?.length ?? 0
  return (
    <>
      <PageHeading title={t('nav.reviews')} subtitle={t('worker.reviews.subtitle')} />
      <Notice tone="info">{t('worker.reviews.readonly')}</Notice>
      <div className="mt-4" />
      {q.isLoading ? <CardListSkeleton count={2} /> : q.isError ? <ErrorState message={friendlyError(q.error, t)} onRetry={() => q.refetch()} />
        : total === 0 ? <EmptyState icon={MessageSquareText} title={t('worker.reviews.empty')} text={t('worker.reviews.emptyText')} />
        : (
          <div className="space-y-4">
            <Card className="flex flex-wrap items-center gap-6 p-5">
              <div><p className="text-4xl font-extrabold">{Number(own.data?.rating_avg ?? 0).toFixed(1)}</p><Stars value={Number(own.data?.rating_avg ?? 0)} count={own.data?.review_count ?? total} /></div>
              <ul className="min-w-48 flex-1 space-y-1 text-sm">
                {dist.map((d) => (
                  <li key={d.n} className="flex items-center gap-2"><span className="w-4">{d.n}</span><Star className="size-3.5 fill-warn text-warn" aria-hidden />
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-navy-50"><span className="block h-full bg-amber-500" style={{ width: `${(d.c / total) * 100}%` }} /></span><span className="w-6 text-right text-muted">{d.c}</span></li>
                ))}
              </ul>
            </Card>
            <ul className="space-y-3">
              {q.data!.map((r) => (
                <Card as="li" key={r.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{r.reviewer_name}</span>
                    <span className="flex items-center gap-2">{r.is_demo && <DemoBadge />}<span className="text-xs text-muted">{formatDate(r.created_at.slice(0, 10), locale)}</span></span></div>
                  <Stars value={r.rating} size="sm" />
                  {r.review_text && <p className="mt-1 text-[15px]">{r.review_text}</p>}
                </Card>
              ))}
            </ul>
          </div>
        )}
    </>
  )
}

// ------------------------------------------------------------------ profile
export function WorkerProfileEdit() {
  const t = useT()
  const { profile, refreshProfile } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const catName = useCategoryName()
  const fieldError = useFieldError()
  const own = useOwnWorker()
  const skills = useOwnSkills()
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: 5 * 60_000 })
  const [photo, setPhoto] = useState<File | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null | undefined>(undefined)
  const [locating, setLocating] = useState(false)

  const w = own.data
  const { register, control, handleSubmit, watch, reset, formState: { errors, isDirty } } = useForm<WorkerProfileForm>({ resolver: zodResolver(workerProfileSchema) })

  useEffect(() => {
    if (w && profile && skills.data) {
      reset({
        full_name: profile.full_name, phone: profile.phone ?? '', primary_category_id: w.primary_category_id,
        skills: skills.data.map((s) => s.skill_name), experience_years: w.experience_years, indicative_price: Number(w.indicative_price),
        pricing_unit: w.pricing_unit, city: w.city === 'Not set' ? '' : w.city, locality: w.locality === 'Not set' ? '' : w.locality,
        service_radius_km: w.service_radius_km, languages: w.languages, description: w.description ?? '',
      })
      setCoords(w.latitude !== null && w.longitude !== null ? { lat: w.latitude, lng: w.longitude } : null)
    }
  }, [w, profile, skills.data, reset])

  const cat = categories.data?.find((c) => c.id === watch('primary_category_id'))
  const suggested = cat ? SUGGESTED_UNITS[cat.slug] : undefined
  const unitOrder = suggested ? [...suggested, ...PRICING_UNITS.filter((u) => !suggested.includes(u))] : PRICING_UNITS
  const city = watch('city'), locality = watch('locality')

  // typing a known locality gives exact coordinates
  useEffect(() => {
    const m = LOCALITIES.find((l) => l.city.toLowerCase() === (city ?? '').trim().toLowerCase() && l.name.toLowerCase() === (locality ?? '').trim().toLowerCase())
    if (m && isDirty) setCoords({ lat: m.lat, lng: m.lng })
  }, [city, locality, isDirty])

  const save = useMutation({
    mutationFn: async (v: WorkerProfileForm) => {
      let avatar_url = profile!.avatar_url
      if (photo) avatar_url = await api.uploadAvatar(profile!.id, photo)
      await api.updateProfile(profile!.id, { full_name: v.full_name, phone: v.phone, avatar_url })
      await api.updateWorker(profile!.id, {
        primary_category_id: v.primary_category_id, description: v.description || null, experience_years: v.experience_years,
        indicative_price: v.indicative_price, pricing_unit: v.pricing_unit as PricingUnit, city: v.city, locality: v.locality,
        service_radius_km: v.service_radius_km, languages: v.languages,
        latitude: coords?.lat ?? null, longitude: coords?.lng ?? null,
      })
      await api.replaceSkills(profile!.id, v.skills, v.primary_category_id)
    },
    onSuccess: async () => {
      setPhoto(null); toast.success(t('profile.saved'))
      await Promise.all([refreshProfile(), qc.invalidateQueries({ queryKey: ['ownWorker'] }), qc.invalidateQueries({ queryKey: ['ownSkills'] }), qc.invalidateQueries({ queryKey: ['worker'] })])
    },
    onError: (e) => toast.error(friendlyError(e, t)),
  })

  async function locate() {
    setLocating(true)
    const r = await requestBrowserLocation()
    setLocating(false)
    if (r.ok && r.point.lat !== null && r.point.lng !== null) setCoords({ lat: r.point.lat, lng: r.point.lng })
    else toast.error(t(`location.problem.${r.ok ? 'unavailable' : r.reason}`))
  }

  if (own.isLoading || skills.isLoading || !profile) return <CardListSkeleton count={2} />
  if (own.isError) return <ErrorState message={friendlyError(own.error, t)} onRetry={() => own.refetch()} />
  if (!w) return <EmptyState title={t('worker.noProfile')} />

  return (
    <>
      <PageHeading title={t('nav.profile')} subtitle={t('worker.profile.subtitle')} />
      <form noValidate onSubmit={handleSubmit((v) => save.mutate(v))} className="max-w-3xl space-y-5">
        <Card className="space-y-4 p-5">
          <PhotoPicker name={profile.full_name} currentUrl={profile.avatar_url} file={photo} onFile={setPhoto} onError={(m) => toast.error(m)} />
          <Field label={t('auth.fullName')} htmlFor="e-name" required error={fieldError(errors.full_name)}><Input id="e-name" {...register('full_name')} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('auth.phone')} htmlFor="e-phone" required hint={t('auth.phone.workerHint')} error={fieldError(errors.phone)}><Input id="e-phone" type="tel" inputMode="tel" {...register('phone')} /></Field>
            <Field label={t('auth.email')} htmlFor="e-email" hint={t('profile.emailLocked')}><Input id="e-email" value={profile.email ?? ''} disabled readOnly /></Field>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="text-lg font-bold">{t('auth.section.work')}</h2>
          <Field label={t('auth.profession')} htmlFor="e-cat" required error={fieldError(errors.primary_category_id)}>
            <Select id="e-cat" {...register('primary_category_id')}>{categories.data?.map((c) => <option key={c.id} value={c.id}>{catName(c)}</option>)}</Select>
          </Field>
          <Field label={t('auth.skills')} htmlFor="e-skills" hint={t('auth.skillsHint')}>
            <Controller control={control} name="skills" render={({ field }) => <TagInput id="e-skills" value={field.value ?? []} onChange={field.onChange} placeholder={t('auth.skillsPlaceholder')} />} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('auth.experience')} htmlFor="e-exp" required error={fieldError(errors.experience_years)}><Input id="e-exp" type="number" inputMode="numeric" min={0} max={70} {...register('experience_years', { valueAsNumber: true })} /></Field>
            <Field label={t('auth.price')} htmlFor="e-price" error={fieldError(errors.indicative_price)}><Input id="e-price" type="number" inputMode="numeric" min={0} {...register('indicative_price', { valueAsNumber: true })} /></Field>
            <Field label={t('auth.priceUnit')} htmlFor="e-unit"><Select id="e-unit" {...register('pricing_unit')}>{unitOrder.map((u) => <option key={u} value={u}>{t(`unit.${u}`)}</option>)}</Select></Field>
          </div>
          <p className="-mt-2 text-xs text-muted">{t('price.disclaimer')}</p>
          <Field label={t('auth.languages')} required error={fieldError(errors.languages)}>
            <Controller control={control} name="languages" render={({ field }) => <LanguageChips value={field.value ?? []} onChange={field.onChange} />} />
          </Field>
          <Field label={t('auth.description')} htmlFor="e-desc" hint={t('auth.descriptionHint')} error={fieldError(errors.description)}><Textarea id="e-desc" rows={4} maxLength={1000} {...register('description')} /></Field>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="text-lg font-bold">{t('auth.section.area')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('auth.city')} htmlFor="e-city" required error={fieldError(errors.city)}><Input id="e-city" list="e-city-list" {...register('city')} /><datalist id="e-city-list">{[...new Set(LOCALITIES.map((l) => l.city))].map((c) => <option key={c} value={c} />)}</datalist></Field>
            <Field label={t('auth.locality')} htmlFor="e-loc" required error={fieldError(errors.locality)}><Input id="e-loc" list="e-loc-list" {...register('locality')} /><datalist id="e-loc-list">{LOCALITIES.map((l) => <option key={l.name} value={l.name} />)}</datalist></Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" loading={locating} onClick={locate}><LocateFixed className="size-4" aria-hidden />{t('auth.useMyLocation')}</Button>
            {coords ? <span className="text-sm font-medium text-ok">✓ {t('worker.coords.saved')}</span> : <span className="text-sm text-muted">{t('auth.coords.none')}</span>}
          </div>
          <Field label={t('auth.radius')} htmlFor="e-radius" hint={t('auth.radiusHint')} error={fieldError(errors.service_radius_km)}><Input id="e-radius" type="number" inputMode="numeric" min={1} max={100} className="max-w-40" {...register('service_radius_km', { valueAsNumber: true })} /></Field>
          <Notice>{t('auth.privacyNote')}</Notice>
        </Card>

        <div className="sticky bottom-20 z-10 flex gap-3 md:static"><Button type="submit" size="lg" loading={save.isPending} disabled={!isDirty && !photo && coords === undefined}>{t('common.save')}</Button></div>
      </form>
    </>
  )
}

// ------------------------------------------------------------------ availability
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0]
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export function WorkerAvailability() {
  const t = useT()
  const { locale } = useI18n()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const own = useOwnWorker()
  const visits = useWorkerVisits()
  const today = todayISO()
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m0: Number(today.slice(5, 7)) - 1 }))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [range, setRange] = useState({ from: '', to: '' })
  const [confirmBlock, setConfirmBlock] = useState(false)
  const { from, to } = monthRange(ym.y, ym.m0)
  const cal = useQuery({ queryKey: ['calendar', profile?.id, from], queryFn: () => api.calendar(profile!.id, from, to), enabled: Boolean(profile) })
  const byDay = useMemo(() => new Map<string, CalendarDay>((cal.data ?? []).map((d) => [d.day, d])), [cal.data])

  const booked = useMemo(() => {
    const m = new Map<string, number>()
    visits.data?.filter((v) => v.status === 'accepted').forEach((v) => m.set(v.requested_date, (m.get(v.requested_date) ?? 0) + 1))
    return m
  }, [visits.data])
  const pendingByDay = useMemo(() => {
    const m = new Map<string, number>()
    visits.data?.filter((v) => v.status === 'pending').forEach((v) => m.set(v.requested_date, (m.get(v.requested_date) ?? 0) + 1))
    return m
  }, [visits.data])

  const sel = [...selected].sort()
  const acceptedConflicts = sel.filter((d) => booked.get(d))
  const pendingAffected = sel.reduce((n, d) => n + (pendingByDay.get(d) ?? 0), 0)

  function describeError(e: unknown) {
    if (errorCode(e) === 'ERR_HAS_ACCEPTED_VISITS') {
      const d = errorDetail(e)
      return t('err.ERR_HAS_ACCEPTED_VISITS_AT', { d: d ? formatDate(d, locale) : '' })
    }
    return friendlyError(e, t)
  }

  const apply = useMutation({
    mutationFn: async (action: 'block' | 'unblock') => {
      const results = { declined: 0 }
      if (action === 'block') {
        results.declined += (await api.setAvailability(sel, 'blocked')).auto_declined
      } else {
        // blocked / extra-open days go back to the weekly schedule; regular days off are opened as extra working days
        const back = sel.filter((d) => byDay.get(d)?.state === 'blocked' || byDay.get(d)?.is_extra_day)
        const open = sel.filter((d) => byDay.get(d)?.state === 'off')
        if (back.length) await api.setAvailability(back, 'default')
        if (open.length) await api.setAvailability(open, 'available')
      }
      return results
    },
    onSuccess: async (r, action) => {
      toast.success(action === 'block' ? t('avail.blocked', { n: sel.length }) : t('avail.unblocked', { n: sel.length }))
      if (r.declined) toast.info(t('avail.autoDeclined', { n: r.declined }))
      setSelected(new Set()); setConfirmBlock(false)
      await Promise.all(['calendar', 'slots', 'workerVisits', 'workerStats', 'search'].map((k) => qc.invalidateQueries({ queryKey: [k] })))
    },
    onError: (e) => { toast.error(describeError(e)); setConfirmBlock(false) },
  })

  function toggle(iso: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(iso)) n.delete(iso); else n.add(iso); return n })
  }
  function addRange() {
    if (!range.from || !range.to || range.to < range.from) return toast.error(t('avail.rangeInvalid'))
    const next = new Set(selected)
    for (let d = range.from < today ? today : range.from, n = 0; d <= range.to && n < 62; n++) { next.add(d); const dt = new Date(d + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() + 1); d = dt.toISOString().slice(0, 10) }
    setSelected(next)
  }

  const upcoming = (visits.data ?? []).filter((v) => v.status === 'accepted' && v.requested_date >= today).sort((a, b) => (a.requested_date + a.start_time).localeCompare(b.requested_date + b.start_time))

  return (
    <>
      <PageHeading title={t('nav.availability')} subtitle={t('avail.subtitle')} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card className="p-4 sm:p-5">
            {cal.isError ? <ErrorState message={friendlyError(cal.error, t)} onRetry={() => cal.refetch()} /> : (
              <>
                <Calendar year={ym.y} month0={ym.m0} onMonthChange={(y, m0) => setYm({ y, m0 })} loading={cal.isFetching}
                  info={(iso) => { const d = byDay.get(iso); return d ? { state: d.state, isExtra: d.is_extra_day, booked: booked.get(iso) } : undefined }}
                  selected={selected} clickable={(iso) => iso >= today} onDayClick={toggle} />
                <CalendarLegend worker />
              </>
            )}
            <p className="mt-3 text-sm text-muted">{t('avail.help')}</p>

            <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
              <Field label={t('avail.from')} htmlFor="a-from"><Input id="a-from" type="date" min={today} value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} /></Field>
              <Field label={t('avail.to')} htmlFor="a-to"><Input id="a-to" type="date" min={range.from || today} value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} /></Field>
              <Button variant="outline" onClick={addRange}>{t('avail.selectRange')}</Button>
            </div>

            <div className={cx('mt-4 rounded-xl border p-3', sel.length ? 'border-navy-900/30 bg-navy-50' : 'border-line')} aria-live="polite">
              <p className="text-sm font-semibold">{sel.length ? t('avail.selected', { n: sel.length }) : t('avail.noneSelected')}</p>
              {acceptedConflicts.length > 0 && <p className="mt-1 text-sm text-bad">{t('avail.hasAccepted', { d: acceptedConflicts.map((d) => formatDate(d, locale)).join(', ') })}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="danger" disabled={!sel.length || acceptedConflicts.length > 0} loading={apply.isPending && apply.variables === 'block'}
                  onClick={() => (pendingAffected > 0 ? setConfirmBlock(true) : apply.mutate('block'))}>{t('avail.markUnavailable')}</Button>
                <Button variant="primary" disabled={!sel.length} loading={apply.isPending && apply.variables === 'unblock'} onClick={() => apply.mutate('unblock')}>{t('avail.markAvailable')}</Button>
                <Button variant="ghost" disabled={!sel.length} onClick={() => setSelected(new Set())}>{t('common.clear')}</Button>
              </div>
            </div>
          </Card>

          <Section title={t('avail.upcomingVisits')}>
            {visits.isLoading ? <Skeleton className="h-20" /> : upcoming.length === 0 ? <EmptyState icon={CalendarCheck} title={t('worker.visits.emptyUpcoming')} />
              : (
                <ul className="space-y-2">
                  {upcoming.map((v) => (
                    <Card as="li" key={v.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                      <span className="font-bold">{formatDate(v.requested_date, locale)} · {formatTime(v.start_time)}–{formatTime(v.end_time)}</span>
                      <span>{v.customer_name} · {v.customer_locality}</span>
                    </Card>
                  ))}
                </ul>
              )}
          </Section>
        </div>

        {own.data && <ScheduleCard worker={own.data} />}
      </div>

      <ConfirmDialog open={confirmBlock} danger title={t('avail.confirm.title')} message={t('avail.confirm.message', { n: pendingAffected })}
        confirmLabel={t('avail.markUnavailable')} onCancel={() => setConfirmBlock(false)} onConfirm={() => apply.mutateAsync('block')} />
    </>
  )
}

function ScheduleCard({ worker }: { worker: NonNullable<ReturnType<typeof useOwnWorker>['data']> }) {
  const t = useT()
  const { locale } = useI18n()
  const qc = useQueryClient()
  const toast = useToast()
  const [days, setDays] = useState<number[]>(worker.working_days)
  const [start, setStart] = useState(worker.work_start.slice(0, 5))
  const [end, setEnd] = useState(worker.work_end.slice(0, 5))
  const [slot, setSlot] = useState(worker.slot_minutes)

  const save = useMutation({
    mutationFn: () => api.setSchedule(days, start, end, slot),
    onSuccess: async (r) => {
      toast.success(t('avail.scheduleSaved'))
      if (r.auto_declined) toast.info(t('avail.autoDeclined', { n: r.auto_declined }))
      await Promise.all(['ownWorker', 'calendar', 'slots', 'workerVisits', 'search'].map((k) => qc.invalidateQueries({ queryKey: [k] })))
    },
    onError: (e) => {
      if (errorCode(e) === 'ERR_HAS_ACCEPTED_VISITS') { const d = errorDetail(e); toast.error(t('err.ERR_HAS_ACCEPTED_VISITS_AT', { d: d ? formatDate(d, locale) : '' })) }
      else toast.error(friendlyError(e, t))
    },
  })
  const invalid = days.length === 0 || end <= start

  return (
    <Card className="h-fit space-y-4 p-5">
      <h2 className="text-lg font-bold">{t('avail.schedule.title')}</h2>
      <p className="text-sm text-muted">{t('avail.schedule.text')}</p>
      <div role="group" aria-label={t('avail.workingDays')} className="flex flex-wrap gap-2">
        {WEEKDAYS.map((d) => <Chip key={d} active={days.includes(d)} onClick={() => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))}>{t(`day.${DAY_KEYS[d]}`)}</Chip>)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('avail.startTime')} htmlFor="s-start"><Input id="s-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label={t('avail.endTime')} htmlFor="s-end"><Input id="s-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <Field label={t('avail.slotLength')} htmlFor="s-slot">
        <Select id="s-slot" value={slot} onChange={(e) => setSlot(Number(e.target.value))}>
          {[30, 60, 90, 120].map((m) => <option key={m} value={m}>{t('avail.minutes', { n: m })}</option>)}
        </Select>
      </Field>
      {invalid && <Notice tone="warn">{days.length === 0 ? t('avail.err.noDays') : t('avail.err.hours')}</Notice>}
      <Button loading={save.isPending} disabled={invalid} onClick={() => save.mutate()}><CheckCircle2 className="size-4" aria-hidden />{t('avail.saveSchedule')}</Button>
    </Card>
  )
}

