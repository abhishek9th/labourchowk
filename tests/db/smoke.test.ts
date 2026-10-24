import { describe, it, expect } from 'vitest'
import { createDb } from './harness'

describe('migrations', () => {
  it('apply cleanly in order', async () => {
    const db = await createDb()
    const r = await db.query<{ n: string }>(`select count(*)::text n from public.service_categories`)
    expect(Number(r.rows[0].n)).toBeGreaterThanOrEqual(12)
  })
})
