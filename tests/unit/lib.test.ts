import { describe, expect, it } from 'vitest'
import { addDays, dayOfWeek, eachDay, formatTime, monthRange, shiftMonth, todayISO } from '@/lib/dates'
import { formatDistance, haversineKm } from '@/lib/geo'
import { formatPrice, profileCompleteness } from '@/lib/format'
import { errorCode, friendlyError } from '@/lib/errors'
import { customerRegisterSchema, reviewSchema, visitDetailsSchema, workerRegisterSchema } from '@/lib/schemas'
import { en } from '@/i18n/en'

describe('dates', () => {
  it('does calendar arithmetic without timezone drift', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(dayOfWeek('2026-10-23')).toBe(5) // Friday
    expect(monthRange(2028, 1)).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(shiftMonth(2026, 11, 1)).toEqual({ y: 2027, m0: 0 })
    expect(shiftMonth(2026, 0, -1)).toEqual({ y: 2025, m0: 11 })
    expect(eachDay('2026-10-30', '2026-11-02')).toHaveLength(4)
  })
  it('uses the IST calendar day', () => {
    // 20:00 UTC on the 22nd is already the 23rd in India
    expect(todayISO(new Date('2026-10-22T20:00:00Z'))).toBe('2026-10-23')
    expect(todayISO(new Date('2026-10-22T10:00:00Z'))).toBe('2026-10-22')
  })
  it('formats times', () => {
    expect(formatTime('00:00:00')).toBe('12:00 AM')
    expect(formatTime('13:30:00')).toBe('1:30 PM')
  })
})

describe('geo', () => {
  it('computes great-circle distance', () => {
    expect(haversineKm(12.9784, 77.6408, 12.9784, 77.6408)).toBe(0)
    // Delhi -> Mumbai is roughly 1150 km
    const dm = haversineKm(28.6139, 77.209, 19.076, 72.8777)
    expect(dm).toBeGreaterThan(1100)
    expect(dm).toBeLessThan(1200)
    // Indiranagar -> Electronic City, ~15 km (same number the SQL test asserts)
    expect(haversineKm(12.9784, 77.6408, 12.8452, 77.6602)).toBeCloseTo(14.9, 0)
  })
  it('formats distances, never inventing one', () => {
    expect(formatDistance(null)).toBeNull()
    expect(formatDistance(undefined)).toBeNull()
    expect(formatDistance(3.44)).toBe('3.4 km')
    expect(formatDistance(0.4)).toBe('< 1 km')
  })
})

describe('pricing and profile completeness', () => {
  it('shows price with its unit and hides an unset price', () => {
    expect(formatPrice(800, 'per_day')).toBe('₹800 / day')
    expect(formatPrice(35, 'per_sq_ft')).toBe('₹35 / sq ft')
    expect(formatPrice(0, 'per_visit')).toBeNull()
  })
  it('scores completeness from real fields', () => {
    const empty = profileCompleteness({ phone: null, avatar_url: null },
      { description: null, indicative_price: 0, latitude: null, languages: [], experience_years: 0, locality: 'Not set' }, 0)
    expect(empty).toBe(0)
    const full = profileCompleteness({ phone: '9876543210', avatar_url: 'x' },
      { description: 'Experienced electrician with ten years of work', indicative_price: 500, latitude: 1, languages: ['Hindi'], experience_years: 3, locality: 'Rohini' }, 2)
    expect(full).toBe(100)
  })
})

describe('error mapping', () => {
  const t = (k: string) => (k in en ? (en as Record<string, string>)[k] : k)
  it('extracts database error codes', () => {
    expect(errorCode({ message: 'ERR_DATE_BLOCKED' })).toBe('ERR_DATE_BLOCKED')
    expect(errorCode({ message: 'something else' })).toBeNull()
  })
  it('turns them into friendly text, with generic fallbacks', () => {
    expect(friendlyError({ message: 'ERR_SLOT_UNAVAILABLE' }, t)).toMatch(/just taken/)
    expect(friendlyError({ message: 'TypeError: Failed to fetch' }, t)).toBe(en['err.network'])
    expect(friendlyError({ message: 'new row violates row-level security policy' }, t)).toBe(en['err.ERR_FORBIDDEN'])
    expect(friendlyError({ message: 'Invalid login credentials' }, t)).toBe(en['err.invalidLogin'])
    expect(friendlyError(new Error('boom'), t)).toBe(en['err.generic'])
  })
})

describe('form schemas', () => {
  const worker = {
    full_name: 'Ravi Kumar', email: 'ravi@example.com', phone: '9876543210', password: 'longenough1', category_slug: 'electrician',
    skills: [], experience_years: 5, indicative_price: 600, pricing_unit: 'per_day', city: 'Bengaluru', locality: 'Indiranagar',
    service_radius_km: 10, languages: ['Hindi'], description: '', preferred_language: 'en', apply_verification: false,
  }
  it('accepts a valid worker registration', () => {
    expect(workerRegisterSchema.safeParse(worker).success).toBe(true)
  })
  it('rejects bad input with translatable messages', () => {
    const r = workerRegisterSchema.safeParse({ ...worker, email: 'nope', password: 'short', languages: [], experience_years: NaN })
    expect(r.success).toBe(false)
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message)
    expect(msgs).toEqual(expect.arrayContaining(['val.email', 'val.passwordMin', 'val.languages', 'val.number']))
    for (const m of msgs) expect(en).toHaveProperty([m])
  })
  it('validates customers, visits and reviews', () => {
    expect(customerRegisterSchema.safeParse({ full_name: 'A B', email: 'a@b.co', phone: '', password: '12345678', preferred_language: 'hi' }).success).toBe(true)
    expect(customerRegisterSchema.safeParse({ full_name: 'A B', email: 'a@b.co', phone: 'abc', password: '12345678', preferred_language: 'en' }).success).toBe(false)
    expect(visitDetailsSchema.safeParse({ locality: 'Koramangala', description: 'short' }).success).toBe(false)
    expect(visitDetailsSchema.safeParse({ locality: 'Koramangala', description: 'Need two fans installed' }).success).toBe(true)
    expect(reviewSchema.safeParse({ rating: 0 }).success).toBe(false)
    expect(reviewSchema.safeParse({ rating: 6 }).success).toBe(false)
    expect(reviewSchema.safeParse({ rating: 5, text: '' }).success).toBe(true)
  })
})
