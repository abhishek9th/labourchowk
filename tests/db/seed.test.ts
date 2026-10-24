import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { asAnon, createDb, seedSql } from './harness'

describe('demo seed', () => {
  it('loads sample data flagged as demo, never verified, idempotent', async () => {
    const db = await createDb()
    await db.exec(seedSql())
    await db.exec(seedSql()) // second run is a no-op

    const w = await db.query<any>(`select count(*)::int n, count(*) filter (where is_demo) d,
        count(*) filter (where verification_status = 'verified') v from worker_profiles`)
    expect(w.rows[0]).toEqual({ n: 20, d: 20, v: 0 })
    const users = await db.query<any>(`select count(*)::int n from auth.users`)
    expect(users.rows[0].n).toBe(23)

    const r = await db.query<any>(`select count(*)::int n, count(*) filter (where is_demo) d from reviews`)
    expect(r.rows[0].n).toBe(r.rows[0].d)
    expect(r.rows[0].n).toBeGreaterThan(20)

    // sample ratings are computed from the sample reviews, not hard-coded
    const bad = await db.query<any>(`select count(*)::int n from worker_profiles w
      where w.review_count <> (select count(*) from reviews r where r.worker_id = w.id)`)
    expect(bad.rows[0].n).toBe(0)

    // public search works against the sample data
    const rows = await asAnon(db, async () => (await db.query<any>(
      `select * from search_workers(p_category_slug => 'electrician', p_lat => 12.9784, p_lng => 77.6408)`)).rows)
    expect(rows.length).toBe(3)
    expect(rows[0].full_name).toBe('Ramesh Yadav')
    expect(rows.every((x: any) => x.is_demo)).toBe(true)
  })
})

describe('seed_manoj.sql', () => {
  it('creates the demo customer and Manoj (tiles, ₹80/sq ft) flagged as demo, with no reviews or photos', async () => {
    const db = await createDb()
    const sql = readFileSync(join(__dirname, '../../supabase/seed_manoj.sql'), 'utf8')
    await db.exec(sql)
    await db.exec(sql) // idempotent
    const w = await db.query<any>(`select p.full_name, c.slug, w.indicative_price::int price, w.pricing_unit, w.is_demo, w.review_count,
      (select count(*) from worker_portfolio_projects where worker_id = w.id)::int projects
      from worker_profiles w join profiles p on p.id = w.id join service_categories c on c.id = w.primary_category_id`)
    expect(w.rows).toEqual([{ full_name: 'Manoj', slug: 'tile-flooring', price: 80, pricing_unit: 'per_sq_ft', is_demo: true, review_count: 0, projects: 0 }])
    const u = await db.query<any>(`select count(*)::int n from profiles where role = 'customer' and is_demo`)
    expect(u.rows[0].n).toBe(1)
  })
})

describe('seed_bulk.sql', () => {
  it('adds 25 flagged sample workers to every profession, none verified, no reviews or photos', async () => {
    const db = await createDb()
    const sql = readFileSync(join(__dirname, '../../supabase/seed_bulk.sql'), 'utf8')
    await db.exec(sql)
    await db.exec(sql) // idempotent
    const r = await db.query<any>(`select c.slug, count(*)::int n, bool_and(w.is_demo) demo, count(*) filter (where w.verification_status <> 'unverified')::int verified,
      sum(w.review_count)::int reviews from worker_profiles w join service_categories c on c.id = w.primary_category_id group by c.slug order by c.slug`)
    expect(r.rows).toHaveLength(12)
    for (const row of r.rows) expect(row, row.slug).toMatchObject({ n: 25, demo: true, verified: 0, reviews: 0 })
    expect((await db.query<any>(`select count(*)::int n from worker_portfolio_projects`)).rows[0].n).toBe(0)
    const names = (await db.query<any>(`select count(distinct p.full_name)::int d, count(*)::int n from profiles p where p.role = 'worker'`)).rows[0]
    expect(names.d).toBe(names.n)
    // Noida users find nearby workers in every category
    const near = await db.query<any>(`select count(distinct category_slug)::int n from search_workers(p_lat => 28.628, p_lng => 77.365, p_max_distance_km => 15)`)
    expect(near.rows[0].n).toBe(12)
  })
})

describe('seed_portfolio_reviews.sql', () => {
  it('adds flagged sample reviews and sample previous works only for sample workers rated above 4.2', async () => {
    const db = await createDb()
    await db.exec(seedSql())
    await db.exec(readFileSync(join(__dirname, '../../supabase/seed_bulk.sql'), 'utf8'))
    const sql = readFileSync(join(__dirname, '../../supabase/seed_portfolio_reviews.sql'), 'utf8')
    await db.exec(sql)
    const before = await db.query<any>(`select (select count(*) from reviews)::int r, (select count(*) from worker_portfolio_projects)::int p`)
    await db.exec(sql) // idempotent: second run adds no projects, no reviews for workers that already have 3
    const after = await db.query<any>(`select (select count(*) from reviews)::int r, (select count(*) from worker_portfolio_projects)::int p`)
    expect(after.rows[0]).toEqual(before.rows[0])

    // every sample review is flagged and attached to a sample visit; ratings stay in range
    const rv = await db.query<any>(`select count(*)::int n, count(*) filter (where is_demo)::int d, min(rating)::int lo, max(rating)::int hi from reviews`)
    expect(rv.rows[0].n).toBe(rv.rows[0].d)
    expect(rv.rows[0].lo).toBeGreaterThanOrEqual(1)
    expect(rv.rows[0].hi).toBeLessThanOrEqual(5)

    // every worker rated above 4.2 has 2-3 sample projects with a photo; nobody else has any
    const hi = await db.query<any>(`select w.id, w.rating_avg, (select count(*) from worker_portfolio_projects pp where pp.worker_id = w.id)::int n,
      (select count(*) from worker_portfolio_projects pp join worker_portfolio_images i on i.project_id = pp.id where pp.worker_id = w.id)::int imgs,
      (select bool_and('sample' = any(pp.project_tags)) from worker_portfolio_projects pp where pp.worker_id = w.id) tagged
      from worker_profiles w`)
    const good = hi.rows.filter((r: any) => Number(r.rating_avg) > 4.2)
    expect(good.length).toBeGreaterThan(100)
    const vip = (await db.query<any>(`select id from auth.users where email in ('demo.worker01@labourchowk.demo','demo.worker02@labourchowk.demo','demo.worker03@labourchowk.demo')`)).rows.map((x: any) => x.id)
    expect(vip).toHaveLength(3)
    for (const id of vip) expect(hi.rows.find((x: any) => x.id === id).n).toBe(3)
    for (const r of good) {
      expect(r.n).toBe(Number(r.rating_avg) >= 4.6 || vip.includes(r.id) ? 3 : 2)
      expect(r.imgs).toBe(r.n)
      expect(r.tagged).toBe(true)
    }
    for (const r of hi.rows.filter((x: any) => Number(x.rating_avg) <= 4.2 && !vip.includes(x.id))) expect(r.n).toBe(0)
  }, 120_000)
})
