import { Link } from 'react-router-dom'
import { BadgeCheck, CalendarCheck, Heart, Images, MapPin } from 'lucide-react'
import { portfolioImageUrl } from '@/lib/api'
import { toggleFavorite, useFavorites } from '@/lib/favorites'
import { useI18n, useT } from '@/i18n'
import { Avatar, Badge, Button, buttonClass, Card, DemoBadge, useCategoryName, cx } from '@/components/ui'
import { formatDistance } from '@/lib/geo'
import { formatDate } from '@/lib/dates'
import { formatPrice } from '@/lib/format'
import type { WorkerSearchRow } from '@/lib/types'

const Dot = () => <span className="size-[3px] rounded-full bg-faint" aria-hidden />

/** Worker card: who they are and why to trust them on top, price and the booking action along the bottom. */
export function WorkerCard({ w, onSchedule, hasLocation, filterDate }: {
  w: WorkerSearchRow
  onSchedule: (workerId: string) => void
  hasLocation: boolean
  filterDate?: string | null
}) {
  const t = useT()
  const { locale } = useI18n()
  const catName = useCategoryName()
  const fav = useFavorites()
  const saved = fav.has(w.id)
  const price = formatPrice(Number(w.indicative_price), w.pricing_unit)
  const dist = formatDistance(w.distance_km === null ? null : Number(w.distance_km))
  const verified = w.verification_status === 'verified'

  return (
    <Card as="article" className="p-4 sm:p-5">
      <div className="flex gap-3 sm:gap-4">
        <Link to={`/workers/${w.id}`} className="shrink-0" aria-label={w.full_name}>
          <Avatar name={w.full_name} src={w.avatar_url} size={64} />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 text-lg leading-snug font-bold">
              <Link to={`/workers/${w.id}`} className="hover:underline">{w.full_name}</Link>
              {verified && <BadgeCheck className="mb-0.5 ml-1.5 inline size-[18px] text-ok" aria-label={t('verification.verified')} />}
            </h3>
            {w.is_demo && <DemoBadge />}
          </div>
          <p className="text-sm text-muted">{catName({ name: w.category_name, name_hi: w.category_name_hi })}</p>

          <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-body">
            {w.review_count > 0
              ? <span className="inline-flex items-center gap-1"><span className="text-warn" aria-hidden>★</span><strong>{Number(w.rating_avg).toFixed(1)}</strong><span className="text-muted">({w.review_count})</span></span>
              : <span className="text-muted">{t('reviews.none')}</span>}
            <Dot />
            <span>{t('worker.experienceYears', { n: w.experience_years })}</span>
            <Dot />
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5 text-muted" aria-hidden />
              {dist ? <>{dist === '< 1 km' ? t('worker.lessThanKm') : t('worker.away', { d: dist })} · {w.locality}</>
                : w.locality_match ? <>{w.locality}, {w.city} · {t('worker.inYourArea')}</>
                : <>{w.locality}, {w.city}{hasLocation ? ` · ${t('worker.distanceUnknown')}` : ''}</>}
            </span>
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {w.next_available
              ? <Badge tone="ok" icon={CalendarCheck}>{filterDate ? t('worker.availableOn', { d: formatDate(filterDate, locale) }) : t('worker.nextAvailable', { d: formatDate(w.next_available, locale) })}</Badge>
              : <Badge tone="neutral">{t('worker.noAvailability')}</Badge>}
            {w.serves_area === false && <Badge tone="warn">{t('worker.outsideRadius')}</Badge>}
            {w.portfolio_count > 0 && <Badge tone="neutral" icon={Images}>{t('worker.projects', { n: w.portfolio_count })}</Badge>}
          </div>
        </div>

        <div className="flex shrink-0 items-start gap-3">
          {w.cover_path && (
            <Link to={`/workers/${w.id}#portfolio`} className="hidden overflow-hidden rounded-lg border border-line md:block" aria-label={t('worker.viewWork', { name: w.full_name })}>
              <img src={portfolioImageUrl(w.cover_path)} alt="" loading="lazy" className="size-20 object-cover" />
            </Link>
          )}
          <button type="button" onClick={() => toggleFavorite(w.id)} aria-pressed={saved} aria-label={saved ? t('saved.remove') : t('saved.add')} title={saved ? t('saved.remove') : t('saved.add')}
            className={cx('grid size-10 cursor-pointer place-items-center rounded-lg border border-line transition-colors', saved ? 'bg-bad-bg text-[#ff6b73]' : 'bg-surface text-muted hover:text-ink')}>
            <Heart className={cx('size-5', saved && 'fill-current')} aria-hidden />
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <div>
          {price ? <div className="text-xl leading-none font-extrabold text-navy-900">{price}</div> : <div className="text-sm text-muted">{t('worker.priceNotSet')}</div>}
          <div className="mt-1 text-xs text-muted">{t('worker.indicativeShort')}</div>
        </div>
        <div className="flex gap-2">
          <Link to={`/workers/${w.id}`} className={buttonClass('outline')}>{t('worker.viewProfile')}</Link>
          <Button variant="primary" onClick={() => onSchedule(w.id)}>{t('worker.bookWorker')}</Button>
        </div>
      </div>
    </Card>
  )
}
