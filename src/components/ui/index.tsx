import {
  createContext, forwardRef, useCallback, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import { AlertTriangle, BadgeCheck, BrickWall, CheckCircle2, Fan, Flame, Hammer, HardHat, Inbox, Info, Layers, LayoutGrid, Loader2, PaintRoller, RefreshCw, Sparkles, Star, Wrench, X, XCircle, Zap, type LucideIcon } from 'lucide-react'
import { useI18n, useT } from '@/i18n'
import type { BookingStatus, VerificationStatus } from '@/lib/types'

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

// ------------------------------------------------------------------ Button
type Variant = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover disabled:bg-primary/50',
  accent: 'bg-amber-500 text-navy-950 hover:bg-primary-hover disabled:bg-amber-500/50',
  outline: 'bg-card text-navy-900 border border-navy-900/25 hover:bg-navy-50 disabled:text-navy-900/50',
  ghost: 'bg-transparent text-navy-900 hover:bg-navy-900/8 disabled:text-navy-900/50',
  danger: 'bg-bad text-navy-950 hover:opacity-90 disabled:bg-bad/50',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'md' | 'lg' | 'sm'
  loading?: boolean
}

export function buttonClass(variant: Variant = 'primary', size: 'md' | 'lg' | 'sm' = 'md', extra?: string) {
  return cx(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-colors select-none cursor-pointer disabled:cursor-not-allowed',
    size === 'lg' ? 'min-h-12 px-6 text-base' : size === 'sm' ? 'min-h-9 px-3 text-sm' : 'min-h-11 px-4 text-[15px]',
    VARIANTS[variant],
    extra,
  )
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClass(variant, size, className)} {...rest}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

// ------------------------------------------------------------------ Form fields
export function Field({ label, hint, error, children, htmlFor, required }: {
  label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string; required?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
        {label}{required && <span className="text-bad" aria-hidden> *</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p role="alert" className="text-xs font-medium text-bad">{error}</p>}
    </div>
  )
}

const controlClass = (invalid?: boolean) =>
  cx(
    'w-full min-h-11 rounded-xl border bg-card px-3.5 py-2 text-[15px] text-ink placeholder:text-muted/70 disabled:bg-navy-50 disabled:text-muted',
    invalid ? 'border-bad' : 'border-navy-900/25 hover:border-navy-900/50',
  )

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ invalid, className, ...rest }, ref) {
    return <input ref={ref} aria-invalid={invalid || undefined} className={cx(controlClass(invalid), className)} {...rest} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ invalid, className, ...rest }, ref) {
    return <textarea ref={ref} aria-invalid={invalid || undefined} className={cx(controlClass(invalid), 'min-h-24', className)} {...rest} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ invalid, className, children, ...rest }, ref) {
    return <select ref={ref} aria-invalid={invalid || undefined} className={cx(controlClass(invalid), className)} {...rest}>{children}</select>
  },
)

// ------------------------------------------------------------------ Surfaces
export function Card({ children, className, as: Tag = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' | 'li' }) {
  return <Tag className={cx('rounded-[6px] border border-line bg-card shadow-card', className)}>{children}</Tag>
}

type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info' | 'navy'
const TONES: Record<Tone, string> = {
  neutral: 'bg-navy-50 text-navy-900',
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  info: 'bg-sky-100 text-sky-900',
  navy: 'bg-primary text-on-primary',
}
export function Badge({ children, tone = 'neutral', icon: Icon, className }: { children: ReactNode; tone?: Tone; icon?: LucideIcon; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', TONES[tone], className)}>
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </span>
  )
}

const STATUS_TONE: Record<BookingStatus, Tone> = { pending: 'warn', accepted: 'ok', declined: 'bad', completed: 'info', cancelled: 'neutral' }
export function StatusBadge({ status }: { status: BookingStatus }) {
  const t = useT()
  return <Badge tone={STATUS_TONE[status]}>{t(`status.${status}`)}</Badge>
}

export function DemoBadge() {
  const t = useT()
  if (!import.meta.env.DEV) return null   // development-only marker, never shown to real customers
  return <Badge tone="info" icon={Info}>{t('common.sampleData')}</Badge>
}

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const t = useT()
  // Only a completed verification gets a badge. Anything else is never presented as verified.
  if (status === 'verified') return <Badge tone="ok" icon={BadgeCheck}>{t('verification.verified')}</Badge>
  if (status === 'pending') return <Badge tone="neutral">{t('verification.pending')}</Badge>
  return null
}

// ------------------------------------------------------------------ Feedback
export function Spinner({ label }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-muted">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      {label && <span className="text-sm">{label}</span>}
      {!label && <span className="sr-only">Loading</span>}
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('skeleton', className)} />
}

export function CardListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="flex gap-4 p-4">
          <Skeleton className="size-20 shrink-0 !rounded-full" />
          <div className="flex-1 space-y-2.5">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </Card>
      ))}
    </div>
  )
}

export function EmptyState({ icon: Icon = Inbox, title, text, action }: { icon?: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[6px] border border-dashed border-navy-900/20 bg-white/60 px-6 py-12 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-navy-50 text-navy-700"><Icon className="size-7" aria-hidden /></span>
      <h3 className="text-lg font-bold">{title}</h3>
      {text && <p className="max-w-md text-sm text-muted">{text}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const t = useT()
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-[6px] border border-bad/30 bg-bad-bg/50 px-6 py-10 text-center">
      <AlertTriangle className="size-8 text-bad" aria-hidden />
      <p className="font-semibold text-bad">{message ?? t('err.generic')}</p>
      {onRetry && <Button variant="outline" onClick={onRetry}><RefreshCw className="size-4" aria-hidden />{t('common.retry')}</Button>}
    </div>
  )
}

export function Notice({ tone = 'info', children, icon: Icon = Info }: { tone?: 'info' | 'warn' | 'ok' | 'bad'; children: ReactNode; icon?: LucideIcon }) {
  const styles = { info: 'bg-info-bg border-info/30 text-info', warn: 'bg-warn-bg border-warn/40 text-warn', ok: 'bg-ok-bg border-ok/30 text-ok', bad: 'bg-bad-bg border-bad/30 text-bad' }
  return (
    <div className={cx('flex gap-2.5 rounded-xl border p-3 text-sm', styles[tone])}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  )
}

// ------------------------------------------------------------------ Modal (native <dialog>: focus trap + Esc for free)
export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const t = useT()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
      className="m-auto w-full backdrop:backdrop-blur-[1px]"
      style={{ maxWidth: wide ? 720 : 520 }}
    >
      {open && (
        <div className="m-3 flex max-h-[92dvh] flex-col rounded-2xl bg-card shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <h2 id={titleId} className="text-lg font-bold">{title}</h2>
            <button type="button" onClick={onClose} aria-label={t('common.close')} className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg hover:bg-navy-50">
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}

export function ConfirmDialog({ open, title, message, confirmLabel, danger, onConfirm, onCancel }: {
  open: boolean; title: string; message: ReactNode; confirmLabel: string; danger?: boolean
  onConfirm: () => Promise<unknown> | unknown; onCancel: () => void
}) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={busy}>{t('common.goBack')}</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            onClick={async () => {
              setBusy(true)
              try { await onConfirm() } finally { setBusy(false) }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[15px] text-ink">{message}</div>
    </Modal>
  )
}

// ------------------------------------------------------------------ Toasts
interface ToastItem { id: number; kind: 'ok' | 'bad' | 'info'; text: string }
const ToastCtx = createContext<{ push: (kind: ToastItem['kind'], text: string) => void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((kind: ToastItem['kind'], text: string) => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x.slice(-3), { id, kind, text }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 6000)
  }, [])
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
        {items.map((i) => (
          <div key={i.id} className={cx('pointer-events-auto flex max-w-md items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg',
            i.kind === 'ok' ? 'bg-ok text-navy-950' : i.kind === 'bad' ? 'bg-bad text-navy-950' : 'bg-primary text-on-primary')}>
            {i.kind === 'ok' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : i.kind === 'bad' ? <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> : <Info className="mt-0.5 size-4 shrink-0" aria-hidden />}
            {i.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const c = useContext(ToastCtx)
  if (!c) throw new Error('useToast must be used inside <ToastProvider>')
  return {
    success: (m: string) => c.push('ok', m),
    error: (m: string) => c.push('bad', m),
    info: (m: string) => c.push('info', m),
  }
}

// ------------------------------------------------------------------ Stars
export function Stars({ value, count, size = 'md', showEmpty }: { value: number; count?: number; size?: 'sm' | 'md' | 'lg'; showEmpty?: boolean }) {
  const t = useT()
  const px = size === 'lg' ? 'size-6' : size === 'sm' ? 'size-3.5' : 'size-4'
  if (count === 0 && !showEmpty) return <span className="text-sm text-muted">{t('reviews.none')}</span>
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={t('reviews.ratingLabel', { value: value.toFixed(1), count: count ?? 0 })}>
      <span className="inline-flex" aria-hidden>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} className={cx(px, n <= Math.round(value) ? 'fill-warn text-warn' : 'text-navy-900/20')} />
        ))}
      </span>
      <span className="text-sm font-bold">{Number(value).toFixed(1)}</span>
      {count !== undefined && <span className="text-sm text-muted">({count})</span>}
    </span>
  )
}

export function StarInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} / 5`}
          onClick={() => onChange(n)}
          className="grid size-12 cursor-pointer place-items-center rounded-lg hover:bg-amber-50"
        >
          <Star className={cx('size-8', n <= value ? 'fill-warn text-warn' : 'text-navy-900/25')} aria-hidden />
        </button>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ Avatar
export function Avatar({ name, src, size = 56 }: { name: string; src?: string | null; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
  const [failed, setFailed] = useState(false)
  const style = { width: size, height: size, fontSize: size * 0.38 }
  if (src && !failed) {
    return <img src={src} alt="" loading="lazy" width={size} height={size} onError={() => setFailed(true)} style={style} className="shrink-0 rounded-full object-cover ring-1 ring-line" />
  }
  return (
    <span aria-hidden style={style} className="grid shrink-0 place-items-center rounded-full bg-navy-100 font-bold text-navy-800">
      {initials || '?'}
    </span>
  )
}

// ------------------------------------------------------------------ Category icons
const ICONS: Record<string, LucideIcon> = {
  'brick-wall': BrickWall, wrench: Wrench, zap: Zap, 'paint-roller': PaintRoller, hammer: Hammer,
  'layout-grid': LayoutGrid, flame: Flame, 'hard-hat': HardHat, layers: Layers, fan: Fan, sparkles: Sparkles,
}
export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Wrench
  return <Icon className={className ?? 'size-6'} aria-hidden />
}
export const ICON_NAMES = Object.keys(ICONS)

/** Localised category name. */
export function useCategoryName() {
  const { lang } = useI18n()
  return (c: { name: string; name_hi?: string | null }) => (lang === 'hi' && c.name_hi ? c.name_hi : c.name)
}

// ------------------------------------------------------------------ Page container / headings
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto w-full max-w-6xl px-4 sm:px-6', className)}>{children}</div>
}

export function PageHeading({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  )
}

export function Chip({ active, children, onClick, ...rest }: { active?: boolean; children: ReactNode; onClick?: () => void } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx('min-h-9 cursor-pointer rounded-md border px-3.5 text-sm font-semibold transition-colors',
        active ? 'border-primary bg-primary text-on-primary' : 'border-navy-900/25 bg-card text-navy-900 hover:bg-navy-50')}
      {...rest}
    >
      {children}
    </button>
  )
}
