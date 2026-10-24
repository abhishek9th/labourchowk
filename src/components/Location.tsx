import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { LocateFixed, MapPin } from 'lucide-react'
import { useT } from '@/i18n'
import { LOCALITIES, findLocality, localityLabel, requestBrowserLocation } from '@/lib/geo'
import type { GeoPoint } from '@/lib/types'
import { Button, Input, Notice, Select } from '@/components/ui'

const STORAGE_KEY = 'lc.location'

function read(): GeoPoint | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as GeoPoint
    if (typeof p.label !== 'string' || !['gps', 'preset', 'text'].includes(p.source)) return null
    return p
  } catch {
    return null
  }
}

interface LocationCtx {
  location: GeoPoint | null
  setLocation: (p: GeoPoint | null) => void
}
const Ctx = createContext<LocationCtx | null>(null)

/** The customer's search location, remembered in this browser only. */
export function LocationProvider({ children }: { children: ReactNode }) {
  const [location, setState] = useState<GeoPoint | null>(read)
  const setLocation = useCallback((p: GeoPoint | null) => {
    setState(p)
    try {
      if (p) localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
      else localStorage.removeItem(STORAGE_KEY)
    } catch { /* storage may be unavailable (private mode) */ }
  }, [])
  const value = useMemo(() => ({ location, setLocation }), [location, setLocation])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSearchLocation(): LocationCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSearchLocation must be used inside <LocationProvider>')
  return v
}

const CITIES = [...new Set(LOCALITIES.map((l) => l.city))]

/**
 * Location chooser with three paths: a built-in locality list (exact coordinates), the browser's
 * geolocation (explicit permission), or free text (no coordinates, so results fall back to
 * locality-name matching and say so).
 */
export function LocationPicker({ value, onChange, idPrefix = 'loc', compact }: {
  value: GeoPoint | null
  onChange: (p: GeoPoint | null) => void
  idPrefix?: string
  /** icon-only locate button (narrow containers such as the filter sidebar) */
  compact?: boolean
}) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [showText, setShowText] = useState(value?.source === 'text')
  const [text, setText] = useState(value?.source === 'text' ? value.label : '')

  async function locate() {
    setBusy(true)
    setProblem(null)
    const r = await requestBrowserLocation()
    setBusy(false)
    if (r.ok) {
      onChange({ ...r.point, label: t('location.current') })
    } else {
      setProblem(t(`location.problem.${r.reason}`))
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Select
            id={`${idPrefix}-select`}
            aria-label={t('location.select')}
            className="!pl-9"
            value={value?.source === 'preset' ? value.label : ''}
            onChange={(e) => {
              const l = findLocality(e.target.value)
              setProblem(null)
              onChange(l ? { lat: l.lat, lng: l.lng, label: localityLabel(l), source: 'preset' } : null)
            }}
          >
            <option value="">
              {value && value.source !== 'preset' ? value.label : t('location.choose')}
            </option>
            {CITIES.map((c) => (
              <optgroup key={c} label={c}>
                {LOCALITIES.filter((l) => l.city === c).map((l) => (
                  <option key={l.name} value={localityLabel(l)}>{l.name}</option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>
        <Button variant="outline" onClick={locate} loading={busy} aria-label={t('location.useMine')} title={t('location.useMine')} className="shrink-0">
          <LocateFixed className="size-5" aria-hidden />
          {!compact && <span className="hidden sm:inline">{t('location.useMine')}</span>}
        </Button>
      </div>

      {problem && <Notice tone="warn">{problem}</Notice>}

      {showText ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const label = text.trim()
            onChange(label ? { lat: null, lng: null, label, source: 'text' } : null)
          }}
        >
          <Input
            aria-label={t('location.typeArea')}
            placeholder={t('location.typePlaceholder')}
            value={text}
            maxLength={120}
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" variant="outline">{t('common.apply')}</Button>
        </form>
      ) : (
        <button type="button" onClick={() => setShowText(true)} className="w-fit cursor-pointer text-sm font-semibold text-navy-700 underline underline-offset-2">
          {t('location.cantFind')}
        </button>
      )}

      {value?.source === 'text' && (
        <Notice tone="info">{t('location.textNote')}</Notice>
      )}
    </div>
  )
}
