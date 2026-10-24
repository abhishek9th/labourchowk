import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Clock, MapPin, Phone, Star } from 'lucide-react'
import { useI18n, useT } from '@/i18n'
import { api } from '@/lib/api'
import { friendlyError, errorCode, errorDetail } from '@/lib/errors'
import { formatDate, formatTime, todayISO } from '@/lib/dates'
import type { CustomerBooking, WorkerVisit } from '@/lib/types'
import { Avatar, Button, Card, ConfirmDialog, DemoBadge, Notice, StatusBadge, Stars, buttonClass, useToast } from '@/components/ui'
import { ReviewDialog } from '@/components/ReviewDialog'

export function useCustomerBookings() {
  return useQuery({ queryKey: ['customerBookings'], queryFn: () => api.customerBookings(), staleTime: 10_000 })
}
export function useWorkerVisits() {
  return useQuery({ queryKey: ['workerVisits'], queryFn: () => api.workerVisits(), staleTime: 10_000 })
}

function refreshAll(qc: ReturnType<typeof useQueryClient>) {
  return Promise.all(['customerBookings', 'workerVisits', 'workerStats', 'unread', 'notifications', 'calendar', 'slots', 'search']
    .map((k) => qc.invalidateQueries({ queryKey: [k] })))
}

// ------------------------------------------------------------------ customer
export function CustomerBookingCard({ b, detailed }: { b: CustomerBooking; detailed?: boolean }) {
  const t = useT()
  const { locale } = useI18n()
  const qc = useQueryClient()
  const toast = useToast()
  const [cancelling, setCancelling] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const today = todayISO()

  const cancel = useMutation({
    mutationFn: () => api.cancelVisit(b.id),
    onSuccess: async () => { toast.success(t('booking.cancelled')); setCancelling(false); await refreshAll(qc) },
    onError: (e) => { toast.error(friendlyError(e, t)); setCancelling(false) },
  })

  const canCancel = (b.status === 'pending' || b.status === 'accepted') && b.requested_date >= today
  const canReview = b.status === 'completed' && !b.review_id

  return (
    <Card as="article" className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={b.worker_name} src={b.worker_avatar} size={52} />
          <div>
            <h3 className="font-bold"><Link className="hover:underline" to={`/workers/${b.worker_id}`}>{b.worker_name}</Link></h3>
            <p className="text-sm text-muted">{b.category_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">{b.is_demo && <DemoBadge />}<StatusBadge status={b.status} /></div>
      </div>

      <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
        <li className="flex items-center gap-2"><CalendarDays className="size-4 text-muted" aria-hidden />{formatDate(b.requested_date, locale)}</li>
        <li className="flex items-center gap-2"><Clock className="size-4 text-muted" aria-hidden />{formatTime(b.start_time)} – {formatTime(b.end_time)}</li>
        <li className="flex items-center gap-2"><MapPin className="size-4 text-muted" aria-hidden />{b.customer_locality}{b.customer_address && detailed ? ` · ${b.customer_address}` : ''}</li>
        {b.worker_phone && <li className="flex items-center gap-2"><Phone className="size-4 text-muted" aria-hidden /><a className="font-semibold underline" href={`tel:${b.worker_phone}`}>{b.worker_phone}</a></li>}
      </ul>
      {detailed && <p className="mt-3 rounded-lg bg-navy-50 p-3 text-sm whitespace-pre-line">{b.job_description}</p>}

      {b.status === 'pending' && <p className="mt-3 text-sm text-muted">{t('booking.pendingNote')}</p>}
      {b.status === 'accepted' && <Notice tone="ok">{t('booking.acceptedNote')}</Notice>}
      {b.status === 'declined' && b.status_reason && <p className="mt-3 text-sm text-bad">{b.status_reason}</p>}
      {b.review_rating && <div className="mt-3"><Stars value={b.review_rating} size="sm" /> <span className="text-xs text-muted">{t('booking.yourReview')}</span></div>}

      <div className="mt-4 flex flex-wrap gap-2">
        {!detailed && <Link to={`/customer/bookings/${b.id}`} className={buttonClass('outline', 'sm')}>{t('booking.details')}</Link>}
        {canReview && <Button size="sm" variant="accent" onClick={() => setReviewing(true)}><Star className="size-4" aria-hidden />{t('booking.leaveReview')}</Button>}
        {canCancel && <Button size="sm" variant="outline" onClick={() => setCancelling(true)}>{t('booking.cancel')}</Button>}
        {b.status === 'declined' && <Link to={`/workers`} className={buttonClass('outline', 'sm')}>{t('booking.findAnother')}</Link>}
      </div>

      <ConfirmDialog open={cancelling} danger title={t('booking.cancel.title')} message={t('booking.cancel.message')}
        confirmLabel={t('booking.cancel.confirm')} onCancel={() => setCancelling(false)} onConfirm={() => cancel.mutateAsync()} />
      {reviewing && <ReviewDialog visitId={b.id} workerName={b.worker_name} onClose={() => setReviewing(false)} />}
    </Card>
  )
}

// ------------------------------------------------------------------ worker
export function WorkerVisitCard({ v }: { v: WorkerVisit }) {
  const t = useT()
  const { locale } = useI18n()
  const qc = useQueryClient()
  const toast = useToast()
  const [confirm, setConfirm] = useState<null | 'decline' | 'cancel' | 'complete'>(null)
  const today = todayISO()
  const canComplete = v.status === 'accepted' && v.requested_date <= today

  const respond = useMutation({
    mutationFn: (accept: boolean) => api.respondVisit(v.id, accept),
    onSuccess: async (r) => {
      if (r === 'accepted') toast.success(t('visit.accepted'))
      else if (r === 'auto_declined') toast.info(t('visit.autoDeclined'))
      else toast.success(t('visit.declined'))
      setConfirm(null)
      await refreshAll(qc)
    },
    onError: async (e) => { toast.error(friendlyError(e, t)); setConfirm(null); await refreshAll(qc) },
  })
  const cancel = useMutation({
    mutationFn: () => api.cancelVisit(v.id),
    onSuccess: async () => { toast.success(t('booking.cancelled')); setConfirm(null); await refreshAll(qc) },
    onError: (e) => { toast.error(friendlyError(e, t)); setConfirm(null) },
  })
  const complete = useMutation({
    mutationFn: () => api.completeVisit(v.id),
    onSuccess: async () => { toast.success(t('visit.completed')); setConfirm(null); await refreshAll(qc) },
    onError: (e) => { toast.error(friendlyError(e, t)); setConfirm(null) },
  })

  return (
    <Card as="article" className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">{v.customer_name}</h3>
          <p className="text-sm text-muted">{v.category_name}</p>
        </div>
        <div className="flex items-center gap-2">{v.is_demo && <DemoBadge />}<StatusBadge status={v.status} /></div>
      </div>

      <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
        <li className="flex items-center gap-2"><CalendarDays className="size-4 text-muted" aria-hidden />{formatDate(v.requested_date, locale)}</li>
        <li className="flex items-center gap-2"><Clock className="size-4 text-muted" aria-hidden />{formatTime(v.start_time)} – {formatTime(v.end_time)}</li>
        <li className="flex items-center gap-2"><MapPin className="size-4 text-muted" aria-hidden />{v.customer_address ? `${v.customer_address}, ${v.customer_locality}` : v.customer_locality}</li>
        {v.customer_phone && <li className="flex items-center gap-2"><Phone className="size-4 text-muted" aria-hidden /><a className="font-semibold underline" href={`tel:${v.customer_phone}`}>{v.customer_phone}</a></li>}
      </ul>
      <p className="mt-3 rounded-lg bg-navy-50 p-3 text-sm whitespace-pre-line">{v.job_description}</p>
      {v.status === 'pending' && <p className="mt-2 text-xs text-muted">{t('visit.addressHidden')}</p>}
      {v.status === 'declined' && v.status_reason && <p className="mt-2 text-sm text-bad">{v.status_reason}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {v.status === 'pending' && (
          <>
            <Button variant="primary" loading={respond.isPending && respond.variables === true} onClick={() => respond.mutate(true)}>{t('visit.accept')}</Button>
            <Button variant="outline" onClick={() => setConfirm('decline')}>{t('visit.decline')}</Button>
          </>
        )}
        {v.status === 'accepted' && (
          <>
            {canComplete && <Button variant="primary" onClick={() => setConfirm('complete')}>{t('visit.markCompleted')}</Button>}
            {v.requested_date >= today && <Button variant="outline" onClick={() => setConfirm('cancel')}>{t('booking.cancel')}</Button>}
          </>
        )}
      </div>

      <ConfirmDialog open={confirm === 'decline'} danger title={t('visit.decline.title')} message={t('visit.decline.message')} confirmLabel={t('visit.decline')}
        onCancel={() => setConfirm(null)} onConfirm={() => respond.mutateAsync(false)} />
      <ConfirmDialog open={confirm === 'cancel'} danger title={t('booking.cancel.title')} message={t('visit.cancel.message')} confirmLabel={t('booking.cancel.confirm')}
        onCancel={() => setConfirm(null)} onConfirm={() => cancel.mutateAsync()} />
      <ConfirmDialog open={confirm === 'complete'} title={t('visit.complete.title')} message={t('visit.complete.message')} confirmLabel={t('visit.markCompleted')}
        onCancel={() => setConfirm(null)} onConfirm={() => complete.mutateAsync()} />
    </Card>
  )
}

export { errorCode, errorDetail }
