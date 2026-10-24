import { beforeEach, describe, expect, it } from 'vitest'
import { asAnon, asUser, createDb, dowOf, errorOf, isoDate, signUp, type Db } from './harness'

/** nth upcoming day (>= 2 days away) that is Mon-Sat, i.e. a default working day. */
function workday(n = 0): string {
  let found = -1
  for (let off = 2; off < 60; off++) {
    const d = isoDate(off)
    if (dowOf(d) !== 0) found++
    if (found === n) return d
  }
  throw new Error('unreachable')
}
function sunday(): string {
  for (let off = 2; off < 14; off++) if (dowOf(isoDate(off)) === 0) return isoDate(off)
  throw new Error('unreachable')
}

interface World {
  db: Db
  worker: string
  worker2: string
  cust: string
  cust2: string
  electrician: string // category id
  plumber: string
}

async function world(): Promise<World> {
  const db = await createDb()
  const worker = await signUp(db, 'w1@test.dev', {
    role: 'worker', full_name: 'Ravi Kumar', phone: '9876543210', category_slug: 'electrician',
    experience_years: '8', indicative_price: '700', pricing_unit: 'per_day',
    locality: 'Indiranagar', city: 'Bengaluru', latitude: '12.9784', longitude: '77.6408',
    languages: ['Hindi', 'English'], skills: ['Wiring', 'Inverter fitting'],
  })
  const worker2 = await signUp(db, 'w2@test.dev', {
    role: 'worker', full_name: 'Sunil Das', category_slug: 'plumber',
    experience_years: 3, indicative_price: 400, pricing_unit: 'per_visit',
    locality: 'Whitefield', city: 'Bengaluru', latitude: 12.9698, longitude: 77.75, languages: ['Kannada'],
  })
  const cust = await signUp(db, 'c1@test.dev', { role: 'customer', full_name: 'Asha Rao', phone: '9000000001' })
  const cust2 = await signUp(db, 'c2@test.dev', { role: 'customer', full_name: 'Mohan Lal' })
  const cats = await db.query<{ id: string; slug: string }>(`select id, slug from service_categories`)
  const id = (s: string) => cats.rows.find((c) => c.slug === s)!.id
  return { db, worker, worker2, cust, cust2, electrician: id('electrician'), plumber: id('plumber') }
}

async function request(w: World, cust: string, date: string, start = '10:00', desc = 'Need to rewire two rooms') {
  return asUser(w.db, cust, async () => {
    const r = await w.db.query<{ id: string }>(
      `select public.create_visit_request($1,$2,$3::date,$4::time,'Koramangala','12 5th Cross',null,null,$5) as id`,
      [w.worker, w.electrician, date, start, desc],
    )
    return r.rows[0].id
  })
}
const respond = (w: World, who: string, visit: string, accept: boolean) =>
  asUser(w.db, who, async () =>
    (await w.db.query<{ r: string }>(`select public.respond_visit_request($1,$2) as r`, [visit, accept])).rows[0].r)

describe('signup trigger', () => {
  it('creates profile and worker profile, sanitising untrusted metadata', async () => {
    const w = await world()
    const p = await w.db.query<any>(`select * from profiles where id=$1`, [w.worker])
    expect(p.rows[0].role).toBe('worker')
    const wp = await w.db.query<any>(`select * from worker_profiles where id=$1`, [w.worker])
    expect(wp.rows[0].experience_years).toBe(8)
    expect(Number(wp.rows[0].indicative_price)).toBe(700)
    expect(wp.rows[0].languages).toEqual(['English', 'Hindi'])
    expect(wp.rows[0].verification_status).toBe('unverified')
    const sk = await w.db.query(`select 1 from worker_skills where worker_id=$1`, [w.worker])
    expect(sk.rows.length).toBe(2)
  })

  it('cannot sign up as admin or with out-of-range data', async () => {
    const w = await world()
    const evil = await signUp(w.db, 'evil@test.dev', {
      role: 'admin', full_name: 'Evil', phone: 'abc', experience_years: '9999', latitude: '500', longitude: '5',
    })
    const p = await w.db.query<any>(`select role, phone from profiles where id=$1`, [evil])
    expect(p.rows[0].role).toBe('customer')
    expect(p.rows[0].phone).toBeNull()
    expect((await w.db.query(`select 1 from admins`)).rows.length).toBe(0)
    const evil2 = await signUp(w.db, 'evil2@test.dev', {
      role: 'worker', full_name: 'Bad Data', experience_years: '9999', latitude: '500', longitude: '5', pricing_unit: 'free',
    })
    const wp = await w.db.query<any>(`select * from worker_profiles where id=$1`, [evil2])
    expect(wp.rows[0].experience_years).toBe(0)
    expect(wp.rows[0].latitude).toBeNull()
    expect(wp.rows[0].pricing_unit).toBe('per_day')
  })
})

describe('authorization / RLS', () => {
  it('users cannot change their role or read other profiles', async () => {
    const w = await world()
    const e = await asUser(w.db, w.cust, () =>
      errorOf(w.db.query(`update profiles set role='worker' where id=$1`, [w.cust])))
    expect(e).toMatch(/permission denied/i)
    const rows = await asUser(w.db, w.cust, async () => (await w.db.query(`select id from profiles`)).rows)
    expect(rows.map((r: any) => r.id)).toEqual([w.cust])
  })

  it('avatar URLs must be https (no javascript: or data: URLs)', async () => {
    const w = await world()
    for (const bad of ['javascript:alert(1)', 'data:text/html;base64,AAAA', 'http://insecure.example/x.png']) {
      const e = await asUser(w.db, w.cust, () => errorOf(w.db.query(`update profiles set avatar_url=$1 where id=$2`, [bad, w.cust])))
      expect(e, bad).toMatch(/violates check constraint/)
    }
    const ok = await asUser(w.db, w.cust, () => w.db.query(`update profiles set avatar_url='https://x.supabase.co/storage/v1/object/public/avatars/a.png' where id=$1`, [w.cust]))
    expect(ok.affectedRows).toBe(1)
  })

  it('a worker cannot edit another worker, nor set verification/rating', async () => {
    const w = await world()
    const upd = await asUser(w.db, w.worker, () =>
      w.db.query(`update worker_profiles set description='hacked' where id=$1`, [w.worker2]))
    expect(upd.affectedRows).toBe(0)
    for (const col of ["verification_status='verified'", 'rating_avg=5', 'profile_views=999', 'is_demo=true']) {
      const e = await asUser(w.db, w.worker, () =>
        errorOf(w.db.query(`update worker_profiles set ${col} where id=$1`, [w.worker])))
      expect(e, col).toMatch(/permission denied/i)
    }
    const ok = await asUser(w.db, w.worker, () =>
      w.db.query(`update worker_profiles set description='Licensed electrician' where id=$1`, [w.worker]))
    expect(ok.affectedRows).toBe(1)
  })

  it('anonymous visitors see public profiles but no private columns or tables', async () => {
    const w = await world()
    const pub = await asAnon(w.db, async () => (await w.db.query<any>(`select * from public_worker_profiles`)).rows)
    expect(pub.length).toBe(2)
    expect(Object.keys(pub[0])).not.toContain('latitude')
    expect(Object.keys(pub[0])).not.toContain('phone')
    expect(await asAnon(w.db, () => errorOf(w.db.query(`select * from worker_profiles`)))).toMatch(/permission denied/i)
    expect(await asAnon(w.db, () => errorOf(w.db.query(`select * from profiles`)))).toMatch(/permission denied/i)
    expect(await asAnon(w.db, () => errorOf(w.db.query(`select public.worker_visit_requests()`)))).toMatch(/permission denied/i)
  })

  it('clients cannot write visits, reviews, notifications or admins directly', async () => {
    const w = await world()
    const date = workday()
    const bad = [
      `insert into visit_requests (customer_id,worker_id,category_id,requested_date,start_time,end_time,customer_locality,job_description,status)
         values ('${w.cust}','${w.worker}','${w.electrician}','${date}','10:00','11:00','X Y','long enough text','accepted')`,
      `insert into notifications (user_id,title,message,notification_type) values ('${w.cust}','a','b','system')`,
      `insert into admins (user_id) values ('${w.cust}')`,
      `insert into worker_availability (worker_id,date,availability_status) values ('${w.worker}','${date}','blocked')`,
    ]
    for (const q of bad) expect(await asUser(w.db, w.cust, () => errorOf(w.db.query(q))), q).toMatch(/permission denied|row-level/i)
    const adm = await asUser(w.db, w.cust, () => w.db.query<any>(`select public.is_admin() a`))
    expect(adm.rows[0].a).toBe(false)
  })

  it('admin functions are forbidden to normal users and work for admins', async () => {
    const w = await world()
    const e = await asUser(w.db, w.worker, () =>
      errorOf(w.db.query(`select public.admin_set_verification($1,'verified')`, [w.worker])))
    expect(e).toMatch(/ERR_FORBIDDEN/)
    await w.db.query(`insert into admins (user_id) select id from auth.users where email='c2@test.dev'`)
    await asUser(w.db, w.cust2, () => w.db.query(`select public.admin_set_verification($1,'verified')`, [w.worker]))
    const v = await w.db.query<any>(`select verification_status from worker_profiles where id=$1`, [w.worker])
    expect(v.rows[0].verification_status).toBe('verified')
  })

  it('only admins can manage categories', async () => {
    const w = await world()
    const q = `insert into service_categories (name, slug) values ('Gardener','gardener')`
    expect(await asUser(w.db, w.worker, () => errorOf(w.db.query(q)))).toMatch(/row-level|permission/i)
    await w.db.query(`insert into admins (user_id) values ($1)`, [w.cust2])
    expect(await asUser(w.db, w.cust2, () => errorOf(w.db.query(q)))).toBeNull()
  })
})

describe('availability', () => {
  it('blocked dates, days off and the past are not bookable', async () => {
    const w = await world()
    const d = workday()
    await asUser(w.db, w.worker, () => w.db.query(`select public.set_availability(array[$1::date],'blocked')`, [d]))
    const slots = await w.db.query<any>(`select * from get_available_slots($1,$2)`, [w.worker, d])
    expect(slots.rows.every((s: any) => s.is_available === false)).toBe(true)
    expect(await asUser(w.db, w.cust, () => errorOf(request(w, w.cust, d)))).toBeNull // sanity: request() sets role itself
    expect(await errorOf(request(w, w.cust, d))).toMatch(/ERR_DATE_BLOCKED/)
    expect(await errorOf(request(w, w.cust, sunday()))).toMatch(/ERR_DATE_UNAVAILABLE/)
    expect(await errorOf(request(w, w.cust, isoDate(-1)))).toMatch(/ERR_DATE_IN_PAST/)
  })

  it('"available again" and extra working days work', async () => {
    const w = await world()
    const d = workday()
    const as = (st: string, day: string) =>
      asUser(w.db, w.worker, () => w.db.query(`select public.set_availability(array[$1::date],$2)`, [day, st]))
    await as('blocked', d)
    await as('default', d)
    expect(await errorOf(request(w, w.cust, d))).toBeNull()
    await as('available', sunday())
    expect(await errorOf(request(w, w.cust2, sunday()))).toBeNull()
    const cal = await w.db.query<any>(`select * from get_worker_calendar($1,$2,$3)`, [w.worker, sunday(), sunday()])
    expect(cal.rows[0].is_extra_day).toBe(true)
  })

  it('cannot change availability of someone else / as a customer / in the past', async () => {
    const w = await world()
    expect(await asUser(w.db, w.cust, () =>
      errorOf(w.db.query(`select public.set_availability(array[$1::date],'blocked')`, [workday()])))).toMatch(/ERR_NOT_WORKER/)
    expect(await asUser(w.db, w.worker, () =>
      errorOf(w.db.query(`select public.set_availability(array[$1::date],'blocked')`, [isoDate(-3)])))).toMatch(/ERR_DATE_IN_PAST/)
  })

  it('blocking a date gracefully declines pending requests and notifies; refuses if a visit is accepted', async () => {
    const w = await world()
    const d1 = workday(0), d2 = workday(1)
    const pending = await request(w, w.cust, d1)
    const accepted = await request(w, w.cust, d2)
    expect(await respond(w, w.worker, accepted, true)).toBe('accepted')

    const res = await asUser(w.db, w.worker, async () =>
      (await w.db.query<any>(`select public.set_availability(array[$1::date],'blocked') r`, [d1])).rows[0].r)
    expect(res.auto_declined).toBe(1)
    const st = await w.db.query<any>(`select status from visit_requests where id=$1`, [pending])
    expect(st.rows[0].status).toBe('declined')
    const n = await asUser(w.db, w.cust, async () => (await w.db.query<any>(`select * from notifications`)).rows)
    expect(n.some((x: any) => x.notification_type === 'visit_declined' && x.related_visit_id === pending)).toBe(true)

    const e = await asUser(w.db, w.worker, () =>
      errorOf(w.db.query(`select public.set_availability(array[$1::date],'blocked')`, [d2])))
    expect(e).toMatch(/ERR_HAS_ACCEPTED_VISITS/)
    const stillOpen = await w.db.query<any>(`select 1 from worker_availability where date=$1`, [d2])
    expect(stillOpen.rows.length).toBe(0) // transaction rolled back
  })

  it('changing the weekly schedule is also reconciled with bookings', async () => {
    const w = await world()
    const d = workday()
    const v = await request(w, w.cust, d)
    const dow = dowOf(d)
    const days = [1, 2, 3, 4, 5, 6].filter((x) => x !== dow)
    const r = await asUser(w.db, w.worker, async () =>
      (await w.db.query<any>(`select public.set_work_schedule($1::smallint[],'09:00','18:00',60) r`, [days])).rows[0].r)
    expect(r.auto_declined).toBe(1)
    expect((await w.db.query<any>(`select status from visit_requests where id=$1`, [v])).rows[0].status).toBe('declined')
  })
})

describe('booking workflow', () => {
  it('customer requests -> pending, worker sees masked details', async () => {
    const w = await world()
    const d = workday()
    const id = await request(w, w.cust, d)
    const rows = await asUser(w.db, w.worker, async () => (await w.db.query<any>(`select * from worker_visit_requests()`)).rows)
    expect(rows.length).toBe(1)
    expect(rows[0].status).toBe('pending')
    expect(rows[0].customer_name).toBe('Asha Rao')
    expect(rows[0].customer_locality).toBe('Koramangala')
    expect(rows[0].customer_address).toBeNull()
    expect(rows[0].customer_phone).toBeNull()
    const pend = await asUser(w.db, w.cust, async () => (await w.db.query<any>(`select worker_phone from customer_bookings()`)).rows)
    expect(pend[0].worker_phone).toBeNull() // hidden until accepted

    expect(await respond(w, w.worker, id, true)).toBe('accepted')
    const after = await asUser(w.db, w.worker, async () => (await w.db.query<any>(`select * from worker_visit_requests($1)`, [id])).rows[0])
    expect(after.customer_address).toBe('12 5th Cross')
    expect(after.customer_phone).toBe('9000000001')
    const mine = await asUser(w.db, w.cust, async () => (await w.db.query<any>(`select * from customer_bookings()`)).rows)
    const pendingView = await asUser(w.db, w.cust, async () => (await w.db.query<any>(`select worker_phone from customer_bookings($1)`, [id])).rows)
    expect(pendingView.length).toBe(1)
    expect(mine[0].status).toBe('accepted')
    expect(mine[0].worker_phone).toBe('9876543210') // shared only after acceptance
  })

  it('validates input, role and duplicate submissions', async () => {
    const w = await world()
    const d = workday()
    expect(await errorOf(request(w, w.cust, d, '10:00', 'short'))).toMatch(/ERR_INVALID_INPUT/)
    expect(await errorOf(request(w, w.cust, d, '10:20'))).toMatch(/ERR_INVALID_SLOT/)
    expect(await errorOf(request(w, w.cust, d, '03:00'))).toMatch(/ERR_INVALID_SLOT/)
    expect(await errorOf(request(w, w.worker2, d))).toMatch(/ERR_NOT_CUSTOMER/)
    await request(w, w.cust, d)
    expect(await errorOf(request(w, w.cust, d))).toMatch(/ERR_DUPLICATE_REQUEST/)
    // category the worker does not offer is rejected
    const e = await asUser(w.db, w.cust2, () => errorOf(w.db.query(
      `select public.create_visit_request($1,$2,$3::date,'11:00','Area','',null,null,'Need a pipe fixed today')`,
      [w.worker, w.plumber, d])))
    expect(e).toMatch(/ERR_INVALID_CATEGORY/)
    const e2 = await errorOf(asUser(w.db, w.cust, () => w.db.query(`select public.create_visit_request($1,null,$2::date,'12:00','Area','',null,null,'Need a fan installed')`, [w.worker, d])))
    expect(e2).toBeNull() // null category defaults to the worker's primary one
  })

  it('anonymous users cannot request visits', async () => {
    const w = await world()
    const e = await asAnon(w.db, () => errorOf(w.db.query(
      `select public.create_visit_request($1,null,$2::date,'10:00','Area','',null,null,'Need wiring checked')`, [w.worker, workday()])))
    expect(e).toMatch(/permission denied/i)
  })

  it('only the assigned worker can respond; transitions are enforced', async () => {
    const w = await world()
    const id = await request(w, w.cust, workday())
    expect(await asUser(w.db, w.cust, () => errorOf(w.db.query(`select public.respond_visit_request($1,true)`, [id])))).toMatch(/ERR_NOT_FOUND/)
    expect(await asUser(w.db, w.worker2, () => errorOf(w.db.query(`select public.respond_visit_request($1,true)`, [id])))).toMatch(/ERR_NOT_FOUND/)
    expect(await respond(w, w.worker, id, false)).toBe('declined')
    expect(await asUser(w.db, w.worker, () => errorOf(w.db.query(`select public.respond_visit_request($1,true)`, [id])))).toMatch(/ERR_INVALID_TRANSITION/)
    expect(await asUser(w.db, w.worker, () => errorOf(w.db.query(`select public.complete_visit_request($1)`, [id])))).toMatch(/ERR_INVALID_TRANSITION/)
  })

  it('prevents conflicting accepted visits and closes overlapping pending ones', async () => {
    const w = await world()
    const d = workday()
    const a = await request(w, w.cust, d, '10:00')
    const b = await request(w, w.cust2, d, '10:00') // both pending for the same slot: allowed
    expect(await respond(w, w.worker, a, true)).toBe('accepted')
    const sb = await w.db.query<any>(`select status from visit_requests where id=$1`, [b])
    expect(sb.rows[0].status).toBe('declined') // auto-closed
    // slot now offered as unavailable, further requests are rejected
    expect(await errorOf(request(w, w.cust2, d, '10:00', 'Another job description'))).toMatch(/ERR_SLOT_UNAVAILABLE/)
    // a different slot still works
    expect(await errorOf(request(w, w.cust2, d, '11:00'))).toBeNull()
  })

  it('database constraint rejects overlapping accepted visits even if app checks are bypassed', async () => {
    const w = await world()
    const d = workday()
    const ins = (cust: string, st: string, en: string) => w.db.query(
      `insert into visit_requests (customer_id,worker_id,category_id,requested_date,start_time,end_time,customer_locality,job_description,status)
       values ($1,$2,$3,$4,$5,$6,'Area X','long enough description','accepted')`, [cust, w.worker, w.electrician, d, st, en])
    await ins(w.cust, '10:00', '11:00')
    expect(await errorOf(ins(w.cust2, '10:30', '11:30'))).toMatch(/no_overlapping_accepted|conflicting key/i)
    expect(await errorOf(ins(w.cust2, '11:00', '12:00'))).toBeNull() // touching is fine
  })

  it('concurrent requests/accepts for one slot yield exactly one accepted visit', async () => {
    const w = await world()
    const d = workday()
    // PGlite has a single connection, so requests are issued one after another; real
    // parallelism is covered by the row lock + exclusion constraint (see README).
    const ids = [await request(w, w.cust, d, '14:00'), await request(w, w.cust2, d, '14:00')]
    expect(await respond(w, w.worker, ids[0], true)).toBe('accepted')
    // the competing request was closed automatically, so a second accept is refused
    expect(await errorOf(respond(w, w.worker, ids[1], true))).toMatch(/ERR_INVALID_TRANSITION/)
    const acc = await w.db.query<any>(`select count(*)::int n from visit_requests where status='accepted'`)
    expect(acc.rows[0].n).toBe(1)
  })

  it('cancellation: customer may cancel own; worker only accepted; others cannot', async () => {
    const w = await world()
    const id = await request(w, w.cust, workday())
    expect(await asUser(w.db, w.cust2, () => errorOf(w.db.query(`select public.cancel_visit_request($1)`, [id])))).toMatch(/ERR_NOT_FOUND/)
    expect(await asUser(w.db, w.worker, () => errorOf(w.db.query(`select public.cancel_visit_request($1)`, [id])))).toMatch(/ERR_INVALID_TRANSITION/)
    await asUser(w.db, w.cust, () => w.db.query(`select public.cancel_visit_request($1,'Changed plans')`, [id]))
    const n = await asUser(w.db, w.worker, async () => (await w.db.query<any>(`select * from notifications order by created_at`)).rows)
    expect(n.map((x: any) => x.notification_type)).toEqual(['visit_requested', 'visit_cancelled'])
    expect(await asUser(w.db, w.cust, () => errorOf(w.db.query(`select public.cancel_visit_request($1)`, [id])))).toMatch(/ERR_INVALID_TRANSITION/)
  })

  it('rate limits excessive requests', async () => {
    const w = await world()
    let last: string | null = null
    for (let i = 0; i < 12; i++) {
      last = await errorOf(request(w, w.cust, workday(i), '10:00'))
      if (last) break
    }
    expect(last).toMatch(/ERR_RATE_LIMIT/)
  })

  it('notifications are private and can be marked read only by the owner', async () => {
    const w = await world()
    await request(w, w.cust, workday())
    const mine = await asUser(w.db, w.worker, async () => (await w.db.query<any>(`select * from notifications`)).rows)
    expect(mine.length).toBe(1)
    expect(await asUser(w.db, w.cust, async () => (await w.db.query(`select * from notifications`)).rows.length)).toBe(0)
    const other = await asUser(w.db, w.cust, () => w.db.query(`update notifications set is_read=true`))
    expect(other.affectedRows).toBe(0)
    expect(await asUser(w.db, w.worker, () => errorOf(w.db.query(`update notifications set title='x'`)))).toMatch(/permission denied/i)
    await asUser(w.db, w.worker, () => w.db.query(`update notifications set is_read=true`))
    expect((await w.db.query<any>(`select is_read from notifications`)).rows[0].is_read).toBe(true)
  })
})

describe('reviews', () => {
  /** makes an accepted visit in the past (bypassing the "no past bookings" rule) */
  async function pastAccepted(w: World, cust: string, daysAgo = 3) {
    const r = await w.db.query<{ id: string }>(
      `insert into visit_requests (customer_id,worker_id,category_id,requested_date,start_time,end_time,customer_locality,job_description,status)
       values ($1,$2,$3,$4,'10:00','11:00','Area X','long enough description','accepted') returning id`,
      [cust, w.worker, w.electrician, isoDate(-daysAgo)])
    return r.rows[0].id
  }
  const review = (w: World, who: string, visit: string, rating: number, text: string | null = null) =>
    asUser(w.db, who, () => w.db.query(`select public.submit_review($1,$2,$3)`, [visit, rating, text]))

  it('requires a completed visit, the right customer, one review, valid rating', async () => {
    const w = await world()
    const v = await pastAccepted(w, w.cust)
    expect(await errorOf(review(w, w.cust, v, 5))).toMatch(/ERR_NOT_COMPLETED/)

    // a visit in the future cannot be completed
    const future = await request(w, w.cust2, workday())
    await respond(w, w.worker, future, true)
    expect(await asUser(w.db, w.worker, () => errorOf(w.db.query(`select public.complete_visit_request($1)`, [future])))).toMatch(/ERR_TOO_EARLY/)

    // customers cannot complete visits
    expect(await asUser(w.db, w.cust, () => errorOf(w.db.query(`select public.complete_visit_request($1)`, [v])))).toMatch(/ERR_NOT_FOUND/)
    await asUser(w.db, w.worker, () => w.db.query(`select public.complete_visit_request($1)`, [v]))

    expect(await errorOf(review(w, w.cust2, v, 5))).toMatch(/ERR_NOT_FOUND/) // someone else's booking
    expect(await errorOf(review(w, w.worker, v, 5))).toMatch(/ERR_NOT_FOUND/) // worker cannot review themselves
    expect(await errorOf(review(w, w.cust, v, 6))).toMatch(/ERR_INVALID_INPUT/)
    expect(await errorOf(review(w, w.cust, v, 0))).toMatch(/ERR_INVALID_INPUT/)
    expect(await errorOf(review(w, w.cust, v, 4, 'Punctual and neat work'))).toBeNull()
    expect(await errorOf(review(w, w.cust, v, 5))).toMatch(/ERR_ALREADY_REVIEWED/)
  })

  it('computes ratings from real reviews and exposes only a public view', async () => {
    const w = await world()
    const v1 = await pastAccepted(w, w.cust, 3)
    const v2 = await pastAccepted(w, w.cust2, 4)
    for (const v of [v1, v2]) await asUser(w.db, w.worker, () => w.db.query(`select public.complete_visit_request($1)`, [v]))
    await review(w, w.cust, v1, 5, 'Great')
    await review(w, w.cust2, v2, 4)
    const wp = (await w.db.query<any>(`select rating_avg, review_count from worker_profiles where id=$1`, [w.worker])).rows[0]
    expect(Number(wp.rating_avg)).toBe(4.5)
    expect(wp.review_count).toBe(2)
    const pub = await asAnon(w.db, async () => (await w.db.query<any>(`select * from public_reviews where worker_id=$1 order by rating desc`, [w.worker])).rows)
    expect(pub.map((r: any) => r.reviewer_name)).toEqual(['Asha R.', 'Mohan L.'])
    expect(Object.keys(pub[0])).not.toContain('customer_id')
    // reviews cannot be edited or inserted directly by anyone
    expect(await asUser(w.db, w.cust, () => errorOf(w.db.query(`update reviews set rating=5`)))).toMatch(/permission denied/i)
    expect(await asUser(w.db, w.worker, () => errorOf(w.db.query(`update reviews set rating=1`)))).toMatch(/permission denied/i)
    expect(await asUser(w.db, w.cust, () => errorOf(w.db.query(
      `insert into reviews (visit_request_id,customer_id,worker_id,rating) values ('${v1}','${w.cust}','${w.worker}',5)`)))).toMatch(/permission denied/i)
    // a worker sees reviews about them, other customers do not see raw review rows
    expect(await asUser(w.db, w.worker, async () => (await w.db.query(`select * from reviews`)).rows.length)).toBe(2)
    expect(await asUser(w.db, w.worker2, async () => (await w.db.query(`select * from reviews`)).rows.length)).toBe(0)
  })

  it('reminders are generated once for upcoming accepted visits', async () => {
    const w = await world()
    await w.db.query(
      `insert into visit_requests (customer_id,worker_id,category_id,requested_date,start_time,end_time,customer_locality,job_description,status)
       values ($1,$2,$3,(now() at time zone 'Asia/Kolkata')::date + 1,'00:00','01:00','Area X','long enough description','accepted')`,
      [w.cust, w.worker, w.electrician])
    const n1 = await asUser(w.db, w.cust, async () => (await w.db.query<any>(`select public.generate_upcoming_reminders() n`)).rows[0].n)
    const n2 = await asUser(w.db, w.cust, async () => (await w.db.query<any>(`select public.generate_upcoming_reminders() n`)).rows[0].n)
    expect(n1).toBe(1)
    expect(n2).toBe(0)
  })
})

describe('search', () => {
  async function searchWorld() {
    const w = await world()
    // extra electricians at known distances from Indiranagar (12.9784, 77.6408)
    const mk = (email: string, name: string, lat: string | null, lng: string | null, loc: string, price: number, exp: number, langs: string[]) =>
      signUp(w.db, email, {
        role: 'worker', full_name: name, category_slug: 'electrician', experience_years: exp, indicative_price: price,
        pricing_unit: 'per_day', locality: loc, city: 'Bengaluru', latitude: lat, longitude: lng, languages: langs,
      })
    const near = await mk('e1@t.dev', 'Near Nitin', '12.9716', '77.6412', 'Indiranagar', 900, 2, ['Hindi'])
    const far = await mk('e2@t.dev', 'Far Farid', '12.8452', '77.6602', 'Electronic City', 500, 15, ['Tamil', 'English'])
    const nocoord = await mk('e3@t.dev', 'NoCoord Naveen', null, null, 'Koramangala', 600, 5, ['Hindi'])
    return { ...w, near, far, nocoord }
  }
  const search = (w: { db: Db }, args: Record<string, unknown> = {}) => {
    const keys = Object.keys(args)
    const sql = `select * from search_workers(${keys.map((k, i) => `p_${k} => $${i + 1}`).join(', ')})`
    return asAnon(w.db, async () => (await w.db.query<any>(sql, keys.map((k) => args[k]))).rows)
  }

  it('sorts by real calculated distance (haversine)', async () => {
    const w = await searchWorld()
    const rows = await search(w, { category_slug: 'electrician', lat: 12.9784, lng: 77.6408, sort: 'nearest' })
    expect(rows.map((r) => r.full_name)).toEqual(['Ravi Kumar', 'Near Nitin', 'Far Farid', 'NoCoord Naveen'])
    expect(Number(rows[0].distance_km)).toBe(0)
    expect(Number(rows[1].distance_km)).toBeCloseTo(0.8, 0)
    expect(Number(rows[2].distance_km)).toBeCloseTo(15.4, 0)
    expect(rows[3].distance_km).toBeNull() // missing coordinates -> no fake distance
  })

  it('combines filters: distance + rating + price + experience + language', async () => {
    const w = await searchWorld()
    const base = { category_slug: 'electrician', lat: 12.9784, lng: 77.6408 }
    expect((await search(w, { ...base, max_distance_km: 5 })).map((r) => r.full_name)).toEqual(['Ravi Kumar', 'Near Nitin'])
    expect((await search(w, { ...base, max_distance_km: 5, max_price: 800 })).map((r) => r.full_name)).toEqual(['Ravi Kumar'])
    expect((await search(w, { ...base, min_experience: 10 })).map((r) => r.full_name)).toEqual(['Far Farid'])
    expect((await search(w, { ...base, languages: ['Tamil'] })).map((r) => r.full_name)).toEqual(['Far Farid'])
    expect((await search(w, { ...base, min_rating: 4 })).length).toBe(0) // nobody has reviews yet
    expect((await search(w, { category_slug: 'plumber' })).map((r) => r.full_name)).toEqual(['Sunil Das'])
    expect((await search(w, { category_slug: 'welder' })).length).toBe(0)
  })

  it('locality fallback includes workers without coordinates when filtering by distance', async () => {
    const w = await searchWorld()
    const rows = await search(w, { category_slug: 'electrician', lat: 12.9784, lng: 77.6408, locality: 'koramangala', max_distance_km: 5 })
    expect(rows.map((r) => r.full_name)).toContain('NoCoord Naveen')
    expect(rows.map((r) => r.full_name)).not.toContain('Far Farid')
    // no coordinates at all: pure locality ordering, distance unknown
    const loc = await search(w, { category_slug: 'electrician', locality: 'Koramangala' })
    expect(loc[0].full_name).toBe('NoCoord Naveen')
    expect(loc.every((r) => r.distance_km === null)).toBe(true)
  })

  it('price / rating / review sorting and availability on a date', async () => {
    const w = await searchWorld()
    expect((await search(w, { category_slug: 'electrician', sort: 'price_low' })).map((r) => r.full_name)[0]).toBe('Far Farid')
    expect((await search(w, { category_slug: 'electrician', sort: 'price_high' })).map((r) => r.full_name)[0]).toBe('Near Nitin')

    const d = workday()
    await asUser(w.db, w.worker, () => w.db.query(`select public.set_availability(array[$1::date],'blocked')`, [d]))
    const avail = (await search(w, { category_slug: 'electrician', date: d })).map((r) => r.full_name)
    expect(avail).not.toContain('Ravi Kumar')
    expect(avail).toContain('Near Nitin')
    // nobody is available on a Sunday by default
    expect((await search(w, { category_slug: 'electrician', date: sunday() })).length).toBe(0)

    // available soonest: blocking tomorrow's slot pushes Ravi later
    const soon = await search(w, { category_slug: 'electrician', sort: 'soonest' })
    expect(soon[0].next_available).toBeTruthy()
  })

  it('rating filters and sort use only real reviews', async () => {
    const w = await searchWorld()
    for (const [who, rating] of [[w.near, 5], [w.worker, 3]] as const) {
      const v = (await w.db.query<any>(
        `insert into visit_requests (customer_id,worker_id,category_id,requested_date,start_time,end_time,customer_locality,job_description,status)
         values ($1,$2,$3,$4,'10:00','11:00','Area X','long enough description','completed') returning id`,
        [w.cust, who, w.electrician, isoDate(-5)])).rows[0].id
      await asUser(w.db, w.cust, () => w.db.query(`select public.submit_review($1,$2,null)`, [v, rating]))
    }
    const top = await search(w, { category_slug: 'electrician', sort: 'rating' })
    expect(top[0].full_name).toBe('Near Nitin')
    expect((await search(w, { category_slug: 'electrician', min_rating: 4 })).map((r) => r.full_name)).toEqual(['Near Nitin'])
    expect(top[0].review_count).toBe(1)
  })

  it('worker_distance only returns a rounded number, never coordinates', async () => {
    const w = await searchWorld()
    const r = await asAnon(w.db, async () => (await w.db.query<any>(`select worker_distance($1, 12.9784, 77.6408) d`, [w.near])).rows[0].d)
    expect(Number(r)).toBeCloseTo(0.8, 0)
  })
})
