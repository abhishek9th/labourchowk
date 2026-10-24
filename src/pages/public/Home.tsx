import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight, BadgeCheck, Briefcase, CalendarCheck, ChevronDown, EyeOff, HeartHandshake,
  IndianRupee, LocateFixed, Lock, MapPin, Search, ShieldCheck, Star, UserCheck, Users,
} from 'lucide-react'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { LOCALITIES, localityLabel, requestBrowserLocation } from '@/lib/geo'
import { buttonClass, Container, Skeleton, useToast } from '@/components/ui'
import { useSearchLocation } from '@/components/Location'


export default function Home() {
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const toast = useToast()
  const { location, setLocation } = useSearchLocation()
  const [category, setCategory] = useState('')
  const [where, setWhere] = useState(location && location.source !== 'gps' ? location.label : '')
  const [locating, setLocating] = useState(false)
  const whereRef = useRef<HTMLInputElement>(null)
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: 5 * 60_000 })
  const counts = useQuery({ queryKey: ['categoryCounts'], queryFn: api.workerCountsByCategory, staleTime: 60_000 })
  const catName = (c: { name: string; name_hi: string | null }) => (lang === 'hi' && c.name_hi ? c.name_hi : c.name)

  function applyTypedLocation() {
    const label = where.trim()
    if (!label) return
    const preset = LOCALITIES.find((l) => localityLabel(l).toLowerCase() === label.toLowerCase() || l.name.toLowerCase() === label.toLowerCase())
    if (preset) setLocation({ lat: preset.lat, lng: preset.lng, label: localityLabel(preset), source: 'preset' })
    else if (location?.label !== label) setLocation({ lat: null, lng: null, label, source: 'text' })
  }
  function search() {
    applyTypedLocation()
    nav(`/workers${category ? `?category=${category}` : ''}`)
  }
  async function locate() {
    setLocating(true)
    const r = await requestBrowserLocation()
    setLocating(false)
    if (r.ok) { setLocation({ ...r.point, label: t('location.current') }); setWhere(t('location.current')) }
    else toast.error(t(`location.problem.${r.reason}`))
  }

  const features = [
    { icon: IndianRupee, label: t('h.f1') },
    { icon: Star, label: t('h.f2') },
    { icon: CalendarCheck, label: t('h.f3') },
  ]
  const chips = [
    { icon: Users, color: '#5b5fe0', label: t('h.chip1') },
    { icon: BadgeCheck, color: '#277abc', label: t('h.chip2') },
    { icon: Star, color: '#f5a623', label: t('h.chip3') },
    { icon: ShieldCheck, color: '#ff5a4e', label: t('h.chip4') },
  ]
  const steps = useMemo(() => [
    { icon: Search, title: t('how.1.title'), text: t('how.1.text') },
    { icon: CalendarCheck, title: t('how.2.title'), text: t('how.2.text') },
    { icon: HeartHandshake, title: t('how.3.title'), text: t('how.3.text') },
  ], [t])

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className="relative isolate overflow-hidden bg-elevated bg-cover bg-center" style={{ backgroundImage: 'linear-gradient(var(--hero-overlay), var(--hero-overlay)), url(/img/hero-bg.jpg)' }}>
        <div className="mx-auto grid w-full max-w-[1600px] items-center gap-8 px-5 py-10 sm:px-8 lg:min-h-[483px] lg:grid-cols-[1fr_minmax(440px,532px)] lg:gap-x-[15px] lg:pt-[61px] lg:pb-[22px] xl:grid-cols-[1fr_minmax(460px,532px)_77px] xl:px-20">
          <div className="relative z-20">
            <p className="mb-6 inline-flex items-center gap-2 rounded-md bg-surface border border-line px-4 py-2 text-[15px] font-semibold text-navy-900">
              <Users className="size-[18px]" aria-hidden />{t('home.eyebrow').replace(/\.$/, '')}
            </p>
            <h1 className="text-[clamp(2.75rem,4.6vw,4.5rem)] leading-[1.02] font-extrabold tracking-[-0.03em] text-navy-900">
              {t('h.l1')}<br /><span className="text-muted">{t('h.l2')}</span> {t('h.l3')}
            </h1>
            <p className="mt-6 max-w-[520px] text-[19px] leading-[1.55] text-muted">{t('h.text')}</p>
            <ul className="mt-9 flex flex-wrap gap-x-9 gap-y-4">
              {features.map((f) => (
                <li key={f.label} className="flex items-center gap-3">
                  <span className="grid size-[52px] place-items-center rounded-full bg-elevated"><f.icon className="size-6 text-muted" aria-hidden /></span>
                  <span className="max-w-[90px] text-[15px] leading-tight font-bold text-navy-900">{f.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative z-10">
            {/* the worker photo sits behind the card, to its left */}
            <img src="/img/hero-worker.jpg" alt="" aria-hidden width={292} height={483}
              className="pointer-events-none absolute right-[calc(100%-6px)] bottom-[-22px] z-0 hidden h-[483px] w-[292px] max-w-none object-cover xl:block"
              style={{ WebkitMaskImage: 'linear-gradient(90deg, transparent 0, #000 70px)', maskImage: 'linear-gradient(90deg, transparent 0, #000 70px)' }} />
            <form onSubmit={(e) => { e.preventDefault(); search() }} aria-label={t('h.card.title')}
              className="relative z-10 rounded-[7px] bg-card px-7 py-6 shadow-[0_10px_40px_rgba(11,25,45,0.12)] ring-1 ring-line">
              <h2 className="text-[25px] leading-tight font-extrabold text-navy-900">{t('h.card.title')}</h2>
              <p className="mt-1 text-[13.5px] text-muted">{t('h.card.sub')}</p>

              <label htmlFor="hero-cat" className="mt-5 mb-2 block text-[15px] font-bold text-navy-900">{t('h.card.need')}</label>
              <div className="relative">
                <Briefcase className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-navy-900" aria-hidden />
                <select id="hero-cat" value={category} onChange={(e) => setCategory(e.target.value)}
                  className="h-12 w-full cursor-pointer appearance-none rounded-xl border border-line bg-card pr-11 pl-12 text-[16px] text-navy-900">
                  <option value="">{t('workers.allCategories')}</option>
                  {categories.data?.map((c) => <option key={c.id} value={c.slug}>{catName(c)}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-navy-900" aria-hidden />
              </div>

              <label htmlFor="hero-where" className="mt-4 mb-2 block text-[15px] font-bold text-navy-900">{t('h.card.where')}</label>
              <div className="flex gap-3">
                <div className="relative min-w-0 flex-1">
                  <MapPin className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-navy-900" aria-hidden />
                  <input id="hero-where" ref={whereRef} list="hero-places" value={where} onChange={(e) => setWhere(e.target.value)} onBlur={applyTypedLocation}
                    placeholder={t('h.card.placeholder')} maxLength={120} autoComplete="off"
                    className="h-12 w-full rounded-xl border border-line bg-card pr-3 pl-12 text-[16px] text-navy-900 placeholder:text-faint" />
                  <datalist id="hero-places">{LOCALITIES.map((l) => <option key={l.name + l.city} value={localityLabel(l)} />)}</datalist>
                </div>
                <button type="button" onClick={locate} disabled={locating}
                  className="inline-flex h-12 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-line bg-card px-4 text-[15px] font-semibold text-navy-900 hover:bg-navy-50 disabled:opacity-60">
                  <LocateFixed className="size-5" aria-hidden /><span className="hidden sm:inline">{t('h.card.useLocation')}</span><span className="sm:hidden">GPS</span>
                </button>
              </div>
              <button type="button" onClick={() => whereRef.current?.focus()} className="mt-2.5 cursor-pointer text-[14px] font-medium text-brand-link underline underline-offset-2">{t('h.card.manual')}</button>

              <button type="submit" className="mt-4 inline-flex h-[54px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl bg-amber-500 text-[19px] font-bold text-navy-950 shadow-[0_6px_16px_rgba(254,169,16,0.35)] transition-colors hover:bg-primary-hover">
                <Search className="size-6" aria-hidden />{t('h.card.search')}
              </button>
            </form>
          </div>

          {/* floating note + trust chips (large screens) */}
          <div className="relative z-10 hidden self-stretch xl:block">
            <div className="absolute top-[-6px] left-3 w-[100px] -rotate-6 text-center text-[19px] leading-[1.15] text-ink" style={{ fontFamily: 'Caveat, "Segoe Print", "Bradley Hand", cursive' }}>
              {t('h.note')}
              <svg viewBox="0 0 70 45" className="mt-1 ml-[-18px] h-10 w-16 rotate-6" fill="none" stroke="#2b3445" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M62 4C50 8 30 14 12 38" /><path d="M10 28l2 11 11-3" /></svg>
            </div>
            <ul className="absolute bottom-[-22px] left-0 w-[77px] rounded-xl bg-card p-2 shadow-[0_6px_24px_rgba(11,25,45,0.12)] ring-1 ring-line">
              {chips.map((c) => (
                <li key={c.label} className="flex items-center gap-1.5 py-1.5 text-[9.5px] leading-tight font-semibold text-body">
                  <span className="grid size-[18px] shrink-0 place-items-center rounded-full" style={{ backgroundColor: `${c.color}1f` }}><c.icon className="size-[11px]" style={{ color: c.color }} aria-hidden /></span>{c.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ popular services */}
      <Container className="mt-12 max-w-[1600px] xl:px-20">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[32px] leading-tight font-extrabold tracking-tight text-navy-900">{t('h.svc.title')}</h2>
            <p className="mt-1 text-[15.5px] text-muted">{t('h.svc.sub')}</p>
          </div>
          <Link to="/services" className="inline-flex shrink-0 items-center gap-1.5 text-[15.5px] font-semibold text-brand-link hover:underline">{t('h.svc.all')}<ArrowRight className="size-4" aria-hidden /></Link>
        </div>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:gap-5 xl:grid-cols-6">
          {categories.isLoading ? Array.from({ length: 12 }, (_, i) => <li key={i}><Skeleton className="h-[186px] !rounded-[6px]" /></li>)
            : categories.data?.map((c) => {
              const n = counts.data?.[c.slug]
              return (
                <li key={c.id}>
                  <Link to={`/workers?category=${c.slug}`} className="group block overflow-hidden rounded-[6px] bg-card shadow-[0_2px_10px_rgba(11,25,45,0.08)] ring-1 ring-line transition-shadow hover:shadow-[0_8px_24px_rgba(11,25,45,0.14)]">
                    <div className="h-[108px] overflow-hidden bg-navy-50">
                      <img src={`/img/cat-${c.slug}.jpg`} alt="" loading="lazy" width={218} height={108} className="size-full object-cover transition-transform duration-300 group-hover:scale-105" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                    </div>
                    <div className="flex min-h-[72px] items-center px-3.5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[15.5px] leading-[1.2] font-bold text-ink">{catName(c)}</p>
                        <p className="mt-1 text-[13px] text-muted">{counts.isLoading ? '…' : n ? t('h.svc.count', { n }) : t('h.svc.none')}</p>
                      </div>
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-elevated text-muted transition-colors group-hover:bg-amber-500 group-hover:text-navy-950"><ArrowRight className="size-4" aria-hidden /></span>
                    </div>
                  </Link>
                </li>
              )
            })}
        </ul>
      </Container>

      {/* ------------------------------------------------------------ how it works */}
      <Container className="mt-16">
        <h2 className="text-[28px] font-extrabold tracking-tight text-navy-900">{t('how.title')}</h2>
        <ol className="mt-5 grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-[6px] border border-line bg-card p-5 shadow-card">
              <div className="mb-3 flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-amber-500 font-extrabold text-navy-950">{i + 1}</span>
                <s.icon className="size-6 text-navy-700" aria-hidden />
              </div>
              <h3 className="text-lg font-bold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 rounded-xl border border-line bg-card p-4 text-sm font-medium text-body">{t('how.visitNote')}</p>
      </Container>

      {/* ------------------------------------------------------------ benefits */}
      <Container className="mt-16 grid gap-4 md:grid-cols-2">
        <div className="rounded-[6px] border border-line bg-card p-6 text-ink">
          <h2 className="mb-4 text-xl font-extrabold">{t('benefits.customers.title')}</h2>
          <ul className="space-y-3 text-sm">
            {[t('benefits.c1'), t('benefits.c2'), t('benefits.c3'), t('benefits.c4')].map((x) => (
              <li key={x} className="flex gap-3"><BadgeCheck className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />{x}</li>
            ))}
          </ul>
          <Link to="/workers" className={buttonClass('accent', 'md', 'mt-6')}>{t('home.search.button')}</Link>
        </div>
        <div className="rounded-[6px] border border-line bg-card p-6 shadow-card">
          <h2 className="mb-4 text-xl font-extrabold text-navy-900">{t('benefits.workers.title')}</h2>
          <ul className="space-y-3 text-sm">
            {[t('benefits.w1'), t('benefits.w2'), t('benefits.w3'), t('benefits.w4')].map((x) => (
              <li key={x} className="flex gap-3"><BadgeCheck className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />{x}</li>
            ))}
          </ul>
          <Link to="/register?role=worker" className={buttonClass('primary', 'md', 'mt-6')}>{t('footer.joinAsWorker')}</Link>
        </div>
      </Container>

      {/* ------------------------------------------------------------ trust & safety */}
      <Container className="mt-16">
        <h2 className="text-[28px] font-extrabold tracking-tight text-navy-900">{t('trust.title')}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t('trust.text')}</p>
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[{ icon: UserCheck, k: 'trust.1' }, { icon: Star, k: 'trust.2' }, { icon: EyeOff, k: 'trust.3' }, { icon: Lock, k: 'trust.4' }].map((x) => (
            <li key={x.k} className="rounded-[6px] border border-line bg-card p-5 shadow-card">
              <x.icon className="mb-3 size-7 text-navy-700" aria-hidden />
              <h3 className="font-bold">{t(`${x.k}.title`)}</h3>
              <p className="mt-1 text-sm text-muted">{t(`${x.k}.text`)}</p>
            </li>
          ))}
        </ul>
      </Container>
    </>
  )
}
