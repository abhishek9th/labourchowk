import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { CalendarCheck, ClipboardList, Search } from 'lucide-react'
import { useT, useI18n } from '@/i18n'
import { useAuth } from '@/auth/AuthProvider'
import { api } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { todayISO } from '@/lib/dates'
import { customerProfileSchema, type CustomerProfileForm } from '@/lib/schemas'
import type { BookingStatus } from '@/lib/types'
import { Button, buttonClass, Card, CardListSkeleton, Chip, EmptyState, ErrorState, Field, Input, PageHeading, Select, Skeleton, useToast } from '@/components/ui'
import { CustomerBookingCard, useCustomerBookings } from '@/components/Bookings'
import { PhotoPicker, useFieldError } from '@/components/forms'
import { useUnreadCount, Section } from '@/components/Layout'

export function CustomerDashboard() {
  const t = useT()
  const { profile } = useAuth()
  const q = useCustomerBookings()
  const unread = useUnreadCount()
  const today = todayISO()
  const upcoming = q.data?.filter((b) => b.status === 'accepted' && b.requested_date >= today).reverse() ?? []
  const pending = q.data?.filter((b) => b.status === 'pending').length ?? 0

  return (
    <>
      <PageHeading title={t('customer.hello', { name: profile?.full_name.split(' ')[0] ?? '' })} subtitle={t('customer.subtitle')}
        actions={<Link to="/workers" className={buttonClass('accent')}><Search className="size-4" aria-hidden />{t('nav.findWorkers')}</Link>} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={t('customer.stat.pending')} value={q.isLoading ? null : pending} />
        <Stat label={t('customer.stat.upcoming')} value={q.isLoading ? null : upcoming.length} />
        <Stat label={t('customer.stat.unread')} value={unread.isLoading ? null : unread.data ?? 0} />
      </div>

      <Section title={t('customer.upcoming')}>
        {q.isLoading ? <CardListSkeleton count={2} /> : q.isError ? <ErrorState message={friendlyError(q.error, t)} onRetry={() => q.refetch()} />
          : upcoming.length === 0 ? <EmptyState icon={CalendarCheck} title={t('customer.upcoming.empty')} text={t('customer.upcoming.emptyText')} action={<Link to="/workers" className={buttonClass('primary')}>{t('nav.findWorkers')}</Link>} />
          : <div className="grid gap-4">{upcoming.map((b) => <CustomerBookingCard key={b.id} b={b} />)}</div>}
      </Section>
    </>
  )
}

export function Stat({ label, value, hint }: { label: string; value: string | number | null; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold text-muted">{label}</p>
      {value === null ? <Skeleton className="mt-2 h-8 w-16" /> : <p className="text-3xl font-extrabold text-navy-900">{value}</p>}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  )
}

const FILTERS: ('all' | BookingStatus)[] = ['all', 'pending', 'accepted', 'completed', 'declined', 'cancelled']

export function CustomerBookings() {
  const t = useT()
  const q = useCustomerBookings()
  const [filter, setFilter] = useState<'all' | BookingStatus>('all')
  const list = q.data?.filter((b) => filter === 'all' || b.status === filter) ?? []
  return (
    <>
      <PageHeading title={t('nav.bookings')} subtitle={t('customer.bookings.subtitle')} />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t('filters.title')}>
        {FILTERS.map((f) => <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? t('common.all') : t(`status.${f}`)}</Chip>)}
      </div>
      {q.isLoading ? <CardListSkeleton /> : q.isError ? <ErrorState message={friendlyError(q.error, t)} onRetry={() => q.refetch()} />
        : list.length === 0 ? <EmptyState icon={ClipboardList} title={t('customer.bookings.empty')} text={t('customer.bookings.emptyText')} action={<Link to="/workers" className={buttonClass('primary')}>{t('nav.findWorkers')}</Link>} />
        : <div className="grid gap-4">{list.map((b) => <CustomerBookingCard key={b.id} b={b} />)}</div>}
    </>
  )
}

export function CustomerBookingDetail() {
  const { id = '' } = useParams()
  const t = useT()
  const q = useCustomerBookings()
  const b = q.data?.find((x) => x.id === id)
  return (
    <>
      <Link to="/customer/bookings" className="mb-3 inline-block text-sm font-semibold text-navy-700 hover:underline">← {t('nav.bookings')}</Link>
      <PageHeading title={t('booking.detail.title')} />
      {q.isLoading ? <CardListSkeleton count={1} /> : q.isError ? <ErrorState message={friendlyError(q.error, t)} onRetry={() => q.refetch()} />
        : !b ? <EmptyState title={t('booking.notFound')} action={<Link to="/customer/bookings" className={buttonClass('primary')}>{t('nav.bookings')}</Link>} />
        : <CustomerBookingCard b={b} detailed />}
    </>
  )
}

export function CustomerProfile() {
  const t = useT()
  const { lang, setLang } = useI18n()
  const { profile, refreshProfile } = useAuth()
  const toast = useToast()
  const fieldError = useFieldError()
  const [photo, setPhoto] = useState<File | null>(null)
  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<CustomerProfileForm>({
    resolver: zodResolver(customerProfileSchema),
    values: profile ? { full_name: profile.full_name, phone: profile.phone ?? '', default_locality: profile.default_locality ?? '', preferred_language: (profile.preferred_language as 'en' | 'hi') ?? lang } : undefined,
  })
  const save = useMutation({
    mutationFn: async (v: CustomerProfileForm) => {
      let avatar_url = profile!.avatar_url
      if (photo) avatar_url = await api.uploadAvatar(profile!.id, photo)
      await api.updateProfile(profile!.id, { full_name: v.full_name, phone: v.phone || null, default_locality: v.default_locality || null, preferred_language: v.preferred_language, avatar_url })
      setLang(v.preferred_language)
    },
    onSuccess: async () => { setPhoto(null); await refreshProfile(); toast.success(t('profile.saved')) },
    onError: (e) => toast.error(friendlyError(e, t)),
  })
  if (!profile) return <CardListSkeleton count={1} />
  return (
    <>
      <PageHeading title={t('nav.profile')} />
      <Card className="max-w-xl p-5">
        <form className="space-y-4" noValidate onSubmit={handleSubmit((v) => save.mutate(v))}>
          <PhotoPicker name={profile.full_name} currentUrl={profile.avatar_url} file={photo} onFile={setPhoto} onError={(m) => toast.error(m)} />
          <Field label={t('auth.fullName')} htmlFor="p-name" required error={fieldError(errors.full_name)}><Input id="p-name" {...register('full_name')} /></Field>
          <Field label={t('auth.email')} htmlFor="p-email" hint={t('profile.emailLocked')}><Input id="p-email" value={profile.email ?? ''} disabled readOnly /></Field>
          <Field label={t('auth.phone')} htmlFor="p-phone" hint={t('auth.phone.customerHint')} error={fieldError(errors.phone)}><Input id="p-phone" type="tel" inputMode="tel" {...register('phone')} /></Field>
          <Field label={t('auth.defaultLocality')} htmlFor="p-loc"><Input id="p-loc" {...register('default_locality')} /></Field>
          <Field label={t('auth.preferredLanguage')} htmlFor="p-lang"><Select id="p-lang" {...register('preferred_language')}><option value="en">English</option><option value="hi">हिन्दी</option></Select></Field>
          <Button type="submit" loading={save.isPending} disabled={!isDirty && !photo}>{t('common.save')}</Button>
        </form>
      </Card>
    </>
  )
}
