import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, CalendarCheck, CalendarClock, CheckCheck, ShieldCheck, Star, XCircle, type LucideIcon } from 'lucide-react'
import { useT } from '@/i18n'
import { api } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { formatDateTime } from '@/lib/dates'
import type { NotificationType } from '@/lib/types'
import { Button, CardListSkeleton, Card, EmptyState, ErrorState, PageHeading, cx } from '@/components/ui'
import { useAuth } from '@/auth/AuthProvider'
import { useI18n } from '@/i18n'

const ICONS: Record<NotificationType, LucideIcon> = {
  visit_requested: CalendarClock, visit_accepted: CalendarCheck, visit_declined: XCircle, visit_cancelled: XCircle,
  visit_reminder: Bell, visit_completed: CheckCheck, review_received: Star, verification: ShieldCheck, system: Bell,
}

export default function Notifications() {
  const t = useT()
  const { locale } = useI18n()
  const { profile } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['notifications'], queryFn: api.notifications })
  const mark = useMutation({
    mutationFn: (ids: string[] | 'all') => api.markRead(ids),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['notifications'] }), qc.invalidateQueries({ queryKey: ['unread'] })]),
  })
  const unread = q.data?.filter((n) => !n.is_read).length ?? 0
  const base = profile?.role === 'worker' ? '/worker/requests' : '/customer/bookings'

  return (
    <>
      <PageHeading title={t('nav.notifications')} subtitle={unread ? t('notif.unread', { n: unread }) : undefined}
        actions={unread > 0 ? <Button variant="outline" loading={mark.isPending} onClick={() => mark.mutate('all')}><CheckCheck className="size-4" aria-hidden />{t('notif.markAll')}</Button> : undefined} />
      {q.isLoading ? <CardListSkeleton count={4} />
        : q.isError ? <ErrorState message={friendlyError(q.error, t)} onRetry={() => q.refetch()} />
        : !q.data?.length ? <EmptyState icon={BellOff} title={t('notif.empty.title')} text={t('notif.empty.text')} />
        : (
          <ul className="space-y-2">
            {q.data.map((n) => {
              const Icon = ICONS[n.notification_type] ?? Bell
              return (
                <li key={n.id}>
                  <Card className={cx('flex w-full gap-3 p-4', !n.is_read && 'border-white/20 bg-elevated')}>
                    <span className={cx('grid size-10 shrink-0 place-items-center rounded-full', n.is_read ? 'bg-navy-50 text-navy-700' : 'bg-amber-500 text-navy-950')}><Icon className="size-5" aria-hidden /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <h3 className="font-bold">{n.title}{!n.is_read && <span className="sr-only"> ({t('notif.new')})</span>}</h3>
                        <time className="text-xs text-muted" dateTime={n.created_at}>{formatDateTime(n.created_at, locale)}</time>
                      </div>
                      <p className="text-sm">{n.message}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {n.related_visit_id && (
                          <Button size="sm" variant="outline" onClick={() => {
                            if (!n.is_read) mark.mutate([n.id])
                            nav(profile?.role === 'worker' ? base : `${base}/${n.related_visit_id}`)
                          }}>{t('notif.view')}</Button>
                        )}
                        {!n.is_read && <Button size="sm" variant="ghost" onClick={() => mark.mutate([n.id])}>{t('notif.markRead')}</Button>}
                      </div>
                    </div>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
    </>
  )
}
