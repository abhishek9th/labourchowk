import { useEffect, useMemo, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Camera, Eye, EyeOff, ImagePlus, Plus, Star, Trash2, X } from 'lucide-react'
import { useI18n, useT } from '@/i18n'
import { useAuth } from '@/auth/AuthProvider'
import { api, portfolioImageUrl, type ProjectInput } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { sniffImageType, prepareImage, MAX_INPUT_BYTES } from '@/lib/image'
import { projectSchema, type ProjectForm } from '@/lib/schemas'
import { todayISO } from '@/lib/dates'
import { PRICING_UNITS, type PortfolioImage, type PortfolioProject, type PricingUnit } from '@/lib/types'
import { Badge, Button, Card, CardListSkeleton, Chip, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal, Notice, PageHeading, Select, Textarea, cx, useCategoryName, useToast } from '@/components/ui'
import { TagInput, useFieldError } from '@/components/forms'
import { PortfolioGallery, formatCompleted } from '@/components/PortfolioGallery'

const MAX_PHOTOS = 10
const TAG_SUGGESTIONS = ['residential', 'commercial', 'renovation', 'new construction', 'repair']

interface QueueItem {
  id: string
  file: File
  preview: string
  status: 'ready' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
}

export default function WorkerPortfolio() {
  const t = useT()
  const { locale } = useI18n()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const catName = useCategoryName()
  const [tab, setTab] = useState<'mine' | 'preview'>('mine')
  const [editing, setEditing] = useState<PortfolioProject | 'new' | null>(null)
  const [deleting, setDeleting] = useState<PortfolioProject | null>(null)
  const q = useQuery({ queryKey: ['ownPortfolio', profile?.id], queryFn: () => api.ownPortfolio(profile!.id), enabled: Boolean(profile) })
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: 5 * 60_000 })
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['ownPortfolio'] }), qc.invalidateQueries({ queryKey: ['portfolio'] }), qc.invalidateQueries({ queryKey: ['search'] }), qc.invalidateQueries({ queryKey: ['worker'] })])
  const published = useMemo(() => (q.data ?? []).filter((p) => p.is_published), [q.data])

  async function togglePublished(p: PortfolioProject) {
    try {
      await api.updateProject(p.id, { title: p.title, description: p.description, category_id: p.category_id, location_label: p.location_label, completed_at: p.completed_at,
        project_area_sqft: p.project_area_sqft, project_price: p.project_price, project_price_unit: p.project_price_unit, project_tags: p.project_tags, is_published: !p.is_published })
      toast.success(p.is_published ? t('portfolio.hidden') : t('portfolio.published'))
      await refresh()
    } catch (e) { toast.error(friendlyError(e, t)) }
  }

  return (
    <>
      <PageHeading title={t('nav.portfolio')} subtitle={t('portfolio.manage.subtitle')}
        actions={<Button variant="accent" onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden />{t('portfolio.add')}</Button>} />
      <div className="mb-4"><Notice tone="info">{t('portfolio.notice')}</Notice></div>

      <div className="mb-4 flex gap-2" role="group">
        <Chip active={tab === 'mine'} onClick={() => setTab('mine')}>{t('portfolio.tab.mine')} ({q.data?.length ?? 0})</Chip>
        <Chip active={tab === 'preview'} onClick={() => setTab('preview')}><Eye className="mr-1 inline size-4" aria-hidden />{t('portfolio.tab.preview')}</Chip>
      </div>

      {q.isLoading ? <CardListSkeleton count={2} /> : q.isError ? <ErrorState message={friendlyError(q.error, t)} onRetry={() => q.refetch()} />
        : tab === 'preview' ? (
          <div>
            <Notice tone="warn">{t('portfolio.preview.note', { n: (q.data?.length ?? 0) - published.length })}</Notice>
            <div className="mt-4"><PortfolioGallery projects={published} /></div>
          </div>
        ) : !q.data?.length ? (
          <EmptyState icon={Camera} title={t('portfolio.mine.empty.title')} text={t('portfolio.mine.empty.text')} action={<Button variant="accent" onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden />{t('portfolio.add')}</Button>} />
        ) : (
          <ul className="space-y-3">
            {q.data.map((p) => {
              const cover = p.images.find((i) => i.is_cover) ?? p.images[0]
              return (
                <Card as="li" key={p.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                  <div className="aspect-[4/3] w-full shrink-0 overflow-hidden rounded-lg bg-navy-50 sm:w-40">
                    {cover ? <img src={portfolioImageUrl(cover.storage_path)} alt="" className="size-full object-cover" loading="lazy" /> : <span className="grid size-full place-items-center text-muted"><Camera className="size-6" aria-hidden /></span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold">{p.title}</h3>
                      {!p.is_published && <Badge tone="warn" icon={EyeOff}>{t('portfolio.draft')}</Badge>}
                    </div>
                    <p className="text-sm text-muted">
                      {[p.category_id ? catName(categories.data?.find((c) => c.id === p.category_id) ?? { name: '' }) : null, formatCompleted(p.completed_at, locale), p.location_label, t('portfolio.photos', { n: p.images.length })].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(p)}>{t('common.edit')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => togglePublished(p)}>{p.is_published ? t('portfolio.unpublish') : t('portfolio.publish')}</Button>
                    <Button size="sm" variant="ghost" className="text-bad" onClick={() => setDeleting(p)} aria-label={`${t('common.delete')} ${p.title}`}><Trash2 className="size-4" aria-hidden />{t('common.delete')}</Button>
                  </div>
                </Card>
              )
            })}
          </ul>
        )}

      {editing && profile && (
        <ProjectEditor
          key={editing === 'new' ? 'new' : editing.id}
          workerId={profile.id}
          project={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}

      <ConfirmDialog open={!!deleting} danger title={t('portfolio.delete.title')} message={t('portfolio.delete.message', { title: deleting?.title ?? '' })}
        confirmLabel={t('portfolio.delete.confirm')} onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          try { await api.deleteProject(deleting!); toast.success(t('portfolio.deleted')); await refresh() } catch (e) { toast.error(friendlyError(e, t)) }
          setDeleting(null)
        }} />
    </>
  )
}

// ------------------------------------------------------------------ editor
function ProjectEditor({ workerId, project, onClose, onSaved }: {
  workerId: string; project: PortfolioProject | null; onClose: () => void; onSaved: () => Promise<unknown>
}) {
  const t = useT()
  const toast = useToast()
  const fieldError = useFieldError()
  const catName = useCategoryName()
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: 5 * 60_000 })
  const own = useQuery({ queryKey: ['ownWorker', workerId], queryFn: () => api.ownWorker(workerId) })
  const fileRef = useRef<HTMLInputElement>(null)
  const projectId = useRef<string | null>(project?.id ?? null)       // set after the first successful create so a retry never duplicates
  const [saved, setSaved] = useState<PortfolioImage[]>(project?.images ?? [])
  const [coverId, setCoverId] = useState<string | null>(project?.images.find((i) => i.is_cover)?.id ?? project?.images[0]?.id ?? null)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<PortfolioImage | null>(null)
  const [problems, setProblems] = useState<string[]>([])

  const month = todayISO().slice(0, 7)
  const { register, control, handleSubmit, reset, watch, formState: { errors } } = useForm<ProjectForm>({
    resolver: zodResolver(projectSchema),
    defaultValues: project ? {
      title: project.title, category_id: project.category_id ?? '', description: project.description ?? '', location_label: project.location_label ?? '',
      completed_month: project.completed_at.slice(0, 7), area: project.project_area_sqft !== null ? String(project.project_area_sqft) : '',
      disclose_price: project.project_price !== null, price: project.project_price !== null ? String(Math.round(Number(project.project_price))) : '',
      price_unit: project.project_price_unit ?? 'per_task', tags: project.project_tags, is_published: project.is_published ?? true,
    } : { title: '', category_id: '', description: '', location_label: '', completed_month: month, area: '', disclose_price: false, price: '', price_unit: 'per_task', tags: [], is_published: true },
  })
  // default a new project's category to the worker's profession
  useEffect(() => { if (!project && own.data) reset((v) => ({ ...v, category_id: v.category_id || own.data!.primary_category_id })) }, [own.data, project, reset])
  const disclose = watch('disclose_price')
  const tags = watch('tags')

  useEffect(() => () => queue.forEach((q) => URL.revokeObjectURL(q.preview)), []) // eslint-disable-line react-hooks/exhaustive-deps

  const totalPhotos = saved.length + queue.length
  const patch = (id: string, p: Partial<QueueItem>) => setQueue((q) => q.map((x) => (x.id === id ? { ...x, ...p } : x)))

  async function addFiles(files: FileList | null) {
    if (!files) return
    const found: string[] = []
    const next: QueueItem[] = []
    for (const file of Array.from(files)) {
      if (saved.length + queue.length + next.length >= MAX_PHOTOS) { found.push(t('err.ERR_TOO_MANY_PHOTOS')); break }
      const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
      if (file.size === 0) { found.push(`${file.name}: ${t('err.ERR_IMAGE_EMPTY')}`); continue }
      if (file.size > MAX_INPUT_BYTES) { found.push(`${file.name}: ${t('err.ERR_IMAGE_TOOLARGE')}`); continue }
      if (!sniffImageType(head)) { found.push(`${file.name}: ${t('err.ERR_IMAGE_NOTIMAGE')}`); continue }
      next.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file), status: 'ready', progress: 0 })
    }
    setProblems(found)
    setQueue((q) => [...q, ...next])
    if (fileRef.current) fileRef.current.value = ''
  }

  function move(i: number, d: number) {
    setSaved((s) => { const n = [...s]; const j = i + d; if (j < 0 || j >= n.length) return s; [n[i], n[j]] = [n[j], n[i]]; return n })
  }

  const layoutChanged = project && saved.length > 0 && (
    saved.map((s) => s.id).join() !== project.images.map((s) => s.id).join() ||
    coverId !== (project.images.find((i) => i.is_cover)?.id ?? project.images[0]?.id)
  )

  async function save(v: ProjectForm) {
    setSaving(true)
    setProblems([])
    const input: ProjectInput = {
      title: v.title, description: v.description || null, category_id: v.category_id || null, location_label: v.location_label || null,
      completed_at: `${v.completed_month}-01`, project_area_sqft: v.area ? Number(v.area) : null,
      project_price: v.disclose_price && v.price ? Number(v.price) : null, project_price_unit: v.disclose_price && v.price ? (v.price_unit as PricingUnit) : null,
      project_tags: v.tags, is_published: v.is_published,
    }
    let ok = true
    try {
      if (projectId.current) await api.updateProject(projectId.current, input)
      else projectId.current = await api.createProject(workerId, input)
      if (layoutChanged && coverId) await api.setPortfolioLayout(projectId.current, saved.map((s) => s.id), coverId)
    } catch (e) {
      toast.error(friendlyError(e, t))
      setSaving(false)
      return
    }
    // photos one at a time (gentle on slow phones); a failed photo does not lose the others
    for (const item of queue.filter((x) => x.status === 'ready' || x.status === 'error')) {
      patch(item.id, { status: 'uploading', progress: 0, error: undefined })
      try {
        const prepared = await prepareImage(item.file)
        await api.uploadPortfolioImage(workerId, projectId.current, prepared.blob, (progress) => patch(item.id, { progress }))
        patch(item.id, { status: 'done', progress: 100 })
      } catch (e) {
        ok = false
        patch(item.id, { status: 'error', error: friendlyError(e, t) })
      }
    }
    await onSaved()
    setSaving(false)
    if (ok) { toast.success(t('portfolio.saved')); onClose() }
    else toast.error(t('portfolio.someFailed'))
  }

  return (
    <Modal open onClose={saving ? () => undefined : onClose} wide title={project ? t('portfolio.edit') : t('portfolio.add')}
      footer={<><Button variant="outline" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button><Button variant="accent" loading={saving} onClick={handleSubmit(save)}>{t('portfolio.save')}</Button></>}>
      <form className="space-y-4" noValidate onSubmit={(e) => e.preventDefault()}>
        {/* photos */}
        <section aria-labelledby="pp-photos">
          <h3 id="pp-photos" className="mb-1 font-bold">{t('portfolio.photos.title')} <span className="text-sm font-normal text-muted">({totalPhotos}/{MAX_PHOTOS})</span></h3>
          <p className="mb-2 text-xs text-muted">{t('portfolio.photos.hint')}</p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {saved.map((img, i) => (
              <li key={img.id} className="overflow-hidden rounded-lg border border-line bg-card">
                <div className="relative aspect-[4/3] bg-navy-50">
                  <img src={portfolioImageUrl(img.storage_path)} alt="" className="size-full object-cover" loading="lazy" />
                  {coverId === img.id && <span className="absolute top-1 left-1 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-navy-950"><Star className="size-3 fill-current" aria-hidden />{t('portfolio.cover')}</span>}
                </div>
                <div className="flex items-center justify-between gap-1 p-1">
                  <button type="button" className="grid size-9 cursor-pointer place-items-center rounded-md hover:bg-navy-50 disabled:opacity-30" disabled={i === 0 || saving} onClick={() => move(i, -1)} aria-label={t('portfolio.moveEarlier')}><ArrowLeft className="size-4" aria-hidden /></button>
                  <button type="button" className="grid size-9 cursor-pointer place-items-center rounded-md hover:bg-navy-50 disabled:opacity-30" disabled={coverId === img.id || saving} onClick={() => setCoverId(img.id)} aria-label={t('portfolio.setCover')} title={t('portfolio.setCover')}><Star className="size-4" aria-hidden /></button>
                  <button type="button" className="grid size-9 cursor-pointer place-items-center rounded-md hover:bg-navy-50 disabled:opacity-30" disabled={i === saved.length - 1 || saving} onClick={() => move(i, 1)} aria-label={t('portfolio.moveLater')}><ArrowRight className="size-4" aria-hidden /></button>
                  <button type="button" className="grid size-9 cursor-pointer place-items-center rounded-md text-bad hover:bg-bad-bg disabled:opacity-30" disabled={saving} onClick={() => setRemoving(img)} aria-label={t('portfolio.removePhoto')}><Trash2 className="size-4" aria-hidden /></button>
                </div>
              </li>
            ))}
            {queue.map((q) => (
              <li key={q.id} className={cx('overflow-hidden rounded-lg border bg-card', q.status === 'error' ? 'border-bad' : 'border-line')}>
                <div className="relative aspect-[4/3] bg-navy-50">
                  <img src={q.preview} alt="" className="size-full object-cover" />
                  <span className="absolute top-1 left-1 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-on-primary">{t('portfolio.new')}</span>
                  {q.status === 'ready' && !saving && (
                    <button type="button" onClick={() => { URL.revokeObjectURL(q.preview); setQueue((x) => x.filter((y) => y.id !== q.id)) }} aria-label={t('portfolio.removePhoto')} className="absolute top-1 right-1 grid size-8 cursor-pointer place-items-center rounded-full bg-black/70 text-white"><X className="size-4" aria-hidden /></button>
                  )}
                </div>
                <div className="p-2 text-xs">
                  {q.status === 'uploading' && (
                    <div role="progressbar" aria-valuenow={q.progress} aria-valuemin={0} aria-valuemax={100} aria-label={q.file.name}>
                      <div className="h-2 overflow-hidden rounded-full bg-navy-50"><div className="h-full bg-amber-500 transition-[width]" style={{ width: `${q.progress}%` }} /></div>
                      <span className="text-muted">{t('portfolio.uploading', { n: q.progress })}</span>
                    </div>
                  )}
                  {q.status === 'done' && <span className="font-semibold text-ok">✓ {t('portfolio.uploaded')}</span>}
                  {q.status === 'error' && <span role="alert" className="font-semibold text-bad">{q.error}</span>}
                  {q.status === 'ready' && <span className="text-muted">{t('portfolio.readyToUpload')}</span>}
                </div>
              </li>
            ))}
            {totalPhotos < MAX_PHOTOS && (
              <li>
                <button type="button" disabled={saving} onClick={() => fileRef.current?.click()} className="grid aspect-[4/3] h-full min-h-28 w-full cursor-pointer place-items-center rounded-lg border-2 border-dashed border-navy-900/30 bg-card text-center text-sm font-semibold text-navy-700 hover:bg-navy-50 disabled:opacity-50">
                  <span><ImagePlus className="mx-auto mb-1 size-7" aria-hidden />{t('portfolio.addPhotos')}</span>
                </button>
              </li>
            )}
          </ul>
          <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={t('portfolio.addPhotos')} onChange={(e) => void addFiles(e.target.files)} />
          {problems.length > 0 && <div className="mt-2"><Notice tone="bad"><ul className="list-disc pl-4">{problems.map((p) => <li key={p}>{p}</li>)}</ul></Notice></div>}
          {!project && queue.length === 0 && <p className="mt-2 text-xs text-muted">{t('portfolio.photos.optional')}</p>}
        </section>

        {/* details */}
        <Field label={t('portfolio.f.title')} htmlFor="pp-title" required error={fieldError(errors.title)}>
          <Input id="pp-title" maxLength={120} placeholder={t('portfolio.f.titlePlaceholder')} invalid={!!errors.title} {...register('title')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('portfolio.f.category')} htmlFor="pp-cat" hint={t('portfolio.f.categoryHint')}>
            <Select id="pp-cat" {...register('category_id')}>
              <option value="">—</option>
              {categories.data?.map((c) => <option key={c.id} value={c.id}>{catName(c)}</option>)}
            </Select>
          </Field>
          <Field label={t('portfolio.f.completed')} htmlFor="pp-month" required error={fieldError(errors.completed_month)}>
            <Input id="pp-month" type="month" max={month} invalid={!!errors.completed_month} {...register('completed_month')} />
          </Field>
        </div>
        <Field label={t('portfolio.f.description')} htmlFor="pp-desc" error={fieldError(errors.description)}>
          <Textarea id="pp-desc" rows={3} maxLength={1000} {...register('description')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('portfolio.f.location')} htmlFor="pp-loc" hint={t('portfolio.f.locationHint')} error={fieldError(errors.location_label)}>
            <Input id="pp-loc" maxLength={120} placeholder="Indiranagar, Bengaluru" {...register('location_label')} />
          </Field>
          <Field label={t('portfolio.f.area')} htmlFor="pp-area" error={fieldError(errors.area)}>
            <Input id="pp-area" inputMode="decimal" placeholder="e.g. 850" {...register('area')} />
          </Field>
        </div>
        <Notice tone="warn">{t('portfolio.privacyNote')}</Notice>

        <fieldset className="rounded-xl border border-line p-3">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 size-5 accent-navy-900" {...register('disclose_price')} />
            <span><strong>{t('portfolio.f.disclose')}</strong><br /><span className="text-muted">{t('portfolio.f.discloseHint')}</span></span>
          </label>
          {disclose && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label={t('portfolio.f.price')} htmlFor="pp-price" error={fieldError(errors.price)}><Input id="pp-price" inputMode="numeric" {...register('price')} /></Field>
              <Field label={t('auth.priceUnit')} htmlFor="pp-unit"><Select id="pp-unit" {...register('price_unit')}>{PRICING_UNITS.map((u) => <option key={u} value={u}>{t(`unit.${u}`)}</option>)}</Select></Field>
            </div>
          )}
        </fieldset>

        <Field label={t('portfolio.f.tags')} htmlFor="pp-tags" hint={t('portfolio.f.tagsHint')}>
          <Controller control={control} name="tags" render={({ field }) => (
            <>
              <TagInput id="pp-tags" value={field.value} onChange={field.onChange} max={8} placeholder="residential" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {TAG_SUGGESTIONS.filter((s) => !tags.includes(s)).map((s) => <Chip key={s} onClick={() => field.onChange([...field.value, s].slice(0, 8))}>+ {s}</Chip>)}
              </div>
            </>
          )} />
        </Field>

        <label className="flex items-center gap-3 text-sm font-semibold">
          <input type="checkbox" className="size-5 accent-navy-900" {...register('is_published')} />
          {t('portfolio.f.published')}
        </label>
      </form>

      <ConfirmDialog open={!!removing} danger title={t('portfolio.removePhoto.title')} message={t('portfolio.removePhoto.message')} confirmLabel={t('portfolio.removePhoto')}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          try {
            await api.deletePortfolioImage(removing!)
            setSaved((s) => s.filter((x) => x.id !== removing!.id))
            if (coverId === removing!.id) setCoverId(saved.find((x) => x.id !== removing!.id)?.id ?? null)
            await onSaved()
          } catch (e) { toast.error(friendlyError(e, t)) }
          setRemoving(null)
        }} />
    </Modal>
  )
}
