import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Briefcase, CalendarDays, Camera, Flag, Images, Info, Languages, MapPin, MessageCircle, MessageSquareText, Phone, Share2, UserX } from 'lucide-react'
import { useI18n, useT } from '@/i18n'
import { useAuth } from '@/auth/AuthProvider'
import { api } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { formatDate, monthRange, todayISO } from '@/lib/dates'
import { formatDistance } from '@/lib/geo'
import { formatPrice, UNIT_SHORT } from '@/lib/format'
import { reportSchema } from '@/lib/schemas'
import { passportUrl, telLink, whatsAppLink } from '@/lib/passport'
import type { CalendarDay } from '@/lib/types'
import { Avatar, Badge, Button, Card, Container, DemoBadge, EmptyState, ErrorState, Field, Modal, Notice, Skeleton, Stars, Textarea, VerificationBadge, buttonClass, useCategoryName, useToast } from '@/components/ui'
import { Calendar, CalendarLegend } from '@/components/Calendar'
import { useSearchLocation } from '@/components/Location'
import { useSchedule } from '@/components/useSchedule'
import { PortfolioGallery } from '@/components/PortfolioGallery'

/**
 * Public worker profile. Rendered at /workers/:id (marketplace) and at /p/:publicId (the permanent
 * Digital Skill Passport link, which resolves the id first and passes it in as `workerId`).
 */
export default function WorkerProfile({ workerId, viaPassport = false }: { workerId?: string; viaPassport?: boolean } = {}) {
  const routeParams = useParams()
  const id = workerId ?? routeParams.id ?? ''
  const t = useT()
  const { locale } = useI18n()
  const catName = useCategoryName()
  const { session, profile } = useAuth()
  const { location } = useSearchLocation()
  const sched = useSchedule()
  const toast = useToast()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const today = todayISO()
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m0: Number(today.slice(5, 7)) - 1 }))
  const [reporting, setReporting] = useState(false)

  const worker = useQuery({ queryKey: ['worker', id], queryFn: () => api.worker(id) })
  const reviews = useQuery({ queryKey: ['reviews', id], queryFn: () => api.workerReviews(id), enabled: Boolean(worker.data) })
  const distance = useQuery({ queryKey: ['distance', id, location?.lat, location?.lng], queryFn: () => api.workerDistance(id, location), enabled: Boolean(worker.data) && location?.lat != null })
  const portfolio = useQuery({ queryKey: ['portfolio', id], queryFn: () => api.publicPortfolio(id), enabled: Boolean(worker.data) })
  const contact = useQuery({ queryKey: ['contact', id], queryFn: () => api.publicContact(id), enabled: Boolean(worker.data) })
  const { from, to } = monthRange(ym.y, ym.m0)
  const cal = useQuery({ queryKey: ['calendar', id, from], queryFn: () => api.calendar(id, from, to), enabled: Boolean(worker.data) })
  const byDay = useMemo(() => new Map<string, CalendarDay>((cal.data ?? []).map((d) => [d.day, d])), [cal.data])

  // page metadata for tabs, bookmarks and browsers that read it (social crawlers that do not run JS see the static defaults)
  useEffect(() => {
    const w = worker.data
    if (!w) return
    const prevTitle = document.title
    document.title = `${w.full_name} - ${w.category_name} | Labour Chowk`
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const prevDesc = meta?.content
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta) }
    meta.content = `${w.full_name}, ${w.category_name} in ${w.locality}, ${w.city}. ${w.experience_years} years experience. View skills, previous work and reviews on Labour Chowk.`
    return () => { document.title = prevTitle; if (meta && prevDesc !== undefined) meta.content = prevDesc }
  }, [worker.data])

  // count a profile view once per visit (the server ignores views by the worker themself)
  const viewed = useRef(false)
  useEffect(() => {
    if (worker.data && !viewed.current) { viewed.current = true; void api.recordView(id) }
  }, [worker.data, id])

  // returning from login with ?schedule=1 reopens the booking dialog
  const autoOpened = useRef(false)
  useEffect(() => {
    if (params.get('schedule') && profile && worker.data && !autoOpened.current) {
      autoOpened.current = true
      sched.open(id)
      const p = new URLSearchParams(params); p.delete('schedule'); setParams(p, { replace: true })
    }
  }, [params, profile, worker.data, id, sched, setParams])

  if (worker.isLoading) {
    return <Container className="max-w-4xl space-y-4 py-8"><Skeleton className="h-40" /><Skeleton className="h-64" /></Container>
  }
  if (worker.isError) return <Container className="max-w-4xl py-8"><ErrorState message={friendlyError(worker.error, t)} onRetry={() => worker.refetch()} /></Container>
  const w = worker.data
  if (!w) {
    return (
      <Container className="max-w-4xl py-12">
        <EmptyState icon={UserX} title={t('profile.notFound')} action={<Link to="/workers" className={buttonClass('primary')}>{t('nav.findWorkers')}</Link>} />
      </Container>
    )
  }

  const price = formatPrice(Number(w.indicative_price), w.pricing_unit)
  const dist = formatDistance(distance.data ?? null)
  const isSelf = profile?.id === w.id
  const shareUrl = passportUrl(w.public_id)
  const waLink = contact.data?.allow_whatsapp && contact.data.phone ? whatsAppLink(contact.data.phone, t('contact.whatsappText', { name: w.full_name })) : null
  const callLink = contact.data?.allow_call && contact.data.phone ? telLink(contact.data.phone) : null
  const projectCount = portfolio.data?.length ?? w.portfolio_count

  async function shareProfile() {
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ title: `${w!.full_name} · Labour Chowk`, url: shareUrl }); return } catch (e) { if ((e as DOMException).name === 'AbortError') return }
    }
    try { await navigator.clipboard.writeText(shareUrl); toast.success(t('passport.copied')) } catch { toast.error(t('passport.copyFailed')) }
  }

  return (
    <Container className="max-w-5xl py-6">
      <nav aria-label="Breadcrumb" className="mb-3 text-sm"><Link to="/workers" className="font-semibold text-navy-700 hover:underline">← {t('nav.findWorkers')}</Link></nav>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row">
          <Avatar name={w.full_name} src={w.avatar_url} size={104} />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold text-navy-900">{w.full_name}</h1>
              <VerificationBadge status={w.verification_status} />
              {w.is_demo && <DemoBadge />}
            </div>
            <p className="font-semibold text-navy-700">{catName({ name: w.category_name, name_hi: w.category_name_hi })}</p>
            <Stars value={Number(w.rating_avg)} count={w.review_count} size="lg" />
            <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
              <li className="flex items-center gap-1.5"><Briefcase className="size-4 text-muted" aria-hidden />{t('worker.experienceYears', { n: w.experience_years })}</li>
              <li className="flex items-center gap-1.5"><Languages className="size-4 text-muted" aria-hidden />{w.languages.join(', ') || '—'}</li>
              <li className="flex items-center gap-1.5"><MapPin className="size-4 text-muted" aria-hidden />{w.locality}, {w.city}{dist && <strong> · {dist === '< 1 km' ? t('worker.lessThanKm') : t('worker.away', { d: dist })}</strong>}</li>
            </ul>
            {location?.lat == null && <p className="text-xs text-muted">{t('profile.setLocationForDistance')}</p>}
            {location?.lat != null && !w.has_coordinates && <p className="text-xs text-muted">{t('profile.noWorkerCoords')}</p>}
          </div>
          <div className="sm:w-56">
            <div className="rounded-xl bg-amber-50 p-4">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">{t('profile.indicativePrice')}</p>
              {price ? <p className="text-2xl font-extrabold text-navy-900">{price}</p> : <p className="text-sm text-muted">{t('worker.priceNotSet')}</p>}
              {price && <p className="text-xs text-muted">{t('profile.unit', { u: UNIT_SHORT[w.pricing_unit] })}</p>}
            </div>
            {isSelf ? <Notice>{t('profile.thisIsYou')}</Notice> : (
              <div className="mt-3 grid gap-2">
                <Button variant="accent" size="lg" className="w-full" onClick={() => sched.open(w.id)}>{t('worker.scheduleVisit')}</Button>
                <Button variant="outline" className="w-full" onClick={() => document.getElementById('portfolio')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                  <Images className="size-4" aria-hidden />{t('profile.viewWork', { n: projectCount })}
                </Button>
                {(callLink || waLink) && (
                  <div className="grid gap-2" aria-label={t('contact.title')}>
                    {callLink && <a href={callLink} className={buttonClass('outline', 'md', 'w-full')}><Phone className="size-4" aria-hidden />{t('contact.call')}</a>}
                    {waLink && <a href={waLink} target="_blank" rel="noopener noreferrer" className={buttonClass('outline', 'md', 'w-full')}><MessageCircle className="size-4" aria-hidden />{t('contact.whatsapp')}</a>}
                  </div>
                )}
              </div>
            )}
            <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={shareProfile}><Share2 className="size-4" aria-hidden />{t('passport.share')}</Button>
          </div>
        </div>
        <Notice tone="info" icon={Info}>{t('price.disclaimer')}</Notice>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card as="section" className="p-5">
            <h2 className="mb-2 text-lg font-bold">{t('profile.about')}</h2>
            <p className="whitespace-pre-line text-[15px]">{w.description || t('profile.noDescription')}</p>
            {w.skills.length > 0 && (
              <>
                <h3 className="mt-4 mb-2 text-sm font-bold">{t('profile.skills')}</h3>
                <ul className="flex flex-wrap gap-2">{w.skills.map((s) => <li key={s}><Badge>{s}</Badge></li>)}</ul>
              </>
            )}
            <h3 className="mt-4 mb-1 text-sm font-bold">{t('profile.serviceArea')}</h3>
            <p className="text-sm text-muted">{t('profile.serviceAreaText', { locality: w.locality, city: w.city, km: w.service_radius_km })}</p>
            <p className="mt-1 text-xs text-muted">{t('profile.addressPrivate')}</p>
          </Card>

          <Card as="section" className="p-5">
            <h2 id="portfolio" className="mb-3 flex scroll-mt-20 items-center gap-2 text-lg font-bold"><Camera className="size-5" aria-hidden />{t('portfolio.title')} ({projectCount})</h2>
            {portfolio.isLoading ? <Skeleton className="h-40" />
              : portfolio.isError ? <ErrorState message={friendlyError(portfolio.error, t)} onRetry={() => portfolio.refetch()} />
              : <PortfolioGallery projects={portfolio.data ?? []} />}
            {!!portfolio.data?.length && !isSelf && (
              <div className="mt-4"><Button variant="accent" onClick={() => sched.open(w.id)}>{t('worker.scheduleVisit')}</Button></div>
            )}
          </Card>

          <Card as="section" className="p-5" >
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><MessageSquareText className="size-5" aria-hidden />{t('reviews.title')} ({w.review_count})</h2>
            {reviews.isLoading ? <Skeleton className="h-24" />
              : reviews.isError ? <ErrorState message={friendlyError(reviews.error, t)} onRetry={() => reviews.refetch()} />
              : !reviews.data?.length ? <EmptyState title={t('reviews.empty.title')} text={t('reviews.empty.text')} />
              : (
                <ul className="divide-y divide-line">
                  {reviews.data.map((r) => (
                    <li key={r.id} className="py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{r.reviewer_name}</span>
                        <span className="flex items-center gap-2">{r.is_demo && <DemoBadge />}<span className="text-xs text-muted">{formatDate(r.created_at.slice(0, 10), locale)}</span></span>
                      </div>
                      <Stars value={r.rating} size="sm" />
                      {r.review_text && <p className="mt-1 text-[15px]">{r.review_text}</p>}
                    </li>
                  ))}
                </ul>
              )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card as="section" className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><CalendarDays className="size-5" aria-hidden />{t('profile.availability')}</h2>
            {cal.isError ? <ErrorState message={friendlyError(cal.error, t)} onRetry={() => cal.refetch()} /> : (
              <>
                <Calendar year={ym.y} month0={ym.m0} onMonthChange={(y, m0) => setYm({ y, m0 })} loading={cal.isFetching}
                  info={(iso) => { const d = byDay.get(iso); return d ? { state: d.state, isExtra: d.is_extra_day } : undefined }}
                  clickable={(iso, info) => info?.state === 'available' && iso >= today && !isSelf}
                  onDayClick={() => sched.open(w.id)} />
                <CalendarLegend />
                <p className="mt-2 text-xs text-muted">{t('profile.calendarHint')}</p>
              </>
            )}
          </Card>
          {session && !isSelf && (
            <button onClick={() => setReporting(true)} className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-muted underline-offset-2 hover:underline">
              <Flag className="size-4" aria-hidden />{t('report.link')}
            </button>
          )}
          {!session && <Button variant="outline" onClick={() => nav(`/login?next=${encodeURIComponent(`/workers/${w.id}`)}`)}>{t('profile.loginToBook')}</Button>}
        </div>
      </div>

      {viaPassport && <p className="mt-6 text-center text-xs text-muted">{t('passport.permalink', { url: shareUrl })}</p>}
      {reporting && profile && <ReportDialog workerId={w.id} reporterId={profile.id} onClose={() => setReporting(false)} onDone={() => { setReporting(false); toast.success(t('report.sent')) }} />}
      {sched.dialog}
    </Container>
  )
}

function ReportDialog({ workerId, reporterId, onClose, onDone }: { workerId: string; reporterId: string; onClose: () => void; onDone: () => void }) {
  const t = useT()
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string>()
  const m = useMutation({
    mutationFn: () => api.report('worker', workerId, reason.trim(), reporterId),
    onSuccess: onDone,
    onError: (e) => toast.error(friendlyError(e, t)),
  })
  return (
    <Modal open onClose={onClose} title={t('report.title')}
      footer={<><Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="danger" loading={m.isPending} onClick={() => {
          const p = reportSchema.safeParse({ reason })
          if (!p.success) return setErr(t(p.error.issues[0].message))
          setErr(undefined); m.mutate()
        }}>{t('report.submit')}</Button></>}>
      <Field label={t('report.reason')} htmlFor="rp" error={err} hint={t('report.hint')}>
        <Textarea id="rp" rows={4} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Modal>
  )
}
