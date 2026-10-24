import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, HeartHandshake, Search } from 'lucide-react'
import { useT } from '@/i18n'
import { api } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { buttonClass, Container, ErrorState, PageHeading, Skeleton, useCategoryName, Card } from '@/components/ui'

export function Services() {
  const t = useT()
  const catName = useCategoryName()
  const q = useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: 5 * 60_000 })
  return (
    <Container className="py-8">
      <PageHeading title={t('services.title')} subtitle={t('services.subtitle')} />
      {q.isError ? <ErrorState message={friendlyError(q.error, t)} onRetry={() => q.refetch()} /> : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {q.isLoading ? Array.from({ length: 9 }, (_, i) => <li key={i}><Skeleton className="h-32" /></li>)
            : q.data?.map((c) => (
              <li key={c.id}>
                <Link to={`/workers?category=${c.slug}`} className="flex h-full gap-4 rounded-[6px] border border-line bg-card p-5 shadow-card transition-colors hover:border-amber-500 hover:bg-amber-50">
                  <img src={`/img/cat-${c.slug}.jpg`} alt="" loading="lazy" width={72} height={72} className="size-[72px] shrink-0 rounded-lg bg-navy-50 object-cover" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
                  <span>
                    <span className="block text-lg font-bold">{catName(c)}</span>
                    <span className="text-sm text-muted">{c.description}</span>
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      )}
    </Container>
  )
}

export function HowItWorks() {
  const t = useT()
  const steps = [
    { icon: Search, k: 'how.1' },
    { icon: CalendarCheck, k: 'how.2' },
    { icon: HeartHandshake, k: 'how.3' },
  ]
  return (
    <Container className="max-w-3xl py-8">
      <PageHeading title={t('how.title')} />
      <ol className="space-y-4">
        {steps.map((s, i) => (
          <Card as="li" key={s.k} className="flex gap-4 p-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-amber-500 text-lg font-extrabold text-navy-950">{i + 1}</span>
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold"><s.icon className="size-5 text-navy-700" aria-hidden />{t(`${s.k}.title`)}</h2>
              <p className="mt-1 text-muted">{t(`${s.k}.text`)}</p>
            </div>
          </Card>
        ))}
      </ol>
      <div className="mt-6 rounded-[6px] border border-line bg-card p-5 text-body">
        <h2 className="font-bold">{t('schedule.rule.title')}</h2>
        <p className="mt-1 text-sm">{t('schedule.rule.body')}</p>
      </div>
      <h2 className="mt-8 text-xl font-bold">{t('how.forWorkers.title')}</h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted">
        <li>{t('how.forWorkers.1')}</li><li>{t('how.forWorkers.2')}</li><li>{t('how.forWorkers.3')}</li>
      </ul>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/workers" className={buttonClass('accent', 'lg')}>{t('nav.findWorkers')}</Link>
        <Link to="/register?role=worker" className={buttonClass('outline', 'lg')}>{t('footer.joinAsWorker')}</Link>
      </div>
    </Container>
  )
}

export function Legal({ kind }: { kind: 'privacy' | 'terms' }) {
  const t = useT()
  const keys = kind === 'privacy' ? ['p1', 'p2', 'p3', 'p4', 'p5'] : ['t1', 't2', 't3', 't4', 't5']
  return (
    <Container className="max-w-3xl py-8">
      <PageHeading title={t(`legal.${kind}.title`)} />
      <p className="mb-4 rounded-xl border border-line bg-card p-3 text-sm text-body">{t('legal.draft')}</p>
      <div className="space-y-4 text-[15px]">
        {keys.map((k) => <p key={k}>{t(`legal.${kind}.${k}`)}</p>)}
      </div>
    </Container>
  )
}

export function NotFound() {
  const t = useT()
  return (
    <Container className="grid min-h-[50dvh] place-items-center py-16 text-center">
      <div>
        <p className="text-6xl font-extrabold text-muted">404</p>
        <h1 className="mt-2 text-2xl font-bold">{t('notfound.title')}</h1>
        <Link to="/" className={buttonClass('primary', 'md', 'mt-6')}>{t('notfound.home')}</Link>
      </div>
    </Container>
  )
}

export function SetupRequired() {
  return (
    <Container className="max-w-2xl py-16">
      <Card className="space-y-4 p-6">
        <h1 className="text-2xl font-extrabold">Connect Supabase to continue</h1>
        <p className="text-muted">This app stores everything in Supabase (Postgres, Auth, Storage). No project is connected yet.</p>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>Create a free project at <strong>supabase.com</strong>.</li>
          <li>Run the SQL files in <code className="rounded bg-navy-50 px-1">supabase/migrations</code> in order (SQL editor, or <code className="rounded bg-navy-50 px-1">supabase db push</code>).</li>
          <li>Copy <code className="rounded bg-navy-50 px-1">.env.example</code> to <code className="rounded bg-navy-50 px-1">.env.local</code> and fill in <code className="rounded bg-navy-50 px-1">VITE_SUPABASE_URL</code> and <code className="rounded bg-navy-50 px-1">VITE_SUPABASE_ANON_KEY</code>.</li>
          <li>Restart <code className="rounded bg-navy-50 px-1">npm run dev</code>. Optionally run <code className="rounded bg-navy-50 px-1">supabase/seed.sql</code> for sample workers.</li>
        </ol>
        <p className="text-sm text-muted">Full instructions are in README.md.</p>
      </Card>
    </Container>
  )
}
