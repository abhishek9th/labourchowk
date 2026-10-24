// Dates travel as ISO strings (YYYY-MM-DD) to avoid timezone drift. The business timezone is IST.
const TZ = 'Asia/Kolkata'

export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function toISO(y: number, m0: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function parseISO(iso: string): { y: number; m0: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return { y, m0: m - 1, d }
}

export function addDays(iso: string, n: number): string {
  const { y, m0, d } = parseISO(iso)
  const dt = new Date(Date.UTC(y, m0, d + n))
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate())
}

export function dayOfWeek(iso: string): number {
  const { y, m0, d } = parseISO(iso)
  return new Date(Date.UTC(y, m0, d)).getUTCDay()
}

export function daysInMonth(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate()
}

export function monthRange(y: number, m0: number): { from: string; to: string } {
  return { from: toISO(y, m0, 1), to: toISO(y, m0, daysInMonth(y, m0)) }
}

export function shiftMonth(y: number, m0: number, delta: number): { y: number; m0: number } {
  const t = y * 12 + m0 + delta
  return { y: Math.floor(t / 12), m0: ((t % 12) + 12) % 12 }
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

export function formatDate(iso: string, locale = 'en-IN'): string {
  const { y, m0, d } = parseISO(iso)
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m0, d)))
}

export function formatMonth(y: number, m0: number, locale = 'en-IN'): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m0, 1)))
}

/** "14:00:00" -> "2:00 PM" */
export function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

export function formatDateTime(ts: string, locale = 'en-IN'): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: TZ }).format(new Date(ts))
}
