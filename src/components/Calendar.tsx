import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useI18n, useT } from '@/i18n'
import { cx } from '@/components/ui'
import { daysInMonth, dayOfWeek, formatMonth, shiftMonth, todayISO, toISO } from '@/lib/dates'
import type { DayState } from '@/lib/types'

export interface DayInfo {
  state: DayState
  /** worker opened a normally-closed day */
  isExtra?: boolean
  /** number of accepted visits (worker's own calendar) */
  booked?: number
  freeSlots?: number
}

interface Props {
  year: number
  month0: number
  onMonthChange: (y: number, m0: number) => void
  info: (iso: string) => DayInfo | undefined
  selected?: ReadonlySet<string>
  /** return true if the day can be pressed */
  clickable: (iso: string, info: DayInfo | undefined) => boolean
  onDayClick: (iso: string) => void
  loading?: boolean
  /** do not allow navigating to months before the current one */
  minToday?: boolean
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const STATE_STYLE: Record<DayState, string> = {
  past: 'text-muted/40',
  blocked: 'bg-bad-bg text-bad border-bad/30',
  off: 'bg-navy-50 text-muted border-transparent',
  full: 'bg-warn-bg text-warn border-warn/50',
  available: 'bg-card text-ink border-ok/40',
}
const GLYPH: Record<DayState, string> = { past: '', blocked: '✕', off: '–', full: '●', available: '' }

/** Accessible month grid. State is conveyed by colour AND a glyph + the button's accessible label. */
export function Calendar({ year, month0, onMonthChange, info, selected, clickable, onDayClick, loading, minToday = true }: Props) {
  const t = useT()
  const { locale } = useI18n()
  const today = todayISO()
  const todayParts = today.split('-').map(Number)
  const isCurrentMonth = year === todayParts[0] && month0 === todayParts[1] - 1
  const firstDow = dayOfWeek(toISO(year, month0, 1))
  const total = daysInMonth(year, month0)
  const cells: (string | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: total }, (_, i) => toISO(year, month0, i + 1))]
  while (cells.length % 7) cells.push(null)

  const prev = shiftMonth(year, month0, -1)
  const next = shiftMonth(year, month0, 1)

  return (
    <div className={cx('select-none', loading && 'opacity-60')} aria-busy={loading}>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => onMonthChange(prev.y, prev.m0)} disabled={minToday && isCurrentMonth}
          aria-label={t('calendar.prev')} className="grid size-11 cursor-pointer place-items-center rounded-lg hover:bg-navy-50 disabled:opacity-30">
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <div className="font-bold" aria-live="polite">{formatMonth(year, month0, locale)}</div>
        <button type="button" onClick={() => onMonthChange(next.y, next.m0)} aria-label={t('calendar.next')}
          className="grid size-11 cursor-pointer place-items-center rounded-lg hover:bg-navy-50">
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted">
        {WEEKDAY_KEYS.map((k) => <div key={k} className="py-1">{t(`day.${k}`)}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((iso, i) => {
          if (!iso) return <div key={`e${i}`} />
          const d = info(iso)
          const state: DayState = d?.state ?? (iso < today ? 'past' : 'available')
          const can = clickable(iso, d)
          const isSel = selected?.has(iso)
          const label = [iso, t(`calendar.state.${state}`), d?.isExtra ? t('calendar.extraDay') : '', d?.booked ? t('calendar.booked', { n: d.booked }) : '', isSel ? t('calendar.selected') : '']
            .filter(Boolean).join(', ')
          return (
            <button
              key={iso}
              type="button"
              disabled={!can}
              aria-label={label}
              aria-pressed={selected ? Boolean(isSel) : undefined}
              onClick={() => onDayClick(iso)}
              className={cx(
                'relative flex h-12 flex-col items-center justify-center rounded-lg border text-sm font-semibold transition-colors',
                STATE_STYLE[state],
                can ? 'cursor-pointer hover:border-navy-900/60' : 'cursor-not-allowed',
                iso === today && 'ring-2 ring-navy-900/30',
                isSel && '!border-primary !bg-primary !text-on-primary',
              )}
            >
              <span>{Number(iso.slice(8))}</span>
              <span className="text-[10px] leading-none" aria-hidden>
                {d?.booked ? `•${d.booked}` : GLYPH[state]}
                {d?.isExtra && '+'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function CalendarLegend({ worker }: { worker?: boolean }) {
  const t = useT()
  const items: { cls: string; glyph: string; label: string }[] = [
    { cls: 'bg-card border-ok/40', glyph: '', label: t('calendar.state.available') },
    { cls: 'bg-bad-bg border-bad/30 text-bad', glyph: '✕', label: worker ? t('calendar.legend.blocked') : t('calendar.state.blocked') },
    { cls: 'bg-navy-50 border-transparent text-muted', glyph: '–', label: t('calendar.state.off') },
    { cls: 'bg-warn-bg border-warn/50 text-warn', glyph: '●', label: t('calendar.state.full') },
  ]
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className={cx('grid size-5 place-items-center rounded border text-[10px]', i.cls)} aria-hidden>{i.glyph}</span>
          {i.label}
        </li>
      ))}
      {worker && <li className="flex items-center gap-1.5"><span className="grid size-5 place-items-center rounded border border-ok/40 bg-card text-[10px]" aria-hidden>•1</span>{t('calendar.legend.visit')}</li>}
      {worker && <li className="flex items-center gap-1.5"><span className="grid size-5 place-items-center rounded border border-ok/40 bg-card text-[10px]" aria-hidden>+</span>{t('calendar.legend.extra')}</li>}
    </ul>
  )
}
