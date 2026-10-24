import { z } from 'zod'
import { PRICING_UNITS } from './types'

// Error messages are translation keys; <FieldError> translates them at render time.
const phone = z.string().trim().regex(/^[0-9+() -]{7,20}$/, 'val.phone')
const optionalPhone = z.union([z.literal(''), phone])
const password = z.string().min(8, 'val.passwordMin').max(72, 'val.passwordMax')

export const loginSchema = z.object({
  email: z.string().trim().email('val.email'),
  password: z.string().min(1, 'val.required'),
})
export type LoginForm = z.infer<typeof loginSchema>

export const customerRegisterSchema = z.object({
  full_name: z.string().trim().min(2, 'val.nameMin').max(100),
  email: z.string().trim().email('val.email'),
  phone: optionalPhone,
  password,
  default_locality: z.string().trim().max(120).optional(),
  preferred_language: z.enum(['en', 'hi']),
})
export type CustomerRegisterForm = z.infer<typeof customerRegisterSchema>

// use register(name, { valueAsNumber: true }) in forms
const intField = (min: number, max: number) =>
  z.number({ error: 'val.number' }).int('val.number').min(min, 'val.range').max(max, 'val.range')

export const workerRegisterSchema = z.object({
  full_name: z.string().trim().min(2, 'val.nameMin').max(100),
  email: z.string().trim().email('val.email'),
  phone,
  password,
  category_slug: z.string().min(1, 'val.required'),
  skills: z.array(z.string().trim().min(2).max(60)).max(15),
  experience_years: intField(0, 70),
  indicative_price: intField(0, 1_000_000),
  pricing_unit: z.enum(PRICING_UNITS as [string, ...string[]]),
  city: z.string().trim().min(2, 'val.required').max(80),
  locality: z.string().trim().min(2, 'val.required').max(120),
  service_radius_km: intField(1, 100),
  languages: z.array(z.string()).min(1, 'val.languages').max(12),
  description: z.string().trim().max(1000, 'val.tooLong').optional(),
  preferred_language: z.enum(['en', 'hi']),
  apply_verification: z.boolean(),
})
export type WorkerRegisterForm = z.infer<typeof workerRegisterSchema>

export const workerProfileSchema = z.object({
  full_name: z.string().trim().min(2, 'val.nameMin').max(100),
  phone,
  primary_category_id: z.string().min(1, 'val.required'),
  skills: z.array(z.string().trim().min(2).max(60)).max(15),
  experience_years: intField(0, 70),
  indicative_price: intField(0, 1_000_000),
  pricing_unit: z.enum(PRICING_UNITS as [string, ...string[]]),
  city: z.string().trim().min(2, 'val.required').max(80),
  locality: z.string().trim().min(2, 'val.required').max(120),
  service_radius_km: intField(1, 100),
  languages: z.array(z.string()).min(1, 'val.languages'),
  description: z.string().trim().max(1000, 'val.tooLong').optional(),
})
export type WorkerProfileForm = z.infer<typeof workerProfileSchema>

export const customerProfileSchema = z.object({
  full_name: z.string().trim().min(2, 'val.nameMin').max(100),
  phone: optionalPhone,
  default_locality: z.string().trim().max(120).optional(),
  preferred_language: z.enum(['en', 'hi']),
})
export type CustomerProfileForm = z.infer<typeof customerProfileSchema>

export const visitDetailsSchema = z.object({
  locality: z.string().trim().min(2, 'val.required').max(120),
  address: z.string().trim().max(300, 'val.tooLong').optional(),
  description: z.string().trim().min(10, 'val.descMin').max(1000, 'val.tooLong'),
})
export type VisitDetailsForm = z.infer<typeof visitDetailsSchema>

export const reviewSchema = z.object({
  rating: z.number().int().min(1, 'val.ratingRequired').max(5),
  text: z.string().trim().max(1000, 'val.tooLong').optional(),
})
export type ReviewForm = z.infer<typeof reviewSchema>

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  name_hi: z.string().trim().max(60).optional(),
  slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'val.slug'),
  icon: z.string(),
  description: z.string().trim().max(200).optional(),
})
export type CategoryForm = z.infer<typeof categorySchema>

export const reportSchema = z.object({ reason: z.string().trim().min(5, 'val.reasonMin').max(500, 'val.tooLong') })

// ---- portfolio project (numbers are strings in the form and converted on save)
export const projectSchema = z
  .object({
    title: z.string().trim().min(3, 'val.titleMin').max(120, 'val.tooLong'),
    category_id: z.string(),
    description: z.string().trim().max(1000, 'val.tooLong'),
    location_label: z.string().trim().max(120, 'val.tooLong'),
    completed_month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'val.required'),
    area: z.string().trim().regex(/^(\d{1,8}(\.\d)?)?$/, 'val.number'),
    disclose_price: z.boolean(),
    price: z.string().trim().regex(/^(\d{1,9})?$/, 'val.number'),
    price_unit: z.enum(PRICING_UNITS as [string, ...string[]]),
    tags: z.array(z.string().trim().min(1).max(30)).max(8),
    is_published: z.boolean(),
  })
  .refine((v) => v.location_label === '' || v.location_label.length >= 2, { path: ['location_label'], message: 'val.range' })
  .refine((v) => !v.disclose_price || v.price !== '', { path: ['price'], message: 'val.required' })
  .refine((v) => v.completed_month <= new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 7), { path: ['completed_month'], message: 'val.futureMonth' })
export type ProjectForm = z.infer<typeof projectSchema>
