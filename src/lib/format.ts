import type { PricingUnit, WorkerStats, OwnWorkerProfile, Profile } from './types'

export function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

export const UNIT_SHORT: Record<PricingUnit, string> = {
  per_day: 'day',
  per_visit: 'visit',
  per_task: 'task',
  per_sq_ft: 'sq ft',
  per_hour: 'hour',
}

/** "₹800 / day"; price 0 means the worker has not set one. */
export function formatPrice(price: number, unit: PricingUnit): string | null {
  if (!price) return null
  return `${formatINR(Number(price))} / ${UNIT_SHORT[unit]}`
}

export const LANGUAGE_OPTIONS = [
  'Hindi', 'English', 'Marathi', 'Kannada', 'Tamil', 'Telugu', 'Malayalam', 'Bengali', 'Gujarati', 'Punjabi', 'Urdu', 'Odia',
]

/** Pricing units that are most common per category (first one is the default). Workers can still pick any. */
export const SUGGESTED_UNITS: Record<string, PricingUnit[]> = {
  mason: ['per_day', 'per_sq_ft'],
  painter: ['per_sq_ft', 'per_day'],
  'tile-flooring': ['per_sq_ft', 'per_day'],
  electrician: ['per_visit', 'per_task', 'per_day'],
  plumber: ['per_visit', 'per_task', 'per_day'],
  carpenter: ['per_task', 'per_day'],
  'pop-false-ceiling': ['per_sq_ft', 'per_day'],
  'ac-appliance': ['per_visit', 'per_task'],
  cleaner: ['per_day', 'per_visit', 'per_hour'],
}

/** Percentage of recommended profile fields that are filled in (0-100). */
export function profileCompleteness(
  profile: Pick<Profile, 'phone' | 'avatar_url'>,
  worker: Pick<OwnWorkerProfile, 'description' | 'indicative_price' | 'latitude' | 'languages' | 'experience_years' | 'locality'>,
  skillCount: number,
): number {
  const checks = [
    Boolean(profile.avatar_url),
    Boolean(profile.phone),
    Boolean(worker.description && worker.description.trim().length >= 20),
    Number(worker.indicative_price) > 0,
    worker.latitude !== null,
    worker.languages.length > 0,
    worker.experience_years > 0,
    skillCount > 0,
    Boolean(worker.locality) && worker.locality !== 'Not set',
  ]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

export function emptyStats(): WorkerStats {
  return { profile_views: 0, pending: 0, upcoming: 0, completed: 0, rating_avg: 0, review_count: 0 }
}
