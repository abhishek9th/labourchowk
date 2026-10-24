// Digital Skill Passport helpers: canonical URL and contact links.

export interface BaseUrlInput {
  /** VITE_PUBLIC_BASE_URL */
  env?: string | null
  /** import.meta.env.PROD */
  isProd: boolean
  /** window.location.origin */
  origin: string
}

export interface ResolvedBase { base: string; usedFallback: boolean }

/**
 * The public URL base used inside QR codes and shared links.
 * Production builds use the configured VITE_PUBLIC_BASE_URL. If it is missing we fall back to the
 * page's own origin (so links still work) but flag it so the dashboard can warn the owner.
 */
export function resolveBaseUrl({ env, isProd, origin }: BaseUrlInput): ResolvedBase {
  const clean = (u: string) => u.trim().replace(/\/+$/, '')
  const configured = env ? clean(env) : ''
  // template values from .env.example are not real domains: treat them as "not configured"
  const placeholder = /your-production-domain|\.example(\/|$)/i.test(configured)
  if (!placeholder && /^https?:\/\/[^\s/]+/i.test(configured)) return { base: configured, usedFallback: false }
  // dev builds are expected to use localhost; production without config is a deployment mistake
  return { base: clean(origin), usedFallback: isProd }
}

export function runtimeBase(): ResolvedBase {
  return resolveBaseUrl({
    env: import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined,
    isProd: import.meta.env.PROD,
    origin: typeof window !== 'undefined' ? window.location.origin : '',
  })
}

export const PUBLIC_ID_RE = /^[A-HJ-NP-Z2-9]{10}$/

/** Canonical permanent profile URL: https://DOMAIN/p/PUBLIC_ID (derived only from the stored id). */
export function passportUrl(publicId: string, base: string = runtimeBase().base): string {
  return `${base.replace(/\/+$/, '')}/p/${encodeURIComponent(publicId.toUpperCase())}`
}

/** Digits-only E.164-ish number for wa.me; assumes India for 10-digit local numbers. Null if implausible. */
export function toWhatsAppNumber(raw: string): string | null {
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  if (d.length === 10) d = '91' + d
  return d.length >= 11 && d.length <= 15 ? d : null
}

export function whatsAppLink(phone: string, text?: string): string | null {
  const n = toWhatsAppNumber(phone)
  if (!n) return null
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

export function telLink(phone: string): string | null {
  const n = toWhatsAppNumber(phone)
  return n ? `tel:+${n}` : null
}
