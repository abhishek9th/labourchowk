import { sampleSlug } from '@/lib/sampleWorks'
import { supabase } from './supabase'
import type {
  AppNotification, CalendarDay, PortfolioImage, PortfolioProject, PublicContact, Category, CustomerBooking, GeoPoint, OwnWorkerProfile, Profile,
  PublicReview, PublicWorker, SearchFilters, Slot, VerificationStatus, WorkerSearchRow, WorkerStats, WorkerVisit,
} from './types'

interface Result<T> { data: T | null; error: { message: string; details?: string } | null }

function unwrap<T>(r: Result<T>): T {
  if (r.error) throw Object.assign(new Error(r.error.message), { details: r.error.details })
  return r.data as T
}

const PROJECT_FIELDS = 'id, worker_id, title, description, category_id, location_label, completed_at, project_area_sqft, project_price, project_price_unit, project_tags'

function attachImages(projects: Omit<PortfolioProject, 'images'>[], images: PortfolioImage[]): PortfolioProject[] {
  const by = new Map<string, PortfolioImage[]>()
  for (const i of images) by.set(i.project_id, [...(by.get(i.project_id) ?? []), i])
  return projects.map((p) => ({
    ...p,
    images: (by.get(p.id) ?? []).sort((a, b) => a.display_order - b.display_order),
  }))
}

export interface ProjectInput {
  title: string
  description: string | null
  category_id: string | null
  location_label: string | null
  completed_at: string
  project_area_sqft: number | null
  project_price: number | null
  project_price_unit: PortfolioProject['project_price_unit']
  project_tags: string[]
  is_published: boolean
}

/** Public URL of a portfolio photo (bucket is public-read; names are unguessable). */
export function portfolioImageUrl(path: string): string {
  const sample = sampleSlug(path)
  if (sample) return `/img/cat-${sample}.jpg`
  return supabase.storage.from('portfolio').getPublicUrl(path).data.publicUrl
}

/** Suggestions are limited to workers within this many km of the customer's location. */
export const MAX_NEARBY_KM = 15

export const api = {
  // ------------------------------------------------------------ public catalogue
  async categories(): Promise<Category[]> {
    return unwrap(await supabase.from('service_categories').select('*').eq('is_active', true).order('sort_order').order('name'))
  },

  /** Real number of public workers per category slug. */
  async workerCountsByCategory(): Promise<Record<string, number>> {
    const rows = unwrap(await supabase.from('public_worker_profiles').select('category_slug').limit(5000)) as { category_slug: string }[]
    return rows.reduce<Record<string, number>>((m, r) => { m[r.category_slug] = (m[r.category_slug] ?? 0) + 1; return m }, {})
  },

  async searchWorkers(f: SearchFilters, loc: GeoPoint | null): Promise<WorkerSearchRow[]> {
    const precise = !!loc && loc.lat !== null && loc.lng !== null
    const run = async (maxKm: number | null) => unwrap<WorkerSearchRow[]>((await supabase.rpc('search_workers', {
      p_category_slug: f.category,
      p_lat: precise ? loc!.lat : null,
      p_lng: precise ? loc!.lng : null,
      p_locality: loc && loc.source !== 'gps' ? loc.label.split(',')[0] || null : null,
      p_max_distance_km: maxKm,
      p_min_rating: f.minRating,
      p_min_price: f.minPrice,
      p_max_price: f.maxPrice,
      p_min_experience: f.minExperience,
      p_date: f.date,
      p_languages: f.languages.length ? f.languages : null,
      p_query: f.q.trim() || null,
      p_sort: f.sort,
      p_limit: 60,
      p_offset: 0,
    })) as Result<WorkerSearchRow[]>)
    if (!precise) return run(f.maxDistanceKm)
    // suggest only workers within MAX_NEARBY_KM; if nobody is that close, show everyone (nearest first)
    const near = await run(Math.min(f.maxDistanceKm ?? MAX_NEARBY_KM, MAX_NEARBY_KM))
    if (near.length || f.maxDistanceKm !== null) return near
    return run(null)
  },

  async worker(id: string): Promise<PublicWorker | null> {
    return unwrap(await supabase.from('public_worker_profiles').select('*').eq('id', id).maybeSingle()) as PublicWorker | null
  },

  async workerReviews(id: string): Promise<PublicReview[]> {
    return unwrap(await supabase.from('public_reviews').select('*').eq('worker_id', id).order('created_at', { ascending: false }).limit(50))
  },

  async workerDistance(id: string, loc: GeoPoint | null): Promise<number | null> {
    if (!loc || loc.lat === null || loc.lng === null) return null
    const r = await supabase.rpc('worker_distance', { p_worker: id, p_lat: loc.lat, p_lng: loc.lng })
    const v = unwrap<number | string | null>(r as Result<number | string | null>)
    return v === null ? null : Number(v)
  },

  async calendar(workerId: string, from: string, to: string): Promise<CalendarDay[]> {
    const r = await supabase.rpc('get_worker_calendar', { p_worker: workerId, p_from: from, p_to: to })
    return unwrap<CalendarDay[]>(r as Result<CalendarDay[]>)
  },

  async slots(workerId: string, date: string): Promise<Slot[]> {
    const r = await supabase.rpc('get_available_slots', { p_worker: workerId, p_date: date })
    return unwrap<Slot[]>(r as Result<Slot[]>)
  },

  async recordView(workerId: string): Promise<void> {
    await supabase.rpc('record_profile_view', { p_worker: workerId })
  },

  // ------------------------------------------------------------ account
  async profile(id: string): Promise<Profile | null> {
    return unwrap(await supabase.from('profiles').select('*').eq('id', id).maybeSingle()) as Profile | null
  },

  async updateProfile(id: string, patch: Partial<Pick<Profile, 'full_name' | 'phone' | 'avatar_url' | 'preferred_language' | 'default_locality'>>) {
    unwrap(await supabase.from('profiles').update(patch).eq('id', id))
  },

  async isAdmin(): Promise<boolean> {
    const r = await supabase.rpc('is_admin')
    return Boolean(unwrap<boolean>(r as Result<boolean>))
  },

  async uploadAvatar(userId: string, file: File): Promise<string> {
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${userId}/avatar-${Date.now()}.${ext}`
    const up = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: false })
    if (up.error) throw up.error
    return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
  },

  // ------------------------------------------------------------ worker
  async ownWorker(id: string): Promise<OwnWorkerProfile | null> {
    return unwrap(await supabase.from('worker_profiles').select('*').eq('id', id).maybeSingle()) as OwnWorkerProfile | null
  },

  async updateWorker(id: string, patch: Partial<OwnWorkerProfile>) {
    unwrap(await supabase.from('worker_profiles').update(patch).eq('id', id))
  },

  async ownSkills(id: string): Promise<{ id: string; skill_name: string; category_id: string | null }[]> {
    return unwrap(await supabase.from('worker_skills').select('id, skill_name, category_id').eq('worker_id', id).order('skill_name'))
  },

  async replaceSkills(workerId: string, names: string[], categoryId: string) {
    const current = await api.ownSkills(workerId)
    const keep = new Set(names.map((n) => n.toLowerCase()))
    const have = new Set(current.map((s) => s.skill_name.toLowerCase()))
    const remove = current.filter((s) => !keep.has(s.skill_name.toLowerCase())).map((s) => s.id)
    if (remove.length) unwrap(await supabase.from('worker_skills').delete().in('id', remove))
    const add = names.filter((n) => !have.has(n.toLowerCase())).map((skill_name) => ({ worker_id: workerId, category_id: categoryId, skill_name }))
    if (add.length) unwrap(await supabase.from('worker_skills').insert(add))
  },

  async stats(): Promise<WorkerStats> {
    const r = await supabase.rpc('worker_stats')
    return unwrap<WorkerStats>(r as Result<WorkerStats>)
  },

  async setAvailability(dates: string[], state: 'blocked' | 'available' | 'default') {
    const r = await supabase.rpc('set_availability', { p_dates: dates, p_state: state })
    return unwrap<{ changed: number; auto_declined: number }>(r as Result<{ changed: number; auto_declined: number }>)
  },

  async setSchedule(days: number[], start: string, end: string, slotMinutes: number) {
    const r = await supabase.rpc('set_work_schedule', { p_days: days, p_start: start, p_end: end, p_slot_minutes: slotMinutes })
    return unwrap<{ auto_declined: number }>(r as Result<{ auto_declined: number }>)
  },

  async requestVerification() {
    unwrap((await supabase.rpc('request_verification')) as Result<unknown>)
  },

  async workerVisits(id?: string): Promise<WorkerVisit[]> {
    const r = await supabase.rpc('worker_visit_requests', { p_id: id ?? null })
    return unwrap<WorkerVisit[]>(r as Result<WorkerVisit[]>)
  },

  async ownReviews(workerId: string): Promise<PublicReview[]> {
    // the public view carries the same data with reviewer names already shortened
    return api.workerReviews(workerId)
  },

  // ------------------------------------------------------------ customer
  async customerBookings(id?: string): Promise<CustomerBooking[]> {
    const r = await supabase.rpc('customer_bookings', { p_id: id ?? null })
    return unwrap<CustomerBooking[]>(r as Result<CustomerBooking[]>)
  },

  async createVisit(input: {
    workerId: string; categoryId: string | null; date: string; start: string
    locality: string; address: string; lat: number | null; lng: number | null; description: string
  }): Promise<string> {
    const r = await supabase.rpc('create_visit_request', {
      p_worker: input.workerId, p_category: input.categoryId, p_date: input.date, p_start: input.start,
      p_locality: input.locality, p_address: input.address || null, p_lat: input.lat, p_lng: input.lng,
      p_description: input.description,
    })
    return unwrap<string>(r as Result<string>)
  },

  async respondVisit(id: string, accept: boolean, reason?: string): Promise<'accepted' | 'declined' | 'auto_declined'> {
    const r = await supabase.rpc('respond_visit_request', { p_visit: id, p_accept: accept, p_reason: reason ?? null })
    return unwrap(r as Result<'accepted' | 'declined' | 'auto_declined'>)
  },

  async cancelVisit(id: string, reason?: string) {
    unwrap((await supabase.rpc('cancel_visit_request', { p_visit: id, p_reason: reason ?? null })) as Result<unknown>)
  },

  async completeVisit(id: string) {
    unwrap((await supabase.rpc('complete_visit_request', { p_visit: id })) as Result<unknown>)
  },

  async submitReview(visitId: string, rating: number, text: string) {
    unwrap((await supabase.rpc('submit_review', { p_visit: visitId, p_rating: rating, p_text: text || null })) as Result<unknown>)
  },

  async report(targetType: 'worker' | 'review', targetId: string, reason: string, reporterId: string) {
    unwrap(await supabase.from('reports').insert({ reporter_id: reporterId, target_type: targetType, target_id: targetId, reason }))
  },

  // ------------------------------------------------------------ notifications
  async notifications(): Promise<AppNotification[]> {
    return unwrap(await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100))
  },

  async unreadCount(): Promise<number> {
    const r = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false)
    if (r.error) throw r.error
    return r.count ?? 0
  },

  async markRead(ids: string[] | 'all') {
    const q = supabase.from('notifications').update({ is_read: true }).eq('is_read', false)
    unwrap(await (ids === 'all' ? q : q.in('id', ids)))
  },

  async generateReminders() {
    await supabase.rpc('generate_upcoming_reminders')
  },

  // ------------------------------------------------------------ passport
  async resolvePublicId(publicId: string): Promise<string | null> {
    const r = await supabase.rpc('resolve_public_id', { p_public_id: publicId })
    return unwrap<string | null>(r as Result<string | null>)
  },

  async publicContact(workerId: string): Promise<PublicContact | null> {
    const r = await supabase.rpc('get_public_contact', { p_worker: workerId })
    const rows = unwrap<PublicContact[]>(r as Result<PublicContact[]>)
    return rows[0] ?? null
  },

  // ------------------------------------------------------------ portfolio
  /** Published projects of a public worker, newest first (anonymous access via public views). */
  async publicPortfolio(workerId: string): Promise<PortfolioProject[]> {
    const [p, i] = await Promise.all([
      supabase.from('public_portfolio_projects').select('*').eq('worker_id', workerId).order('completed_at', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('public_portfolio_images').select('*').eq('worker_id', workerId).order('display_order'),
    ])
    return attachImages(unwrap(p as never) as never, unwrap(i as never) as never)
  },

  /** The signed-in worker's own projects, including unpublished ones. */
  async ownPortfolio(workerId: string): Promise<PortfolioProject[]> {
    const p = await supabase.from('worker_portfolio_projects').select(`${PROJECT_FIELDS}, is_published`).eq('worker_id', workerId).order('completed_at', { ascending: false }).order('created_at', { ascending: false })
    const projects = unwrap(p as never) as Omit<PortfolioProject, 'images'>[]
    if (!projects.length) return []
    const i = await supabase.from('worker_portfolio_images').select('*').in('project_id', projects.map((x) => x.id)).order('display_order')
    return attachImages(projects, unwrap(i as never) as never)
  },

  async createProject(workerId: string, input: ProjectInput): Promise<string> {
    const r = await supabase.from('worker_portfolio_projects').insert({ worker_id: workerId, ...input }).select('id').single()
    const row = unwrap(r as never) as { id?: string } | null
    if (!row?.id) throw new Error('ERR_UPLOAD_FAILED')
    return row.id
  },

  async updateProject(id: string, input: ProjectInput) {
    unwrap(await supabase.from('worker_portfolio_projects').update(input).eq('id', id))
  },

  /**
   * Upload one prepared photo (XHR so we can report progress) and record it. If recording fails the
   * file is removed again so no orphan is left behind.
   */
  async uploadPortfolioImage(workerId: string, projectId: string, blob: Blob, onProgress: (pct: number) => void): Promise<void> {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error('ERR_NOT_AUTHENTICATED')
    const path = `${workerId}/${projectId}/${crypto.randomUUID()}.jpg`
    const base = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/+$/, '')
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${base}/storage/v1/object/portfolio/${path}`)
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY as string)
      xhr.setRequestHeader('Content-Type', 'image/jpeg')
      xhr.setRequestHeader('x-upsert', 'false')
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.status === 413 ? 'ERR_IMAGE_TOOLARGE' : xhr.status === 403 || xhr.status === 401 ? 'ERR_FORBIDDEN' : 'ERR_UPLOAD_FAILED')))
      xhr.onerror = () => reject(new Error('Failed to fetch'))
      xhr.send(blob)
    })
    const ins = await supabase.from('worker_portfolio_images').insert({ project_id: projectId, storage_path: path })
    if (ins.error) {
      await supabase.storage.from('portfolio').remove([path])
      throw Object.assign(new Error(ins.error.message), { details: ins.error.details })
    }
    onProgress(100)
  },

  async setPortfolioLayout(projectId: string, orderedIds: string[], coverId: string) {
    unwrap((await supabase.rpc('set_portfolio_images_layout', { p_project: projectId, p_ordered: orderedIds, p_cover: coverId })) as Result<unknown>)
  },

  async deletePortfolioImage(img: PortfolioImage) {
    const rm = await supabase.storage.from('portfolio').remove([img.storage_path])
    if (rm.error) throw rm.error
    unwrap(await supabase.from('worker_portfolio_images').delete().eq('id', img.id))
  },

  /** Files first, then the row (cascades to image rows). If file removal fails nothing is deleted, so retrying is safe. */
  async deleteProject(project: PortfolioProject) {
    if (project.images.length) {
      const rm = await supabase.storage.from('portfolio').remove(project.images.map((i) => i.storage_path))
      if (rm.error) throw rm.error
    }
    unwrap(await supabase.from('worker_portfolio_projects').delete().eq('id', project.id))
  },

  // ------------------------------------------------------------ admin
  async adminCategories(): Promise<Category[]> {
    return unwrap(await supabase.from('service_categories').select('*').order('sort_order').order('name'))
  },
  async adminSaveCategory(c: Partial<Category> & { name: string; slug: string }) {
    const row = { name: c.name, name_hi: c.name_hi || null, slug: c.slug, icon: c.icon || 'wrench', description: c.description || null, is_active: c.is_active ?? true, sort_order: c.sort_order ?? 100 }
    if (c.id) unwrap(await supabase.from('service_categories').update(row).eq('id', c.id))
    else unwrap(await supabase.from('service_categories').insert(row))
  },
  async adminWorkers(status: string | null) {
    const r = await supabase.rpc('admin_list_workers', { p_status: status })
    return unwrap<{
      id: string; full_name: string; email: string | null; phone: string | null; category_name: string; locality: string; city: string
      verification_status: VerificationStatus; is_active: boolean; is_demo: boolean; review_count: number; rating_avg: number; created_at: string
    }[]>(r as never)
  },
  async adminSetVerification(id: string, status: VerificationStatus) {
    unwrap((await supabase.rpc('admin_set_verification', { p_worker: id, p_status: status })) as Result<unknown>)
  },
  async adminSetActive(id: string, active: boolean) {
    unwrap((await supabase.rpc('admin_set_worker_active', { p_worker: id, p_active: active })) as Result<unknown>)
  },
  async adminReports(status: string | null) {
    const r = await supabase.rpc('admin_list_reports', { p_status: status })
    return unwrap<{ id: string; reporter_name: string; target_type: 'worker' | 'review'; target_id: string; target_label: string | null; reason: string; status: string; created_at: string }[]>(r as never)
  },
  async adminResolveReport(id: string, status: 'resolved' | 'dismissed') {
    unwrap((await supabase.rpc('admin_resolve_report', { p_report: id, p_status: status })) as Result<unknown>)
  },
  async adminDeleteReview(id: string) {
    unwrap((await supabase.rpc('admin_delete_review', { p_review: id })) as Result<unknown>)
  },
}
