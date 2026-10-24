import { useRef, useState, type KeyboardEvent } from 'react'
import { Camera, X } from 'lucide-react'
import { useT } from '@/i18n'
import { Avatar, Button, Chip, cx, Input } from '@/components/ui'
import { LANGUAGE_OPTIONS } from '@/lib/format'

/** Translates a zod message key into the current language. */
export function useFieldError() {
  const t = useT()
  return (e?: { message?: unknown }) => (e?.message ? t(String(e.message)) : undefined)
}

export function LanguageChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group">
      {LANGUAGE_OPTIONS.map((l) => (
        <Chip key={l} active={value.includes(l)} onClick={() => onChange(value.includes(l) ? value.filter((x) => x !== l) : [...value, l])}>
          {l}
        </Chip>
      ))}
    </div>
  )
}

/** Free-text tags (skills). Enter or comma adds, backspace on empty removes the last. */
export function TagInput({ value, onChange, placeholder, max = 15, id }: {
  value: string[]; onChange: (v: string[]) => void; placeholder?: string; max?: number; id?: string
}) {
  const t = useT()
  const [draft, setDraft] = useState('')
  function add() {
    const v = draft.trim().replace(/,$/, '').slice(0, 60)
    if (v.length >= 2 && value.length < max && !value.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...value, v])
    setDraft('')
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
    else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
  }
  return (
    <div>
      <div className="flex gap-2">
        <Input id={id} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={add} maxLength={60} />
        <Button variant="outline" onClick={add}>{t('common.add')}</Button>
      </div>
      {value.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {value.map((s) => (
            <li key={s} className="inline-flex items-center gap-1 rounded-md bg-navy-50 py-1 pr-1 pl-3 text-sm font-semibold">
              {s}
              <button type="button" aria-label={`${t('common.remove')} ${s}`} onClick={() => onChange(value.filter((x) => x !== s))} className="grid size-7 cursor-pointer place-items-center rounded-full hover:bg-navy-900/10">
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const MAX_BYTES = 2 * 1024 * 1024
export const ACCEPTED_IMAGES = ['image/jpeg', 'image/png', 'image/webp']

/** Photo chooser with client-side type/size checks (the storage bucket enforces them again). */
export function PhotoPicker({ name, currentUrl, file, onFile, onError }: {
  name: string; currentUrl?: string | null; file: File | null; onFile: (f: File | null) => void; onError: (m: string) => void
}) {
  const t = useT()
  const ref = useRef<HTMLInputElement>(null)
  const preview = file ? URL.createObjectURL(file) : currentUrl
  return (
    <div className="flex items-center gap-4">
      <Avatar name={name || '?'} src={preview} size={72} />
      <div>
        <input
          ref={ref}
          type="file"
          accept={ACCEPTED_IMAGES.join(',')}
          className="sr-only"
          id="photo-input"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            if (!f) return
            if (!ACCEPTED_IMAGES.includes(f.type)) return onError(t('photo.type'))
            if (f.size > MAX_BYTES) return onError(t('photo.size'))
            onFile(f)
          }}
        />
        <Button variant="outline" onClick={() => ref.current?.click()}>
          <Camera className="size-4" aria-hidden />{preview ? t('photo.change') : t('photo.add')}
        </Button>
        <p className={cx('mt-1 text-xs text-muted')}>{t('photo.hint')}</p>
      </div>
    </div>
  )
}
