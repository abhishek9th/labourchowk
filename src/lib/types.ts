export type Role = 'customer' | 'worker'
export type PricingUnit = 'per_day' | 'per_visit' | 'per_task' | 'per_sq_ft' | 'per_hour'
export const PRICING_UNITS: PricingUnit[] = ['per_day', 'per_visit', 'per_task', 'per_sq_ft', 'per_hour']
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected'
export type BookingStatus = 'pending' | 'accepted' | 'declined' | 'completed' | 'cancelled'
export type SortKey = 'nearest' | 'rating' | 'price_low' | 'price_high' | 'reviews' | 'soonest'

export interface Profile {
  id: string
  full_name: string
  role: Role
  phone: string | null
  email: string | null
  avatar_url: string | null
  preferred_language: string
  default_locality: string | null
  is_demo: boolean
}

export interface Category {
  id: string
  name: string
  name_hi: string | null
  slug: string
  icon: string
  description: string | null
  is_active: boolean
  sort_order: number
}

/** Row of the public_worker_profiles view (no private fields). */
export interface PublicWorker {
  id: string
  full_name: string
  avatar_url: string | null
  primary_category_id: string
  category_name: string
  category_name_hi: string | null
  category_slug: string
  category_icon: string
  description: string | null
  experience_years: number
  indicative_price: number
  pricing_unit: PricingUnit
  locality: string
  city: string
  service_radius_km: number
  languages: string[]
  verification_status: VerificationStatus
  working_days: number[]
  work_start: string
  work_end: string
  slot_minutes: number
  rating_avg: number
  review_count: number
  is_demo: boolean
  has_coordinates: boolean
  skills: string[]
  public_id: string
  portfolio_count: number
}

/** Owner's own row in worker_profiles (includes exact coordinates; never exposed publicly). */
export interface OwnWorkerProfile {
  id: string
  primary_category_id: string
  description: string | null
  experience_years: number
  indicative_price: number
  pricing_unit: PricingUnit
  latitude: number | null
  longitude: number | null
  locality: string
  city: string
  service_radius_km: number
  languages: string[]
  verification_status: VerificationStatus
  working_days: number[]
  work_start: string
  work_end: string
  slot_minutes: number
  profile_views: number
  rating_avg: number
  review_count: number
  is_active: boolean
  is_demo: boolean
  public_id: string
  is_public: boolean
  share_phone: boolean
  share_whatsapp: boolean
}

export interface WorkerSearchRow {
  id: string
  full_name: string
  avatar_url: string | null
  description: string | null
  category_name: string
  category_name_hi: string | null
  category_slug: string
  category_icon: string
  experience_years: number
  indicative_price: number
  pricing_unit: PricingUnit
  locality: string
  city: string
  languages: string[]
  skills: string[]
  verification_status: VerificationStatus
  rating_avg: number
  review_count: number
  is_demo: boolean
  distance_km: number | null
  locality_match: boolean
  serves_area: boolean | null
  next_available: string | null
  available_on_date: boolean | null
  cover_path: string | null
  portfolio_count: number
}

export interface SearchFilters {
  category: string | null
  q: string
  maxDistanceKm: number | null
  minRating: number | null
  minPrice: number | null
  maxPrice: number | null
  minExperience: number | null
  date: string | null
  languages: string[]
  sort: SortKey
}

export interface GeoPoint {
  lat: number | null
  lng: number | null
  label: string
  source: 'gps' | 'preset' | 'text'
}

export type DayState = 'past' | 'blocked' | 'off' | 'full' | 'available'
export interface CalendarDay {
  day: string
  state: DayState
  free_slots: number
  is_extra_day: boolean
}
export interface Slot {
  slot_start: string
  slot_end: string
  is_available: boolean
}

export interface WorkerVisit {
  id: string
  status: BookingStatus
  status_reason: string | null
  requested_date: string
  start_time: string
  end_time: string
  category_name: string
  job_description: string
  customer_name: string
  customer_locality: string
  customer_address: string | null
  customer_phone: string | null
  created_at: string
  has_review: boolean
  is_demo: boolean
}

export interface CustomerBooking {
  id: string
  status: BookingStatus
  status_reason: string | null
  requested_date: string
  start_time: string
  end_time: string
  worker_id: string
  worker_name: string
  worker_avatar: string | null
  worker_locality: string
  worker_phone: string | null
  category_name: string
  job_description: string
  customer_locality: string
  customer_address: string | null
  created_at: string
  review_id: string | null
  review_rating: number | null
  is_demo: boolean
}

export interface PublicReview {
  id: string
  worker_id: string
  rating: number
  review_text: string | null
  created_at: string
  is_demo: boolean
  reviewer_name: string
}

export type NotificationType =
  | 'visit_requested' | 'visit_accepted' | 'visit_declined' | 'visit_cancelled'
  | 'visit_reminder' | 'visit_completed' | 'review_received' | 'verification' | 'system'

export interface AppNotification {
  id: string
  title: string
  message: string
  notification_type: NotificationType
  related_visit_id: string | null
  is_read: boolean
  created_at: string
}

export interface WorkerStats {
  profile_views: number
  pending: number
  upcoming: number
  completed: number
  rating_avg: number
  review_count: number
}

export interface PortfolioImage {
  id: string
  project_id: string
  storage_path: string
  display_order: number
  is_cover: boolean
}

export interface PortfolioProject {
  id: string
  worker_id: string
  title: string
  description: string | null
  category_id: string | null
  category_name?: string | null
  category_name_hi?: string | null
  location_label: string | null
  /** always the 1st of the month */
  completed_at: string
  project_area_sqft: number | null
  project_price: number | null
  project_price_unit: PricingUnit | null
  project_tags: string[]
  is_published?: boolean
  images: PortfolioImage[]
}

export interface PublicContact {
  allow_call: boolean
  allow_whatsapp: boolean
  phone: string | null
}
