import { describe, expect, it } from 'vitest'
import { asAnon, asUser, createDb, errorOf, isoDate, signUp, type Db } from './harness'

const uuid = () => crypto.randomUUID()

interface W { db: Db; w1: string; w2: string; cust: string; cat: string }

async function world(): Promise<W> {
  const db = await createDb()
  const w1 = await signUp(db, 'p1@t.dev', { role: 'worker', full_name: 'Tile Tarun', category_slug: 'tile-flooring', phone: '9811100001', locality: 'Indiranagar', city: 'Bengaluru' })
  const w2 = await signUp(db, 'p2@t.dev', { role: 'worker', full_name: 'Paint Pawan', category_slug: 'painter', phone: '9811100002', locality: 'Saket', city: 'Delhi' })
  const cust = await signUp(db, 'pc@t.dev', { role: 'customer', full_name: 'Cara Customer', phone: '9000000009' })
  const cat = (await db.query<any>(`select id from service_categories where slug='tile-flooring'`)).rows[0].id
  return { db, w1, w2, cust, cat }
}

const month = (off = 0) => isoDate(off * 30).slice(0, 7) + '-15'

async function addProject(w: W, who: string, title = 'Bathroom Tile Installation', extra = '') {
  return asUser(w.db, who, async () =>
    (await w.db.query<any>(
      `insert into worker_portfolio_projects (worker_id, title, description, category_id, location_label, completed_at ${extra ? ',' + extra.split('=')[0] : ''})
       values ($1,$2,'Full bathroom retiling',$3,'Indiranagar, Bengaluru',$4 ${extra ? ',' + extra.split('=')[1] : ''}) returning id`,
      [who, title, w.cat, month(-2)])).rows[0].id as string)
}
const pathFor = (worker: string, project: string) => `${worker}/${project}/${uuid()}.jpg`
async function addImage(w: W, who: string, project: string, path?: string) {
  const p = path ?? pathFor(who, project)
  await asUser(w.db, who, () => w.db.query(`insert into worker_portfolio_images (project_id, storage_path) values ($1,$2)`, [project, p]))
  return p
}

describe('permanent public id', () => {
  it('is generated once, unique, random-looking and not derived from private data', async () => {
    const w = await world()
    const ids = (await w.db.query<any>(`select public_id from worker_profiles`)).rows.map((r) => r.public_id)
    expect(new Set(ids).size).toBe(2)
    for (const id of ids) expect(id).toMatch(/^[A-HJ-NP-Z2-9]{10}$/)
    for (const id of ids) { expect(id).not.toContain('9811100'); }
    // many generations never collide and keep the format
    const many = (await w.db.query<any>(`select public.generate_public_id() id from generate_series(1,300)`)).rows.map((r) => r.id)
    expect(new Set(many).size).toBe(300)
  })

  it('the database enforces uniqueness and immutability', async () => {
    const w = await world()
    const [a, b] = (await w.db.query<any>(`select id, public_id from worker_profiles order by created_at`)).rows
    expect(await errorOf(w.db.query(`update worker_profiles set public_id=$1 where id=$2`, [a.public_id, b.id]))).toMatch(/ERR_PUBLIC_ID_IMMUTABLE|unique/i)
    expect(await errorOf(w.db.query(`update worker_profiles set public_id='ABCDEFGHJK' where id=$1`, [a.id]))).toMatch(/ERR_PUBLIC_ID_IMMUTABLE/)
    expect(await errorOf(w.db.query(`insert into worker_profiles (id, primary_category_id, locality, city, public_id)
      select id, primary_category_id, 'x1', 'y1', $1 from worker_profiles limit 0`, [a.public_id]))).toBeNull()
    // workers cannot even try (no column grant)
    expect(await asUser(w.db, w.w1, () => errorOf(w.db.query(`update worker_profiles set public_id='ABCDEFGHJK' where id=$1`, [w.w1])))).toMatch(/permission denied/i)
  })

  it('survives profile edits, profession change, availability, portfolio and reviews', async () => {
    const w = await world()
    const before = (await w.db.query<any>(`select public_id from worker_profiles where id=$1`, [w.w1])).rows[0].public_id
    await asUser(w.db, w.w1, async () => {
      await w.db.query(`update profiles set full_name='Renamed Tarun' where id=$1`, [w.w1])
      await w.db.query(`update worker_profiles set primary_category_id=(select id from service_categories where slug='mason'), description='new', is_public=false where id=$1`, [w.w1])
      await w.db.query(`update worker_profiles set is_public=true where id=$1`, [w.w1])
      await w.db.query(`select public.set_availability(array[(now() at time zone 'Asia/Kolkata')::date + 3], 'blocked')`)
    })
    await addProject(w, w.w1)
    const after = (await w.db.query<any>(`select public_id from worker_profiles where id=$1`, [w.w1])).rows[0].public_id
    expect(after).toBe(before)
  })

  it('resolves case-insensitively and returns nothing for unknown ids', async () => {
    const w = await world()
    const id = (await w.db.query<any>(`select public_id from worker_profiles where id=$1`, [w.w1])).rows[0].public_id as string
    const r = (s: string) => asAnon(w.db, async () => (await w.db.query<any>(`select public.resolve_public_id($1) r`, [s])).rows[0].r)
    expect(await r(id)).toBe(w.w1)
    expect(await r(' ' + id.toLowerCase() + ' ')).toBe(w.w1)
    expect(await r('ZZZZZZZZZZ')).toBeNull()
  })
})

describe('public visibility and contact consent', () => {
  it('hiding the profile removes it from every public surface but keeps the id', async () => {
    const w = await world()
    const id = (await w.db.query<any>(`select public_id from worker_profiles where id=$1`, [w.w1])).rows[0].public_id
    const proj = await addProject(w, w.w1)
    await addImage(w, w.w1, proj)
    const visible = () => asAnon(w.db, async () => ({
      profile: (await w.db.query<any>(`select 1 from public_worker_profiles where id=$1`, [w.w1])).rows.length,
      resolve: (await w.db.query<any>(`select public.resolve_public_id($1) r`, [id])).rows[0].r,
      projects: (await w.db.query<any>(`select 1 from public_portfolio_projects where worker_id=$1`, [w.w1])).rows.length,
      images: (await w.db.query<any>(`select 1 from public_portfolio_images where worker_id=$1`, [w.w1])).rows.length,
      search: (await w.db.query<any>(`select 1 from search_workers(p_category_slug => 'tile-flooring')`)).rows.length,
      calendar: (await w.db.query<any>(`select 1 from get_worker_calendar($1, current_date, current_date + 5)`, [w.w1])).rows.length,
      slots: (await w.db.query<any>(`select 1 from get_available_slots($1, current_date + 3)`, [w.w1])).rows.length,
      distance: (await w.db.query<any>(`select worker_distance($1, 12.9, 77.6) d`, [w.w1])).rows[0].d,
    }))
    const on = await visible()
    expect(on.profile).toBe(1); expect(on.resolve).toBe(w.w1); expect(on.projects).toBe(1); expect(on.images).toBe(1); expect(on.search).toBe(1)

    await asUser(w.db, w.w1, () => w.db.query(`update worker_profiles set is_public=false where id=$1`, [w.w1]))
    const off = await visible()
    expect(off).toEqual({ profile: 0, resolve: null, projects: 0, images: 0, search: 0, calendar: 0, slots: 0, distance: null })
    // new visit requests are refused too, and the id is unchanged
    const e = await asUser(w.db, w.cust, () => errorOf(w.db.query(
      `select public.create_visit_request($1,null,(now() at time zone 'Asia/Kolkata')::date + 4,'10:00','Area','',null,null,'Need tiles fixed in kitchen')`, [w.w1])))
    expect(e).toMatch(/ERR_WORKER_NOT_FOUND|ERR_DATE_UNAVAILABLE/)
    expect((await w.db.query<any>(`select public_id from worker_profiles where id=$1`, [w.w1])).rows[0].public_id).toBe(id)
    // the owner still sees their own calendar and portfolio
    expect(await asUser(w.db, w.w1, async () => (await w.db.query(`select * from get_worker_calendar($1, current_date, current_date + 5)`, [w.w1])).rows.length)).toBe(6)
    expect(await asUser(w.db, w.w1, async () => (await w.db.query(`select * from worker_portfolio_projects`)).rows.length)).toBe(1)
  })

  it('public reviews of hidden workers are hidden as well', async () => {
    const w = await world()
    await w.db.query(`insert into visit_requests (customer_id,worker_id,category_id,requested_date,start_time,end_time,customer_locality,job_description,status)
      values ($1,$2,$3,current_date - 5,'10:00','11:00','Area X','long enough description','completed')`, [w.cust, w.w1, w.cat])
    const v = (await w.db.query<any>(`select id from visit_requests`)).rows[0].id
    await asUser(w.db, w.cust, () => w.db.query(`select public.submit_review($1, 5, 'great')`, [v]))
    const n = () => asAnon(w.db, async () => (await w.db.query(`select * from public_reviews`)).rows.length)
    expect(await n()).toBe(1)
    await w.db.query(`update worker_profiles set is_public=false where id=$1`, [w.w1])
    expect(await n()).toBe(0)
  })

  it('contact details are private unless the worker opted in, per channel', async () => {
    const w = await world()
    const contact = () => asAnon(w.db, async () => (await w.db.query<any>(`select * from get_public_contact($1)`, [w.w1])).rows)
    expect(await contact()).toEqual([])                                   // default: nothing shared
    for (const view of ['public_worker_profiles', 'public_portfolio_projects', 'public_reviews']) {
      const cols = (await w.db.query<any>(`select column_name from information_schema.columns where table_name=$1`, [view])).rows.map((r) => r.column_name)
      expect(cols.some((c: string) => /phone|email|latitude|longitude|address/.test(c)), view).toBe(false)
    }
    await asUser(w.db, w.w1, () => w.db.query(`update worker_profiles set share_whatsapp=true where id=$1`, [w.w1]))
    expect(await contact()).toEqual([{ allow_call: false, allow_whatsapp: true, phone: '9811100001' }])
    await asUser(w.db, w.w1, () => w.db.query(`update worker_profiles set share_whatsapp=false where id=$1`, [w.w1]))
    expect(await contact()).toEqual([])
    // other users cannot flip someone else's consent
    const r = await asUser(w.db, w.cust, () => w.db.query(`update worker_profiles set share_phone=true where id=$1`, [w.w1]))
    expect(r.affectedRows).toBe(0)
    const r2 = await asUser(w.db, w.w2, () => w.db.query(`update worker_profiles set share_phone=true where id=$1`, [w.w1]))
    expect(r2.affectedRows).toBe(0)
  })
})

describe('portfolio ownership and integrity', () => {
  it('a worker can create a project with several photos; first becomes cover; persists', async () => {
    const w = await world()
    const p = await addProject(w, w.w1)
    const paths = [await addImage(w, w.w1, p), await addImage(w, w.w1, p), await addImage(w, w.w1, p)]
    const imgs = (await w.db.query<any>(`select storage_path, display_order, is_cover from worker_portfolio_images order by display_order`)).rows
    expect(imgs.map((i) => i.storage_path)).toEqual(paths)
    expect(imgs.map((i) => i.display_order)).toEqual([0, 1, 2])
    expect(imgs.map((i) => i.is_cover)).toEqual([true, false, false])
  })

  it('only the owner can see/edit/delete; others and anon cannot', async () => {
    const w = await world()
    const p = await addProject(w, w.w1)
    await addImage(w, w.w1, p)
    // another worker
    expect((await asUser(w.db, w.w2, () => w.db.query(`update worker_portfolio_projects set title='Hacked title' where id=$1`, [p]))).affectedRows).toBe(0)
    expect((await asUser(w.db, w.w2, () => w.db.query(`delete from worker_portfolio_projects where id=$1`, [p]))).affectedRows).toBe(0)
    expect((await asUser(w.db, w.w2, () => w.db.query(`delete from worker_portfolio_images`))).affectedRows).toBe(0)
    expect(await asUser(w.db, w.w2, async () => (await w.db.query(`select * from worker_portfolio_projects`)).rows.length)).toBe(0)
    expect(await asUser(w.db, w.w2, () => errorOf(w.db.query(`select public.set_portfolio_images_layout($1, array[]::uuid[], $2)`, [p, uuid()])))).toMatch(/ERR_NOT_FOUND/)
    // a worker cannot plant a project or image under someone else's id / project
    expect(await asUser(w.db, w.w2, () => errorOf(w.db.query(
      `insert into worker_portfolio_projects (worker_id, title, completed_at) values ($1,'Fake project', current_date)`, [w.w1])))).toMatch(/row-level security/i)
    expect(await errorOf(addImage(w, w.w2, p))).toMatch(/ERR_INVALID_PATH|row-level security/i)
    expect(await errorOf(addImage(w, w.w2, p, `${w.w1}/${p}/${uuid()}.jpg`))).toMatch(/row-level security/i)   // passes the path rule, RLS stops it
    // customers have no worker row at all
    expect(await asUser(w.db, w.cust, () => errorOf(w.db.query(
      `insert into worker_portfolio_projects (worker_id, title, completed_at) values ($1,'Customer project', current_date)`, [w.cust])))).toMatch(/violates foreign key|row-level|permission/i)
    // anonymous: no table access at all
    expect(await asAnon(w.db, () => errorOf(w.db.query(`select * from worker_portfolio_projects`)))).toMatch(/permission denied/i)
    expect(await asAnon(w.db, () => errorOf(w.db.query(`select * from worker_portfolio_images`)))).toMatch(/permission denied/i)
    // the owner can
    expect((await asUser(w.db, w.w1, () => w.db.query(`update worker_portfolio_projects set title='Better title' where id=$1`, [p]))).affectedRows).toBe(1)
  })

  it('validates metadata and normalises it', async () => {
    const w = await world()
    const bad = (cols: string, vals: string) => asUser(w.db, w.w1, () => errorOf(w.db.query(
      `insert into worker_portfolio_projects (worker_id, title, completed_at ${cols}) values ($1,'Valid title','2025-03-10' ${vals})`, [w.w1])))
    expect(await bad(', project_price', ', 500')).toMatch(/portfolio_price_pair/)           // price without unit
    expect(await bad(', project_area_sqft', ', -5')).toMatch(/check constraint/)
    expect(await bad(", project_price, project_price_unit", ", 5, 'per_year'")).toMatch(/check constraint/)
    expect(await asUser(w.db, w.w1, () => errorOf(w.db.query(
      `insert into worker_portfolio_projects (worker_id, title, completed_at) values ($1,'No','2025-03-10')`, [w.w1])))).toMatch(/check constraint/)
    expect(await asUser(w.db, w.w1, () => errorOf(w.db.query(
      `insert into worker_portfolio_projects (worker_id, title, completed_at) values ($1,'Future project',(current_date + 90))`, [w.w1])))).toMatch(/ERR_FUTURE_DATE/)
    expect(await asUser(w.db, w.w1, () => errorOf(w.db.query(
      `insert into worker_portfolio_projects (worker_id, title, completed_at, project_tags) values ($1,'Too many tags','2025-03-10', array['a1','b1','c1','d1','e1','f1','g1','h1','i1'])`, [w.w1])))).toMatch(/check constraint|ERR_INVALID_INPUT/)
    const ok = await asUser(w.db, w.w1, async () => (await w.db.query<any>(
      `insert into worker_portfolio_projects (worker_id, title, completed_at, project_tags, project_price, project_price_unit, project_area_sqft)
       values ($1,'Villa painting','2025-03-27', array[' Residential ','residential','RENOVATION'], 45000, 'per_task', 1200) returning completed_at::text d, project_tags t`, [w.w1])).rows[0])
    expect(ok.d).toBe('2025-03-01')
    expect(ok.t).toEqual(['renovation', 'residential'])
    // private customer info cannot hide in fields we expose: there is simply no customer column
    const cols = (await w.db.query<any>(`select column_name from information_schema.columns where table_name='worker_portfolio_projects'`)).rows.map((r) => r.column_name)
    expect(cols.some((c: string) => /customer|phone|address/.test(c))).toBe(false)
  })

  it('image paths must sit in the owner\'s folder, under the same project; max 10 photos; max 30 projects', async () => {
    const w = await world()
    const p = await addProject(w, w.w1)
    const other = await addProject(w, w.w2)
    expect(await errorOf(addImage(w, w.w1, p, `${w.w2}/${p}/${uuid()}.jpg`))).toMatch(/ERR_INVALID_PATH/)      // other worker's folder
    expect(await errorOf(addImage(w, w.w1, p, `${w.w1}/${other}/${uuid()}.jpg`))).toMatch(/ERR_INVALID_PATH/)   // other project
    expect(await errorOf(addImage(w, w.w1, p, `${w.w1}/${p}/../../evil.jpg`))).toMatch(/check constraint/)
    expect(await errorOf(addImage(w, w.w1, p, `${w.w1}/${p}/${uuid()}.exe`))).toMatch(/check constraint/)
    for (let i = 0; i < 10; i++) expect(await errorOf(addImage(w, w.w1, p))).toBeNull()
    expect(await errorOf(addImage(w, w.w1, p))).toMatch(/ERR_TOO_MANY_PHOTOS/)
    for (let i = 1; i < 30; i++) await addProject(w, w.w1, `Project number ${i}`)
    expect(await errorOf(addProject(w, w.w1, 'One too many'))).toMatch(/ERR_TOO_MANY_PROJECTS/)
  })

  it('reorders photos and sets the cover atomically; invalid layouts are rejected', async () => {
    const w = await world()
    const p = await addProject(w, w.w1)
    for (let i = 0; i < 3; i++) await addImage(w, w.w1, p)
    const ids = (await w.db.query<any>(`select id from worker_portfolio_images order by display_order`)).rows.map((r) => r.id)
    const layout = (ord: string[], cover: string) => asUser(w.db, w.w1, () => w.db.query(`select public.set_portfolio_images_layout($1, $2::uuid[], $3)`, [p, ord, cover]))
    await layout([ids[2], ids[0], ids[1]], ids[1])
    const rows = (await w.db.query<any>(`select id, display_order, is_cover from worker_portfolio_images order by display_order`)).rows
    expect(rows.map((r) => r.id)).toEqual([ids[2], ids[0], ids[1]])
    expect(rows.filter((r) => r.is_cover).map((r) => r.id)).toEqual([ids[1]])
    expect(await errorOf(layout([ids[0], ids[1]], ids[0]))).toMatch(/ERR_INVALID_INPUT/)             // missing one
    expect(await errorOf(layout([ids[0], ids[1], uuid()], ids[0]))).toMatch(/ERR_INVALID_INPUT/)     // foreign id
    expect(await errorOf(layout(ids, uuid()))).toMatch(/ERR_INVALID_INPUT/)                          // cover not in list
    // two covers can never exist
    expect(await errorOf(w.db.query(`update worker_portfolio_images set is_cover=true`))).toMatch(/portfolio_one_cover|duplicate key/)
  })

  it('deleting the cover promotes another; deleting a project removes its image rows', async () => {
    const w = await world()
    const p = await addProject(w, w.w1)
    const a = await addImage(w, w.w1, p); await addImage(w, w.w1, p)
    await asUser(w.db, w.w1, () => w.db.query(`delete from worker_portfolio_images where storage_path=$1`, [a]))
    const left = (await w.db.query<any>(`select is_cover from worker_portfolio_images`)).rows
    expect(left).toEqual([{ is_cover: true }])
    await asUser(w.db, w.w1, () => w.db.query(`delete from worker_portfolio_projects where id=$1`, [p]))
    expect((await w.db.query(`select 1 from worker_portfolio_images`)).rows.length).toBe(0)
  })

  it('deleting a worker account cascades portfolio rows', async () => {
    const w = await world()
    const p = await addProject(w, w.w1)
    await addImage(w, w.w1, p)
    await w.db.query(`delete from auth.users where id=$1`, [w.w1])
    expect((await w.db.query(`select 1 from worker_portfolio_projects`)).rows.length).toBe(0)
    expect((await w.db.query(`select 1 from worker_portfolio_images`)).rows.length).toBe(0)
  })
})

describe('public portfolio and discovery', () => {
  it('anonymous visitors see only published projects/images, newest first, on the right worker', async () => {
    const w = await world()
    const old = await asUser(w.db, w.w1, async () => (await w.db.query<any>(
      `insert into worker_portfolio_projects (worker_id,title,completed_at) values ($1,'Older project','2024-01-10') returning id`, [w.w1])).rows[0].id)
    const recent = await addProject(w, w.w1, 'Recent project')
    const draft = await asUser(w.db, w.w1, async () => (await w.db.query<any>(
      `insert into worker_portfolio_projects (worker_id,title,completed_at,is_published) values ($1,'Draft project','2025-01-10',false) returning id`, [w.w1])).rows[0].id)
    const other = await addProject(w, w.w2, 'Painter project')
    for (const p of [old, recent, draft]) await addImage(w, w.w1, p)
    await addImage(w, w.w2, other)
    const res = await asAnon(w.db, async () => ({
      p1: (await w.db.query<any>(`select title from public_portfolio_projects where worker_id=$1 order by completed_at desc`, [w.w1])).rows.map((r) => r.title),
      imgs: (await w.db.query<any>(`select project_id from public_portfolio_images where worker_id=$1`, [w.w1])).rows.map((r) => r.project_id).sort(),
      count: (await w.db.query<any>(`select portfolio_count from public_worker_profiles where id=$1`, [w.w1])).rows[0].portfolio_count,
    }))
    expect(res.p1).toEqual(['Recent project', 'Older project'])
    expect(res.imgs).toEqual([old, recent].sort())
    expect(res.count).toBe(2)
  })

  it('search results carry a thumbnail (newest project cover) and the project count; empty portfolios have none', async () => {
    const w = await world()
    const a = await asUser(w.db, w.w1, async () => (await w.db.query<any>(
      `insert into worker_portfolio_projects (worker_id,title,completed_at) values ($1,'Older project','2024-01-10') returning id`, [w.w1])).rows[0].id)
    const b = await addProject(w, w.w1, 'Recent project')
    await addImage(w, w.w1, a)
    const recentPath = await addImage(w, w.w1, b)
    const rows = await asAnon(w.db, async () => (await w.db.query<any>(`select id, cover_path, portfolio_count from search_workers()`)).rows)
    const mine = rows.find((r: any) => r.id === w.w1), none = rows.find((r: any) => r.id === w.w2)
    expect(mine.cover_path).toBe(recentPath)
    expect(mine.portfolio_count).toBe(2)
    expect(none.cover_path).toBeNull()
    expect(none.portfolio_count).toBe(0)
  })
})
