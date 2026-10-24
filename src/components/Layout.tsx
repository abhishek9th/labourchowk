import { useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, CalendarDays, Camera, ChevronDown, ClipboardList, Heart, Globe, QrCode as QrIcon, Home, LayoutDashboard, LogOut, Menu, Search, ShieldCheck, Star, User, X, Tags, Users, type LucideIcon } from 'lucide-react'
import { LANGUAGES, useI18n, useT } from '@/i18n'
import { useAuth, homePathFor } from '@/auth/AuthProvider'
import { api } from '@/lib/api'
import { buttonClass, Container, cx } from '@/components/ui'
import { ThemeToggle } from '@/components/ThemeToggle'

export function Logo({ light }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
      <img src="/logo-mark.png" alt="" className="size-9 shrink-0 rounded-xl" width={36} height={36} />
      <span className={cx('text-xl font-extrabold tracking-tight', light ? 'text-white' : 'text-navy-900')}>
        Labour <span className="text-brand">Chowk</span>
      </span>
    </span>
  )
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang } = useI18n()
  const { session, profile } = useAuth()
  return (
    <label className={cx('relative inline-flex items-center', className)}>
      <Globe className="pointer-events-none absolute left-3 size-[18px] text-navy-900" aria-hidden />
      <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-navy-900" aria-hidden />
      <span className="sr-only">Language</span>
      <select
        value={lang}
        onChange={(e) => {
          const code = e.target.value as 'en' | 'hi'
          setLang(code)
          if (session && profile) void api.updateProfile(profile.id, { preferred_language: code }).catch(() => undefined)
        }}
        className="h-11 cursor-pointer appearance-none rounded-xl border-0 bg-elevated pr-8 pl-10 text-[15px] font-semibold text-navy-900"
      >
        {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
    </label>
  )
}

export function useUnreadCount() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['unread', session?.user.id],
    queryFn: api.unreadCount,
    enabled: Boolean(session),
    refetchInterval: 45_000,
    staleTime: 15_000,
  })
}

// ------------------------------------------------------------------ public site
export function PublicLayout() {
  const t = useT()
  const { session, profile, isAdmin, signOut } = useAuth()
  const unread = useUnreadCount()
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const dash = homePathFor(profile, isAdmin)
  const notifPath = profile?.role === 'worker' ? '/worker/notifications' : '/customer/notifications'

  const links = [
    { to: '/services', label: t('nav.services') },
    { to: '/workers', label: t('nav.findWorkers') },
    { to: '/saved', label: t('nav.saved') },
    { to: '/how-it-works', label: t('nav.howItWorks') },
    { to: '/services', label: t('nav.forBusinesses'), wide: true },
    { to: '/how-it-works#help', label: t('nav.help'), wide: true },
  ]

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-amber-500 focus:px-4 focus:py-2 focus:font-bold">
        {t('nav.skip')}
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
        <Container className="flex h-[65px] max-w-[1600px] items-center justify-between gap-3 xl:px-20">
          <Link to="/" aria-label="Labour Chowk"><Logo /></Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => cx('rounded-lg px-3 py-2 text-[15.5px] font-medium whitespace-nowrap text-body hover:text-navy-900', 'wide' in l && l.wide && 'hidden xl:block', isActive && 'font-semibold text-navy-900')}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <ThemeToggle />
            <LanguageSwitcher />
            {session && profile ? (
              <>
                <Link to={notifPath} aria-label={t('nav.notifications')} className="relative grid size-10 place-items-center rounded-lg hover:bg-navy-50">
                  <Bell className="size-5" aria-hidden />
                  {!!unread.data && <span className="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full bg-amber-500 px-1 text-[11px] font-bold text-navy-950">{unread.data}</span>}
                </Link>
                <Link to={dash} className={buttonClass('primary')}>{t('nav.dashboard')}</Link>
                <button onClick={async () => { nav('/', { replace: true }); await signOut() }} className={buttonClass('outline')}>{t('nav.logout')}</button>
              </>
            ) : (
              <>
                <Link to="/login" className={buttonClass('outline')}>{t('nav.login')}</Link>
                <Link to="/register" className={buttonClass('accent')}>{t('nav.register')}</Link>
              </>
            )}
          </div>
          <button className="grid size-11 cursor-pointer place-items-center rounded-lg hover:bg-navy-50 md:hidden" aria-label={t('nav.menu')} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? <X className="size-6" aria-hidden /> : <Menu className="size-6" aria-hidden />}
          </button>
        </Container>
        {open && (
          <div className="border-t border-line bg-card md:hidden">
            <Container className="flex flex-col gap-1 py-3">
              {links.map((l) => (
                <NavLink key={l.to} to={l.to} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-base font-semibold hover:bg-navy-50">{l.label}</NavLink>
              ))}
              <div className="my-1 flex items-center justify-between"><LanguageSwitcher /><ThemeToggle /></div>
              {session && profile ? (
                <>
                  <Link to={dash} onClick={() => setOpen(false)} className={buttonClass('primary', 'lg')}>{t('nav.dashboard')}{!!unread.data && ` (${unread.data})`}</Link>
                  <button onClick={async () => { setOpen(false); nav('/', { replace: true }); await signOut() }} className={buttonClass('outline', 'lg')}>{t('nav.logout')}</button>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/login" onClick={() => setOpen(false)} className={buttonClass('outline', 'lg')}>{t('nav.login')}</Link>
                  <Link to="/register" onClick={() => setOpen(false)} className={buttonClass('accent', 'lg')}>{t('nav.register')}</Link>
                </div>
              )}
            </Container>
          </div>
        )}
      </header>
      <main id="main" className="flex-1"><Outlet /></main>
      <Footer />
    </div>
  )
}

function Footer() {
  const t = useT()
  const email = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) || 'support@example.com'
  return (
    <footer className="mt-16 border-t border-line bg-surface text-muted">
      <Container className="grid gap-8 py-10 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo light />
          <p className="mt-3 max-w-md text-sm text-muted">{t('footer.about')}</p>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-bold tracking-wide text-ink uppercase">{t('footer.explore')}</h2>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:underline" to="/services">{t('nav.services')}</Link></li>
            <li><Link className="hover:underline" to="/workers">{t('nav.findWorkers')}</Link></li>
            <li><Link className="hover:underline" to="/how-it-works">{t('nav.howItWorks')}</Link></li>
            <li><Link className="hover:underline" to="/register?role=worker">{t('footer.joinAsWorker')}</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-bold tracking-wide text-ink uppercase">{t('footer.legal')}</h2>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:underline" to="/privacy">{t('footer.privacy')}</Link></li>
            <li><Link className="hover:underline" to="/terms">{t('footer.terms')}</Link></li>
            <li><a className="hover:underline" href={`mailto:${email}`}>{t('footer.contact')}: {email}</a></li>
          </ul>
        </div>
      </Container>
      <div className="border-t border-white/10 py-4 text-center text-xs text-faint">
        © {new Date().getFullYear()} Labour Chowk · {t('footer.hackathon')}
      </div>
    </footer>
  )
}

// ------------------------------------------------------------------ dashboards
interface NavItem { to: string; label: string; icon: LucideIcon; badge?: number }

export function DashboardLayout({ kind }: { kind: 'customer' | 'worker' | 'admin' }) {
  const t = useT()
  const { profile, signOut } = useAuth()
  const unread = useUnreadCount()
  const nav = useNavigate()

  const items: NavItem[] =
    kind === 'worker'
      ? [
          { to: '/worker/dashboard', label: t('nav.overview'), icon: LayoutDashboard },
          { to: '/worker/requests', label: t('nav.requests'), icon: ClipboardList },
          { to: '/worker/availability', label: t('nav.availability'), icon: CalendarDays },
          { to: '/worker/bookings', label: t('nav.visits'), icon: Home },
          { to: '/worker/portfolio', label: t('nav.portfolio'), icon: Camera },
          { to: '/worker/passport', label: t('nav.passport'), icon: QrIcon },
          { to: '/worker/reviews', label: t('nav.reviews'), icon: Star },
          { to: '/worker/profile', label: t('nav.profile'), icon: User },
          { to: '/worker/notifications', label: t('nav.notifications'), icon: Bell, badge: unread.data },
        ]
      : kind === 'customer'
        ? [
            { to: '/customer/dashboard', label: t('nav.overview'), icon: LayoutDashboard },
            { to: '/workers', label: t('nav.findWorkers'), icon: Search },
            { to: '/customer/bookings', label: t('nav.bookings'), icon: ClipboardList },
            { to: '/customer/saved', label: t('nav.saved'), icon: Heart },
            { to: '/customer/notifications', label: t('nav.notifications'), icon: Bell, badge: unread.data },
            { to: '/customer/profile', label: t('nav.profile'), icon: User },
          ]
        : [
            { to: '/admin', label: t('nav.overview'), icon: ShieldCheck },
            { to: '/admin/categories', label: t('nav.categories'), icon: Tags },
            { to: '/admin/workers', label: t('nav.workersAdmin'), icon: Users },
          ]

  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-40 border-b border-line bg-card">
        <Container className="flex h-14 items-center justify-between gap-3">
          <Link to="/" aria-label="Labour Chowk"><Logo /></Link>
          <div className="flex items-center gap-2">
            <ThemeToggle /><LanguageSwitcher />
            <span className="hidden text-sm font-semibold sm:inline">{profile?.full_name}</span>
            <button onClick={async () => { nav('/', { replace: true }); await signOut() }} className={buttonClass('outline', 'sm')} aria-label={t('nav.logout')}>
              <LogOut className="size-4" aria-hidden /><span className="hidden sm:inline">{t('nav.logout')}</span>
            </button>
          </div>
        </Container>
      </header>

      <Container className="grid gap-6 py-5 pb-28 md:grid-cols-[220px_1fr] md:pb-10">
        <aside className="hidden md:block">
          <nav aria-label="Dashboard" className="sticky top-20 flex flex-col gap-1">
            {items.map((i) => <SideLink key={i.to} item={i} />)}
          </nav>
        </aside>
        <div className="min-w-0"><Outlet /></div>
      </Container>

      {/* mobile bottom bar: big touch targets, icon + label */}
      <nav aria-label="Dashboard" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card md:hidden">
        <ul className="flex overflow-x-auto">
          {items.map((i) => (
            <li key={i.to} className="min-w-[4.5rem] flex-1">
              <NavLink to={i.to} end className={({ isActive }) => cx('relative flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold', isActive ? 'text-navy-900' : 'text-muted')}>
                {({ isActive }) => (
                  <>
                    <span className={cx('relative grid h-7 w-12 place-items-center rounded-full', isActive && 'bg-amber-100')}>
                      <i.icon className="size-5" aria-hidden />
                      {!!i.badge && <span className="absolute -top-1 right-0 grid min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-navy-950">{i.badge}</span>}
                    </span>
                    <span className="max-w-full truncate">{i.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

function SideLink({ item }: { item: NavItem }) {
  return (
    <NavLink to={item.to} end className={({ isActive }) => cx('flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold', isActive ? 'bg-primary text-on-primary' : 'text-navy-900 hover:bg-primary-hover')}>
      <item.icon className="size-5" aria-hidden />
      <span className="flex-1">{item.label}</span>
      {!!item.badge && <span className="grid min-w-5 place-items-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-navy-950">{item.badge}</span>}
    </NavLink>
  )
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-navy-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
