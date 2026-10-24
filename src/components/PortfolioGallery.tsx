import { useState } from 'react'
import { Camera, ImageOff, MapPin, Ruler } from 'lucide-react'
import { useI18n, useT } from '@/i18n'
import { portfolioImageUrl } from '@/lib/api'
import { formatPrice } from '@/lib/format'
import { formatMonth, parseISO } from '@/lib/dates'
import type { PortfolioProject } from '@/lib/types'
import { Badge, EmptyState, Notice, cx, useCategoryName } from '@/components/ui'
import { Lightbox } from '@/components/Lightbox'

export function formatCompleted(iso: string, locale: string): string {
  const { y, m0 } = parseISO(iso)
  return formatMonth(y, m0, locale)
}

function coverOf(p: PortfolioProject) {
  return p.images.find((i) => i.is_cover) ?? p.images[0]
}

/**
 * Customer-facing portfolio: responsive card grid -> tap a card to open the lightbox on that
 * project's photos (previous/next stay inside the project). Always shows the "provided by the
 * worker, not independently verified" notice. No fake/demo projects are ever generated here.
 */
export function PortfolioGallery({ projects, showNotice = true }: { projects: PortfolioProject[]; showNotice?: boolean }) {
  const t = useT()
  const { locale } = useI18n()
  const catName = useCategoryName()
  const [open, setOpen] = useState<{ project: number; image: number } | null>(null)

  if (projects.length === 0) {
    return <EmptyState icon={Camera} title={t('portfolio.empty.title')} text={t('portfolio.empty.text')} />
  }

  const current = open ? projects[open.project] : null

  return (
    <div>
      {showNotice && <div className="mb-4"><Notice tone="info">{t('portfolio.notice')}</Notice></div>}
      <ul className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
        {projects.map((p, pi) => {
          const cover = coverOf(p)
          const price = p.project_price !== null && p.project_price_unit ? formatPrice(Number(p.project_price), p.project_price_unit) : null
          const label = `${p.title} (${p.images.length})`
          return (
            <li key={p.id} className="overflow-hidden rounded-[6px] border border-line bg-card shadow-card">
              <button
                type="button"
                disabled={!cover}
                onClick={() => setOpen({ project: pi, image: p.images.findIndex((i) => i.id === cover?.id) })}
                aria-label={t('portfolio.openPhotos', { title: label })}
                className={cx('relative block aspect-[4/3] w-full overflow-hidden bg-navy-50', cover ? 'cursor-zoom-in' : 'cursor-default')}
              >
                {cover ? (
                  <img src={portfolioImageUrl(cover.storage_path)} alt={p.title} loading="lazy" className="size-full object-cover transition-transform hover:scale-[1.02]" />
                ) : (
                  <span className="grid size-full place-items-center text-muted"><ImageOff className="size-8" aria-hidden /></span>
                )}
                {p.images.length > 1 && (
                  <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">
                    <Camera className="size-3.5" aria-hidden />{p.images.length}
                  </span>
                )}
              </button>
              <div className="space-y-2 p-3.5">
                <h3 className="leading-snug font-bold">{p.title}</h3>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  {p.category_name && <span className="font-semibold text-navy-700">{catName({ name: p.category_name, name_hi: p.category_name_hi })}</span>}
                  <span>{formatCompleted(p.completed_at, locale)}</span>
                  {p.location_label && <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden />{p.location_label}</span>}
                  {p.project_area_sqft !== null && <span className="inline-flex items-center gap-1"><Ruler className="size-3" aria-hidden />{Number(p.project_area_sqft).toLocaleString('en-IN')} sq ft</span>}
                </div>
                {p.description && <p className="line-clamp-3 text-sm">{p.description}</p>}
                {price && <p className="text-sm"><strong>{price}</strong> <span className="text-xs text-muted">{t('portfolio.priceDisclosed')}</span></p>}
                {p.project_tags.length > 0 && <ul className="flex flex-wrap gap-1.5">{p.project_tags.map((tag) => <li key={tag}><Badge>{tag}</Badge></li>)}</ul>}
              </div>
            </li>
          )
        })}
      </ul>

      {open && current && current.images.length > 0 && (
        <Lightbox
          images={current.images.map((i) => ({ url: portfolioImageUrl(i.storage_path), alt: current.title }))}
          index={Math.max(0, open.image)}
          onIndex={(image) => setOpen({ project: open.project, image })}
          onClose={() => setOpen(null)}
          caption={
            <div className="mx-auto max-w-3xl space-y-1">
              <p className="text-base font-bold">{current.title}</p>
              <p className="text-white/70">
                {[current.category_name, formatCompleted(current.completed_at, locale), current.location_label].filter(Boolean).join(' · ')}
              </p>
              {current.description && <p className="whitespace-pre-line">{current.description}</p>}
              <p className="pt-1 text-xs text-white/60">{t('portfolio.notice.short')}</p>
            </div>
          }
        />
      )}
    </div>
  )
}
