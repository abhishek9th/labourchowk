import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CalendarDays, Clock, Info, MapPin } from 'lucide-react'
import { useI18n, useT } from '@/i18n'
import { useAuth } from '@/auth/AuthProvider'
import { api } from '@/lib/api'
import { friendlyError, errorCode } from '@/lib/errors'
import { formatDate, formatTime, monthRange, todayISO } from '@/lib/dates'
import { formatPrice } from '@/lib/format'
import { visitDetailsSchema, type VisitDetailsForm } from '@/lib/schemas'
import type { CalendarDay } from '@/lib/types'
import { Button, ErrorState, Field, Input, Modal, Notice, Skeleton, Textarea, cx, useToast } from '@/components/ui'
import { Calendar, CalendarLegend } from '@/components/Calendar'
import { useFieldError } from '@/components/forms'
import { useSearchLocation } from '@/components/Location'

const REFRESH_CODES = ['ERR_SLOT_UNAVAILABLE', 'ERR_DATE_BLOCKED', 'ERR_DATE_UNAVAILABLE', 'ERR_INVALID_SLOT', 'ERR_DATE_IN_PAST']

/** Customer flow: pick date -> pick slot -> describe job -> review & submit. */
export function ScheduleVisitDialog({ workerId, onClose }: { workerId: string; onClose: () => void }) {
  const t = useT()
  const { locale } = useI18n()
  const toast = useToast()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const { location } = useSearchLocation()
  const fieldError = useFieldError()
  const today = todayISO()
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m0: Number(today.slice(5, 7)) - 1 }))
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [date, setDate] = useState<string | null>(null)
  const [start, setStart] = useState<string | null>(null)

  const worker = useQuery({ queryKey: ['worker', workerId], queryFn: () => api.worker(workerId) })
  const { from, to } = monthRange(ym.y, ym.m0)
  const cal = useQuery({ queryKey: ['calendar', workerId, from], queryFn: () => api.calendar(workerId, from, to) })
  const slots = useQuery({ queryKey: ['slots', workerId, date], queryFn: () => api.slots(workerId, date!), enabled: Boolean(date) })

  const byDay = useMemo(() => new Map<string, CalendarDay>((cal.data ?? []).map((d) => [d.day, d])), [cal.data])

  const defaultLocality = location?.source !== 'gps' && location?.label ? location.label : profile?.default_locality ?? ''
  const form = useForm<VisitDetailsForm>({
    resolver: zodResolver(visitDetailsSchema),
    defaultValues: { locality: defaultLocality, address: '', description: '' },
    mode: 'onTouched',
  })

  const submit = useMutation({
    mutationFn: (v: VisitDetailsForm) => api.createVisit({
      workerId,
      categoryId: worker.data?.primary_category_id ?? null,
      date: date!,
      start: start!,
      locality: v.locality,
      address: v.address ?? '',
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
      description: v.description,
    }),
    onSuccess: async (id) => {
      toast.success(t('schedule.sent'))
      await qc.invalidateQueries({ queryKey: ['customerBookings'] })
      onClose()
      nav(`/customer/bookings/${id}`)
    },
    onError: async (e) => {
      toast.error(friendlyError(e, t))
      const code = errorCode(e)
      if (code && REFRESH_CODES.includes(code)) {
        await Promise.all([qc.invalidateQueries({ queryKey: ['calendar', workerId] }), qc.invalidateQueries({ queryKey: ['slots', workerId] })])
        setStart(null)
        setStep(1)
      }
    },
  })

  const w = worker.data
  const price = w ? formatPrice(Number(w.indicative_price), w.pricing_unit) : null
  const chosenSlot = slots.data?.find((s) => s.slot_start === start)

  const canNextFromStep1 = Boolean(date && start)
  const steps = [t('schedule.step.when'), t('schedule.step.details'), t('schedule.step.review')]

  return (
    <Modal open onClose={onClose} wide title={w ? t('schedule.titleFor', { name: w.full_name }) : t('schedule.title')}
      footer={
        <>
          {step > 1 && <Button variant="outline" onClick={() => setStep((s) => (s - 1) as 1 | 2)} disabled={submit.isPending}>{t('common.back')}</Button>}
          {step === 1 && <Button disabled={!canNextFromStep1} onClick={() => setStep(2)}>{t('common.continue')}</Button>}
          {step === 2 && <Button onClick={form.handleSubmit(() => setStep(3))}>{t('common.continue')}</Button>}
          {step === 3 && (
            <Button variant="accent" loading={submit.isPending} onClick={form.handleSubmit((v) => submit.mutate(v))}>
              {t('schedule.submit')}
            </Button>
          )}
        </>
      }
    >
      <ol className="mb-4 flex gap-2 text-xs font-semibold" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s} aria-current={step === i + 1 ? 'step' : undefined}
            className={cx('flex-1 rounded-md px-3 py-1.5 text-center', step === i + 1 ? 'bg-primary text-on-primary' : step > i + 1 ? 'bg-ok-bg text-ok' : 'bg-navy-50 text-muted')}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      <Notice tone="warn" icon={Info}>
        <strong>{t('schedule.rule.title')}</strong> {t('schedule.rule.body')}
      </Notice>

      {worker.isError && <div className="mt-4"><ErrorState message={friendlyError(worker.error, t)} onRetry={() => worker.refetch()} /></div>}
      {worker.isSuccess && !w && <div className="mt-4"><ErrorState message={t('err.ERR_WORKER_NOT_FOUND')} /></div>}

      {step === 1 && (
        <div className="mt-4 space-y-5">
          <section aria-labelledby="sv-date">
            <h3 id="sv-date" className="mb-2 flex items-center gap-2 font-bold"><CalendarDays className="size-4" aria-hidden />{t('schedule.pickDate')}</h3>
            {cal.isError ? <ErrorState message={friendlyError(cal.error, t)} onRetry={() => cal.refetch()} /> : (
              <>
                <Calendar
                  year={ym.y} month0={ym.m0}
                  onMonthChange={(y, m0) => setYm({ y, m0 })}
                  loading={cal.isFetching}
                  info={(iso) => { const d = byDay.get(iso); return d ? { state: d.state, isExtra: d.is_extra_day, freeSlots: d.free_slots } : undefined }}
                  clickable={(iso, info) => info?.state === 'available' && iso >= today}
                  selected={date ? new Set([date]) : undefined}
                  onDayClick={(iso) => { setDate(iso); setStart(null) }}
                />
                <CalendarLegend />
              </>
            )}
          </section>

          {date && (
            <section aria-labelledby="sv-time">
              <h3 id="sv-time" className="mb-2 flex items-center gap-2 font-bold"><Clock className="size-4" aria-hidden />{t('schedule.pickTime')} · {formatDate(date, locale)}</h3>
              {slots.isLoading ? <div className="grid grid-cols-3 gap-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-11" />)}</div>
                : slots.isError ? <ErrorState message={friendlyError(slots.error, t)} onRetry={() => slots.refetch()} />
                : !slots.data?.some((s) => s.is_available) ? <Notice tone="warn">{t('schedule.noSlots')}</Notice>
                : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t('schedule.pickTime')}>
                    {slots.data.map((s) => (
                      <button key={s.slot_start} type="button" role="radio" aria-checked={start === s.slot_start} disabled={!s.is_available}
                        onClick={() => setStart(s.slot_start)}
                        className={cx('min-h-11 cursor-pointer rounded-xl border px-2 text-sm font-semibold disabled:cursor-not-allowed disabled:bg-navy-50 disabled:text-muted/60 disabled:line-through',
                          start === s.slot_start ? 'border-primary bg-primary text-on-primary' : 'border-navy-900/25 bg-card hover:bg-navy-50')}>
                        {formatTime(s.slot_start)} – {formatTime(s.slot_end)}
                      </button>
                    ))}
                  </div>
                )}
            </section>
          )}
        </div>
      )}

      {step === 2 && (
        <form className="mt-4 space-y-4" onSubmit={(e) => e.preventDefault()} noValidate>
          <Field label={t('schedule.locality')} htmlFor="sv-loc" required error={fieldError(form.formState.errors.locality)} hint={t('schedule.localityHint')}>
            <Input id="sv-loc" invalid={!!form.formState.errors.locality} {...form.register('locality')} placeholder={t('location.typePlaceholder')} autoComplete="address-level2" />
          </Field>
          <Field label={t('schedule.address')} htmlFor="sv-addr" error={fieldError(form.formState.errors.address)} hint={t('schedule.addressHint')}>
            <Input id="sv-addr" {...form.register('address')} autoComplete="street-address" />
          </Field>
          <Field label={t('schedule.jobDescription')} htmlFor="sv-desc" required error={fieldError(form.formState.errors.description)} hint={t('schedule.jobHint')}>
            <Textarea id="sv-desc" rows={4} invalid={!!form.formState.errors.description} {...form.register('description')} />
          </Field>
        </form>
      )}

      {step === 3 && w && date && chosenSlot && (
        <div className="mt-4 space-y-3">
          <dl className="divide-y divide-line rounded-xl border border-line text-sm">
            <Row k={t('schedule.review.worker')} v={`${w.full_name} · ${w.category_name}`} />
            <Row k={t('schedule.review.when')} v={`${formatDate(date, locale)}, ${formatTime(chosenSlot.slot_start)} – ${formatTime(chosenSlot.slot_end)}`} />
            <Row k={t('schedule.review.where')} v={<span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{form.getValues('locality')}{form.getValues('address') ? ` · ${form.getValues('address')}` : ''}</span>} />
            <Row k={t('schedule.review.job')} v={form.getValues('description')} />
            <Row k={t('schedule.review.price')} v={price ? `${price} (${t('worker.indicativeShort')})` : t('worker.priceNotSet')} />
          </dl>
          <Notice tone="info">{t('schedule.review.privacy')}</Notice>
          <Notice tone="info">{t('price.disclaimer')}</Notice>
        </div>
      )}
    </Modal>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-3 px-3 py-2.5">
      <dt className="font-semibold text-muted">{k}</dt>
      <dd className="min-w-0 break-words">{v}</dd>
    </div>
  )
}
