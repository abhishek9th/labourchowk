import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QRCodeSVG } from 'qrcode.react'
import jsQR from 'jsqr'
import { passportUrl, PUBLIC_ID_RE, resolveBaseUrl, telLink, toWhatsAppNumber, whatsAppLink } from '@/lib/passport'
import { checkFileBasics, fitWithin, sniffImageType } from '@/lib/image'
import { projectSchema } from '@/lib/schemas'
import { QR_LEVEL } from '@/components/Qr'

/** Render the same QR the app shows, rasterise it with a quiet zone, and decode it like a scanner would. */
function decodeQr(value: string): string | null {
  const svg = renderToStaticMarkup(createElement(QRCodeSVG, { value, size: 200, level: QR_LEVEL, marginSize: 0 }))
  const n = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)![1])
  const scale = 8, quiet = 4, side = (n + quiet * 2) * scale
  const px = new Uint8ClampedArray(side * side * 4).fill(255)
  // only the second <path> holds the dark modules
  const darkPath = /fill="#000000" d="([^"]+)"/.exec(svg)![1]
  for (const m of darkPath.matchAll(/M(\d+)[ ,](\d+)\s*h(\d+)v1H/g)) {
    const x0 = Number(m[1]), y0 = Number(m[2]), w = Number(m[3])
    for (let y = 0; y < scale; y++) for (let x = 0; x < w * scale; x++) {
      const i = (((y0 + quiet) * scale + y) * side + (x0 + quiet) * scale + x) * 4
      px[i] = px[i + 1] = px[i + 2] = 0
    }
  }
  return jsQR(px, side, side)?.data ?? null
}

describe('public URL', () => {
  it('uses the configured production base URL, normalised', () => {
    expect(resolveBaseUrl({ env: 'https://labourchowk.in/', isProd: true, origin: 'https://other.vercel.app' })).toEqual({ base: 'https://labourchowk.in', usedFallback: false })
    expect(passportUrl('abcd234567', 'https://labourchowk.in///')).toBe('https://labourchowk.in/p/ABCD234567')
  })
  it('falls back to the page origin and flags it in production when unconfigured', () => {
    expect(resolveBaseUrl({ env: 'https://your-production-domain.example', isProd: false, origin: 'http://10.0.0.5:5173' })).toEqual({ base: 'http://10.0.0.5:5173', usedFallback: false })
    expect(resolveBaseUrl({ env: undefined, isProd: true, origin: 'https://app.example.com' })).toEqual({ base: 'https://app.example.com', usedFallback: true })
    expect(resolveBaseUrl({ env: '   ', isProd: false, origin: 'http://localhost:5173' })).toEqual({ base: 'http://localhost:5173', usedFallback: false })
    expect(resolveBaseUrl({ env: 'not a url', isProd: true, origin: 'https://app.example.com' }).usedFallback).toBe(true)
  })
  it('depends only on the public id (not on name, profession or phone)', () => {
    const base = 'https://labourchowk.in'
    expect(passportUrl('K7M2Q9XW4T', base)).toBe(passportUrl('K7M2Q9XW4T', base))
    expect(passportUrl('K7M2Q9XW4T', base)).not.toBe(passportUrl('K7M2Q9XW4U', base))
    expect(PUBLIC_ID_RE.test('K7M2Q9XW4T')).toBe(true)
    for (const bad of ['k7m2q9xw4t', 'K7M2Q9XW4', 'K7M2Q9XW4TT', 'IOIOIOIOIO', '0123456789', '../../etc']) expect(PUBLIC_ID_RE.test(bad), bad).toBe(false)
  })
})

describe('QR code', () => {
  it('decodes back to exactly the canonical profile URL', () => {
    const url = passportUrl('K7M2Q9XW4T', 'https://labourchowk.in')
    expect(decodeQr(url)).toBe('https://labourchowk.in/p/K7M2Q9XW4T')
  })
  it('is identical for the same id and different for another worker', () => {
    const render = (u: string) => renderToStaticMarkup(createElement(QRCodeSVG, { value: u, size: 200, level: QR_LEVEL, marginSize: 0 }))
    const a = passportUrl('K7M2Q9XW4T', 'https://labourchowk.in')
    expect(render(a)).toBe(render(a))
    expect(render(a)).not.toBe(render(passportUrl('K7M2Q9XW4U', 'https://labourchowk.in')))
  })
  it('encodes no profile data, only the URL', () => {
    const url = passportUrl('K7M2Q9XW4T', 'https://labourchowk.in')
    expect(decodeQr(url)).not.toMatch(/phone|name|price/i)
  })
})

describe('contact links', () => {
  it('builds WhatsApp / tel links safely', () => {
    expect(toWhatsAppNumber('98111 22233')).toBe('919811122233')
    expect(toWhatsAppNumber('+91 (98111) 22-233')).toBe('919811122233')
    expect(toWhatsAppNumber('09811122233')).toBe('919811122233')
    expect(toWhatsAppNumber('0091 9811122233')).toBe('919811122233')
    expect(toWhatsAppNumber('12345')).toBeNull()
    expect(toWhatsAppNumber('abc')).toBeNull()
    expect(whatsAppLink('9811122233', 'Hi & "bye"')).toBe('https://wa.me/919811122233?text=Hi%20%26%20%22bye%22')
    expect(whatsAppLink('9811122233')).toBe('https://wa.me/919811122233')
    expect(telLink('98111-22233')).toBe('tel:+919811122233')
    expect(telLink('x')).toBeNull()
  })
})

describe('image validation', () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
  const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
  const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])
  it('identifies images by content, not by name', () => {
    expect(sniffImageType(png)).toBe('png')
    expect(sniffImageType(jpg)).toBe('jpeg')
    expect(sniffImageType(webp)).toBe('webp')
    expect(sniffImageType(new TextEncoder().encode('<html><script>alert(1)</script>'))).toBeNull()
    expect(sniffImageType(new TextEncoder().encode('GIF89a......'))).toBeNull()
    expect(sniffImageType(new Uint8Array())).toBeNull()
  })
  it('rejects empty, oversized and non-image files', () => {
    expect(checkFileBasics(0, jpg)).toBe('empty')
    expect(checkFileBasics(30 * 1024 * 1024, jpg)).toBe('tooLarge')
    expect(checkFileBasics(1000, new TextEncoder().encode('MZ executable'))).toBe('notImage')
    expect(checkFileBasics(1000, jpg)).toBeNull()
  })
  it('downscales without upscaling and keeps the aspect ratio', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })
})

describe('project form schema', () => {
  const ok = { title: 'Bathroom Tile Installation', category_id: '', description: '', location_label: 'Indiranagar', completed_month: '2025-03', area: '850', disclose_price: false, price: '', price_unit: 'per_task', tags: ['residential'], is_published: true }
  it('accepts a valid project', () => expect(projectSchema.safeParse(ok).success).toBe(true))
  it('rejects bad input with translatable keys', () => {
    const msgs = (v: object) => { const r = projectSchema.safeParse({ ...ok, ...v }); return r.success ? [] : r.error.issues.map((i) => i.message) }
    expect(msgs({ title: 'ab' })).toContain('val.titleMin')
    expect(msgs({ completed_month: '2999-01' })).toContain('val.futureMonth')
    expect(msgs({ completed_month: '' })).toContain('val.required')
    expect(msgs({ area: 'abc' })).toContain('val.number')
    expect(msgs({ disclose_price: true, price: '' })).toContain('val.required')
    expect(msgs({ tags: Array(9).fill('x') }).length).toBeGreaterThan(0)
  })
})
