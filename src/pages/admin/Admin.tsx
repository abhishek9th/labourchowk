import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Flag, ShieldCheck, Users } from 'lucide-react'
import { useT } from '@/i18n'
import { api } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { categorySchema, type CategoryForm } from '@/lib/schemas'
import type { Category, VerificationStatus } from '@/lib/types'
import { Badge, Button, buttonClass, Card, CardListSkeleton, CategoryIcon, Chip, DemoBadge, EmptyState, ErrorState, Field, ICON_NAMES, Input, Notice, PageHeading, Select, VerificationBadge, useToast } from '@/components/ui'
import { Section } from '@/components/Layout'
import { useFieldError } from '@/components/forms'
import { formatDateTime } from '@/lib/dates'

export function AdminHome() {
  const t = useT()
  const qc = useQueryClient()
  const toast = useToast()
  const pending = useQuery({ queryKey: ['adminWorkers', 'pending'], queryFn: () => api.adminWorkers('pending') })
  const reports = useQuery({ queryKey: ['adminReports', 'open'], queryFn: () => api.adminReports('open') })

  const resolve = useMutation({
    mutationFn: async (a: { id: string; status: 'resolved' | 'dismissed'; deleteReview?: string; deactivate?: string }) => {
      if (a.deleteReview) await api.adminDeleteReview(a.deleteReview)
      if (a.deactivate) await api.adminSetActive(a.deactivate, false)
      await api.adminResolveReport(a.id, a.status)
    },
    onSuccess: async () => { toast.success(t('admin.done')); await qc.invalidateQueries({ queryKey: ['adminReports'] }) },
    onError: (e) => toast.error(friendlyError(e, t)),
  })

  return (
    <>
      <PageHeading title={t('admin.title')} subtitle={t('admin.subtitle')} />
      <Notice tone="info">{t('admin.notice')}</Notice>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Link to="/admin/workers" className="contents"><Card className="p-4"><Users className="mb-2 size-6 text-navy-700" aria-hidden /><p className="text-sm text-muted">{t('admin.pendingVerifications')}</p><p className="text-3xl font-extrabold">{pending.data?.length ?? '…'}</p></Card></Link>
        <Card className="p-4"><Flag className="mb-2 size-6 text-navy-700" aria-hidden /><p className="text-sm text-muted">{t('admin.openReports')}</p><p className="text-3xl font-extrabold">{reports.data?.length ?? '…'}</p></Card>
        <Link to="/admin/categories" className="contents"><Card className="p-4"><ShieldCheck className="mb-2 size-6 text-navy-700" aria-hidden /><p className="text-sm text-muted">{t('admin.categories')}</p><p className="mt-1 font-bold text-navy-700 underline">{t('admin.manage')}</p></Card></Link>
      </div>

      <div className="mt-8" />
      <Section title={t('admin.reports')}>
        {reports.isLoading ? <CardListSkeleton count={2} /> : reports.isError ? <ErrorState message={friendlyError(reports.error, t)} onRetry={() => reports.refetch()} />
          : !reports.data?.length ? <EmptyState icon={Flag} title={t('admin.reports.empty')} />
          : (
            <ul className="space-y-3">
              {reports.data.map((r) => (
                <Card as="li" key={r.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2"><Badge tone="warn">{r.target_type}</Badge><strong>{r.target_label ?? '—'}</strong><span className="text-xs text-muted">{formatDateTime(r.created_at)} · {r.reporter_name}</span></div>
                  <p className="mt-2 text-sm">{r.reason}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => resolve.mutate({ id: r.id, status: 'dismissed' })}>{t('admin.dismiss')}</Button>
                    <Button size="sm" variant="primary" onClick={() => resolve.mutate({ id: r.id, status: 'resolved' })}>{t('admin.resolve')}</Button>
                    {r.target_type === 'worker' && <Button size="sm" variant="danger" onClick={() => resolve.mutate({ id: r.id, status: 'resolved', deactivate: r.target_id })}>{t('admin.hideWorker')}</Button>}
                    {r.target_type === 'review' && <Button size="sm" variant="danger" onClick={() => resolve.mutate({ id: r.id, status: 'resolved', deleteReview: r.target_id })}>{t('admin.removeReview')}</Button>}
                  </div>
                </Card>
              ))}
            </ul>
          )}
      </Section>
    </>
  )
}

export function AdminCategories() {
  const t = useT()
  const qc = useQueryClient()
  const toast = useToast()
  const fieldError = useFieldError()
  const q = useQuery({ queryKey: ['adminCategories'], queryFn: api.adminCategories })
  const [editing, setEditing] = useState<Category | null>(null)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CategoryForm>({ resolver: zodResolver(categorySchema), defaultValues: { icon: 'wrench' } })

  const save = useMutation({
    mutationFn: (v: CategoryForm) => api.adminSaveCategory({ ...v, id: editing?.id, is_active: editing?.is_active ?? true, sort_order: editing?.sort_order ?? 100 }),
    onSuccess: async () => { toast.success(t('admin.done')); setEditing(null); reset({ name: '', name_hi: '', slug: '', icon: 'wrench', description: '' }); await Promise.all([qc.invalidateQueries({ queryKey: ['adminCategories'] }), qc.invalidateQueries({ queryKey: ['categories'] })]) },
    onError: (e) => toast.error(friendlyError(e, t)),
  })
  const toggle = useMutation({
    mutationFn: (c: Category) => api.adminSaveCategory({ ...c, is_active: !c.is_active }),
    onSuccess: async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['adminCategories'] }), qc.invalidateQueries({ queryKey: ['categories'] })]) },
    onError: (e) => toast.error(friendlyError(e, t)),
  })

  return (
    <>
      <PageHeading title={t('admin.categories')} subtitle={t('admin.categories.subtitle')} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          {q.isLoading ? <CardListSkeleton count={4} /> : q.isError ? <ErrorState message={friendlyError(q.error, t)} onRetry={() => q.refetch()} /> : (
            <ul className="space-y-2">
              {q.data?.map((c) => (
                <Card as="li" key={c.id} className="flex flex-wrap items-center gap-3 p-3">
                  <span className="grid size-10 place-items-center rounded-full bg-navy-50"><CategoryIcon name={c.icon} /></span>
                  <div className="min-w-0 flex-1"><p className="font-bold">{c.name} {!c.is_active && <Badge tone="neutral">{t('admin.inactive')}</Badge>}</p><p className="text-xs text-muted">/{c.slug}</p></div>
                  <Button size="sm" variant="outline" onClick={() => { setEditing(c); reset({ name: c.name, name_hi: c.name_hi ?? '', slug: c.slug, icon: c.icon, description: c.description ?? '' }) }}>{t('common.edit')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle.mutate(c)}>{c.is_active ? t('admin.deactivate') : t('admin.activate')}</Button>
                </Card>
              ))}
            </ul>
          )}
        </div>
        <Card className="h-fit p-5">
          <h2 className="mb-3 text-lg font-bold">{editing ? t('admin.editCategory') : t('admin.addCategory')}</h2>
          <form noValidate className="space-y-3" onSubmit={handleSubmit((v) => save.mutate(v))}>
            <Field label={t('admin.cat.name')} htmlFor="cat-name" required error={fieldError(errors.name)}><Input id="cat-name" {...register('name')} /></Field>
            <Field label={t('admin.cat.nameHi')} htmlFor="cat-hi"><Input id="cat-hi" {...register('name_hi')} /></Field>
            <Field label={t('admin.cat.slug')} htmlFor="cat-slug" required hint="e.g. gardener" error={fieldError(errors.slug)}><Input id="cat-slug" {...register('slug')} /></Field>
            <Field label={t('admin.cat.icon')} htmlFor="cat-icon"><Select id="cat-icon" {...register('icon')}>{ICON_NAMES.map((i) => <option key={i} value={i}>{i}</option>)}</Select></Field>
            <Field label={t('admin.cat.description')} htmlFor="cat-desc"><Input id="cat-desc" {...register('description')} /></Field>
            <div className="flex gap-2">
              <Button type="submit" loading={save.isPending}>{t('common.save')}</Button>
              {editing && <Button variant="ghost" onClick={() => { setEditing(null); reset({ name: '', name_hi: '', slug: '', icon: 'wrench', description: '' }) }}>{t('common.cancel')}</Button>}
            </div>
          </form>
        </Card>
      </div>
    </>
  )
}

const STATUSES: (VerificationStatus | 'all')[] = ['all', 'pending', 'unverified', 'verified', 'rejected']

export function AdminWorkers() {
  const t = useT()
  const qc = useQueryClient()
  const toast = useToast()
  const [status, setStatus] = useState<VerificationStatus | 'all'>('pending')
  const q = useQuery({ queryKey: ['adminWorkers', status], queryFn: () => api.adminWorkers(status === 'all' ? null : status) })
  const act = useMutation({
    mutationFn: async (a: { id: string; verification?: VerificationStatus; active?: boolean }) => {
      if (a.verification) await api.adminSetVerification(a.id, a.verification)
      if (a.active !== undefined) await api.adminSetActive(a.id, a.active)
    },
    onSuccess: async () => { toast.success(t('admin.done')); await qc.invalidateQueries({ queryKey: ['adminWorkers'] }) },
    onError: (e) => toast.error(friendlyError(e, t)),
  })
  return (
    <>
      <PageHeading title={t('admin.workers')} subtitle={t('admin.workers.subtitle')} />
      <Notice tone="warn">{t('admin.verify.warning')}</Notice>
      <div className="my-4 flex flex-wrap gap-2">{STATUSES.map((s) => <Chip key={s} active={status === s} onClick={() => setStatus(s)}>{s === 'all' ? t('common.all') : t(`verification.${s}`)}</Chip>)}</div>
      {q.isLoading ? <CardListSkeleton /> : q.isError ? <ErrorState message={friendlyError(q.error, t)} onRetry={() => q.refetch()} />
        : !q.data?.length ? <EmptyState icon={Users} title={t('admin.workers.empty')} />
        : (
          <ul className="space-y-3">
            {q.data.map((w) => (
              <Card as="li" key={w.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-lg">{w.full_name}</strong><VerificationBadge status={w.verification_status} />
                  {w.verification_status !== 'verified' && w.verification_status !== 'pending' && <Badge>{t(`verification.${w.verification_status}`)}</Badge>}
                  {w.is_demo && <DemoBadge />}{!w.is_active && <Badge tone="bad">{t('admin.hidden')}</Badge>}
                </div>
                <p className="text-sm text-muted">{w.category_name} · {w.locality}, {w.city} · {w.email ?? '—'} · {w.phone ?? '—'} · {w.review_count} {t('reviews.title').toLowerCase()}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to={`/workers/${w.id}`} className={buttonClass('outline', 'sm')}>{t('worker.viewProfile')}</Link>
                  {w.verification_status !== 'verified' && <Button size="sm" variant="primary" onClick={() => act.mutate({ id: w.id, verification: 'verified' })}>{t('admin.markVerified')}</Button>}
                  {w.verification_status !== 'rejected' && <Button size="sm" variant="outline" onClick={() => act.mutate({ id: w.id, verification: 'rejected' })}>{t('admin.reject')}</Button>}
                  {w.verification_status === 'verified' && <Button size="sm" variant="outline" onClick={() => act.mutate({ id: w.id, verification: 'unverified' })}>{t('admin.revoke')}</Button>}
                  <Button size="sm" variant={w.is_active ? 'danger' : 'outline'} onClick={() => act.mutate({ id: w.id, active: !w.is_active })}>{w.is_active ? t('admin.hideWorker') : t('admin.showWorker')}</Button>
                </div>
              </Card>
            ))}
          </ul>
        )}
    </>
  )
}
