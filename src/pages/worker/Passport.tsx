import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Download, ExternalLink, Printer, Share2 } from 'lucide-react'
import { useT } from '@/i18n'
import { useAuth } from '@/auth/AuthProvider'
import { api } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { passportUrl, runtimeBase } from '@/lib/passport'
import type { OwnWorkerProfile } from '@/lib/types'
import { Button, Card, CardListSkeleton, ErrorState, Notice, PageHeading, Skeleton, useCategoryName, useToast } from '@/components/ui'
import { QrCode, QrPngCanvas, downloadCanvasPng } from '@/components/Qr'
import { VisitingCard } from '@/components/VisitingCard'

export default function WorkerPassport() {
  const t = useT()
  const { profile } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const catName = useCategoryName()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [showPhone, setShowPhone] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const own = useQuery({ queryKey: ['ownWorker', profile?.id], queryFn: () => api.ownWorker(profile!.id), enabled: Boolean(profile) })
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: 5 * 60_000 })

  const setFlag = useMutation({
    mutationFn: (patch: Partial<Pick<OwnWorkerProfile, 'is_public' | 'share_phone' | 'share_whatsapp'>>) => api.updateWorker(profile!.id, patch),
    onSuccess: async () => {
      toast.success(t('profile.saved'))
      await Promise.all(['ownWorker', 'worker', 'search', 'portfolio'].map((k) => qc.invalidateQueries({ queryKey: [k] })))
    },
    onError: (e) => toast.error(friendlyError(e, t)),
  })

  if (own.isLoading || !profile) return <CardListSkeleton count={2} />
  if (own.isError || !own.data) return <ErrorState message={own.error ? friendlyError(own.error, t) : t('worker.noProfile')} onRetry={() => own.refetch()} />

  const w = own.data
  const { base, usedFallback } = runtimeBase()
  const url = passportUrl(w.public_id, base)
  const professionName = catName(categories.data?.find((c) => c.id === w.primary_category_id) ?? { name: '' })
  const hasPhone = Boolean(profile.phone)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // clipboard API unavailable (insecure context / old browser): select-and-copy fallback
      const ta = document.createElement('textarea')
      ta.value = url
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      if (!ok) return toast.error(t('passport.copyFailed'))
    }
    toast.success(t('passport.copied'))
  }

  async function share() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `${profile!.full_name} · Labour Chowk`, text: t('passport.shareText', { name: profile!.full_name }), url })
        return
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return   // user closed the share sheet
      }
    }
    await copy()
  }

  async function download() {
    if (!canvasRef.current) return
    try {
      await downloadCanvasPng(canvasRef.current, `labour-chowk-qr-${w.public_id}.png`)
    } catch {
      toast.error(t('passport.downloadFailed'))
    }
  }

  return (
    <>
      <PageHeading title={t('nav.passport')} subtitle={t('passport.subtitle')} />
      {usedFallback && <div className="mb-4"><Notice tone="warn">{t('passport.baseWarning', { base })}</Notice></div>}
      {!w.is_public && <div className="mb-4"><Notice tone="bad">{t('passport.hiddenWarning')}</Notice></div>}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="flex flex-col items-center gap-3 p-5 text-center">
          <QrCode value={url} size={200} label={t('passport.qr.label', { url })} />
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{t('passport.yourId')}</p>
          <p className="font-mono text-xl font-extrabold tracking-widest" data-testid="public-id">{w.public_id}</p>
          <p className="max-w-full text-sm break-all" data-testid="passport-url">{url}</p>
          <div className="grid w-full gap-2">
            <Button variant="primary" onClick={copy}><Copy className="size-4" aria-hidden />{t('passport.copy')}</Button>
            <Button variant="outline" onClick={download}><Download className="size-4" aria-hidden />{t('passport.download')}</Button>
            <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" aria-hidden />{t('passport.print')}</Button>
            <Button variant="accent" onClick={share}><Share2 className="size-4" aria-hidden />{t('passport.share')}</Button>
          </div>
          <p className="text-xs text-muted">{t('passport.permanent')}</p>
          <QrPngCanvas ref={canvasRef} value={url} />
        </Card>

        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <h2 className="text-lg font-bold">{t('passport.privacy.title')}</h2>
            <Toggle checked={w.is_public} disabled={setFlag.isPending} onChange={(v) => setFlag.mutate({ is_public: v })}
              title={t('passport.public.title')} text={t('passport.public.text')} />
            <Toggle checked={w.share_phone} disabled={setFlag.isPending || !hasPhone} onChange={(v) => setFlag.mutate({ share_phone: v })}
              title={t('passport.call.title')} text={t('passport.call.text')} />
            <Toggle checked={w.share_whatsapp} disabled={setFlag.isPending || !hasPhone} onChange={(v) => setFlag.mutate({ share_whatsapp: v })}
              title={t('passport.whatsapp.title')} text={t('passport.whatsapp.text')} />
            {!hasPhone && <Notice tone="warn">{t('passport.noPhone')}</Notice>}
            <p className="text-xs text-muted">{t('passport.privacy.note')}</p>
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="text-lg font-bold">{t('passport.card.title')}</h2>
            <p className="text-sm text-muted">{t('passport.card.text')}</p>
            <div className="overflow-x-auto pb-2"><VisitingCard name={profile.full_name} profession={professionName} url={url} phone={showPhone ? profile.phone : null} /></div>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 size-5 accent-navy-900" checked={showPhone} disabled={!hasPhone} onChange={(e) => setShowPhone(e.target.checked)} />
              <span><strong>{t('passport.card.phone')}</strong><br /><span className="text-muted">{t('passport.card.phoneHint')}</span></span>
            </label>
            <Button variant="primary" onClick={() => window.print()}><Printer className="size-4" aria-hidden />{t('passport.print')}</Button>
          </Card>

          <Card className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">{t('passport.preview.title')}</h2>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPreviewOpen((o) => !o)}>{previewOpen ? t('passport.preview.hide') : t('passport.preview.show')}</Button>
                <a href={`/p/${w.public_id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-navy-900/25 px-3 text-sm font-semibold hover:bg-navy-50"><ExternalLink className="size-4" aria-hidden />{t('passport.preview.open')}</a>
              </div>
            </div>
            <p className="text-sm text-muted">{t('passport.preview.text')}</p>
            {previewOpen && (
              <iframe title={t('passport.preview.title')} src={`/p/${w.public_id}`} loading="lazy" className="h-[640px] w-full rounded-xl border border-line bg-card" />
            )}
            {!previewOpen && <Skeleton className="hidden" />}
          </Card>
        </div>
      </div>
    </>
  )
}

function Toggle({ checked, onChange, title, text, disabled }: { checked: boolean; onChange: (v: boolean) => void; title: string; text: string; disabled?: boolean }) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
      <input type="checkbox" role="switch" className="mt-1 size-5 accent-navy-900" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span><strong>{title}</strong><br /><span className="text-muted">{text}</span></span>
    </label>
  )
}
