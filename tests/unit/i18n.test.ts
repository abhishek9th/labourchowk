import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { en } from '@/i18n/en'
import { hi } from '@/i18n/hi'
import { PRICING_UNITS } from '@/lib/types'

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : []
  })
}

describe('translations', () => {
  const src = walk(join(__dirname, '../../src')).filter((f) => !f.includes(join('src', 'i18n')))
  const used = new Set<string>()
  for (const f of src) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) used.add(m[1])
  }

  it('every statically used key exists in the English dictionary', () => {
    const missing = [...used].filter((k) => !(k in en))
    expect(missing).toEqual([])
  })

  it('dynamic key families are complete', () => {
    const need = [
      ...['pending', 'accepted', 'declined', 'completed', 'cancelled'].map((s) => `status.${s}`),
      ...PRICING_UNITS.map((u) => `unit.${u}`),
      ...['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => `day.${d}`),
      ...['nearest', 'rating', 'price_low', 'price_high', 'reviews', 'soonest'].map((s) => `sort.${s}`),
      ...['verified', 'pending', 'unverified', 'rejected'].map((s) => `verification.${s}`),
      ...['denied', 'unavailable', 'timeout', 'unsupported'].map((s) => `location.problem.${s}`),
      ...['available', 'blocked', 'off', 'full', 'past'].map((s) => `calendar.state.${s}`),
      ...['1', '2', '3', '4'].flatMap((n) => [`trust.${n}.title`, `trust.${n}.text`]),
      ...['1', '2', '3'].flatMap((n) => [`how.${n}.title`, `how.${n}.text`]),
      ...['customer', 'worker'].flatMap((r) => [`auth.role.${r}`, `auth.role.${r}.hint`]),
      ...['p1', 'p2', 'p3', 'p4', 'p5'].map((k) => `legal.privacy.${k}`),
      ...['t1', 't2', 't3', 't4', 't5'].map((k) => `legal.terms.${k}`),
      'legal.privacy.title', 'legal.terms.title',
    ]
    expect(need.filter((k) => !(k in en))).toEqual([])
  })

  it('every error code raised by the database has a message', () => {
    const sql = ['0003_functions.sql', '0005_portfolio_passport.sql']
      .map((f) => readFileSync(join(__dirname, '../../supabase/migrations', f), 'utf8')).join(' ')
    const codes = new Set([...sql.matchAll(/'(ERR_[A-Z_]+)'/g)].map((m) => m[1]))
    const missing = [...codes].filter((c) => !(`err.${c}` in en))
    expect(missing).toEqual([])
  })

  it('every validation message key used by schemas exists', () => {
    const schemas = readFileSync(join(__dirname, '../../src/lib/schemas.ts'), 'utf8')
    const keys = [...schemas.matchAll(/'(val\.[a-zA-Z]+)'/g)].map((m) => m[1])
    expect(keys.filter((k) => !(k in en))).toEqual([])
  })

  it('Hindi only defines keys that exist in English and keeps placeholders', () => {
    const extra = Object.keys(hi).filter((k) => !(k in en))
    expect(extra).toEqual([])
    for (const [k, v] of Object.entries(hi)) {
      const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
      expect(ph(v as string), k).toBe(ph((en as Record<string, string>)[k]))
    }
  })
})
