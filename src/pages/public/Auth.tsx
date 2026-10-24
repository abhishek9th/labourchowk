import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, HardHat, LocateFixed, Search } from 'lucide-react'
import { useI18n, useT } from '@/i18n'
import { useAuth } from '@/auth/AuthProvider'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { LOCALITIES, requestBrowserLocation } from '@/lib/geo'
import { PRICING_UNITS } from '@/lib/types'
import { SUGGESTED_UNITS } from '@/lib/format'
import {
  customerRegisterSchema, loginSchema, workerRegisterSchema,
  type CustomerRegisterForm, type LoginForm, type WorkerRegisterForm,
} from '@/lib/schemas'
import { Button, buttonClass, Card, Container, Field, Input, Notice, Select, Textarea, cx, useCategoryName, useToast } from '@/components/ui'
import { LanguageChips, PhotoPicker, TagInput, useFieldError } from '@/components/forms'

export function Login() {
  const t = useT()
  const { signIn } = useAuth()
  const fieldError = useFieldError()
  const [error, setError] = useState<string | null>(null)
  const [params] = useSearchParams()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  return (
    <Container className="max-w-md py-10">
      <Card className="p-6">
        <h1 className="text-2xl font-extrabold text-navy-900">{t('auth.login.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('auth.login.subtitle')}</p>
        <form className="mt-5 space-y-4" noValidate onSubmit={handleSubmit(async (v) => {
          setError(null)
          try { await signIn(v.email, v.password) } catch (e) { setError(friendlyError(e, t)) }
        })}>
          <Field label={t('auth.email')} htmlFor="li-email" error={fieldError(errors.email)} required>
            <Input id="li-email" type="email" autoComplete="email" inputMode="email" invalid={!!errors.email} {...register('email')} />
          </Field>
          <Field label={t('auth.password')} htmlFor="li-pw" error={fieldError(errors.password)} required>
            <Input id="li-pw" type="password" autoComplete="current-password" invalid={!!errors.password} {...register('password')} />
          </Field>
          {error && <Notice tone="bad">{error}</Notice>}
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>{t('nav.login')}</Button>
        </form>
        <p className="mt-5 text-center text-sm">
          {t('auth.noAccount')}{' '}
          <Link className="font-bold text-navy-700 underline" to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`}>{t('nav.register')}</Link>
        </p>
      </Card>
    </Container>
  )
}

export function Register() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const role = params.get('role') === 'worker' ? 'worker' : 'customer'
  const [done, setDone] = useState<null | { confirm: boolean; role: 'worker' | 'customer' }>(null)

  if (done) {
    return (
      <Container className="max-w-md py-10">
        <Card className="space-y-3 p-6 text-center">
          <CheckCircle2 className="mx-auto size-12 text-ok" aria-hidden />
          <h1 className="text-2xl font-extrabold">{t('auth.register.done')}</h1>
          <p className="text-muted">{done.confirm ? t('auth.register.confirmEmail') : t('auth.register.welcome')}</p>
          {done.confirm && <Link to="/login" className={buttonClass('primary', 'lg', 'w-full')}>{t('nav.login')}</Link>}
        </Card>
      </Container>
    )
  }

  return (
    <Container className="max-w-2xl py-8">
      <h1 className="text-3xl font-extrabold text-navy-900">{t('auth.register.title')}</h1>
      <p className="mt-1 text-muted">{t('auth.register.subtitle')}</p>

      <div role="radiogroup" aria-label={t('auth.register.iam')} className="mt-5 grid grid-cols-2 gap-3">
        {([['customer', Search], ['worker', HardHat]] as const).map(([r, Icon]) => (
          <button key={r} type="button" role="radio" aria-checked={role === r}
            onClick={() => { const p = new URLSearchParams(params); p.set('role', r); setParams(p, { replace: true }) }}
            className={cx('flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-[6px] border-2 p-3 text-center transition-colors',
              role === r ? 'border-primary bg-primary text-on-primary' : 'border-line bg-card hover:border-navy-900/40')}>
            <Icon className="size-7" aria-hidden />
            <span className="font-bold">{t(`auth.role.${r}`)}</span>
            <span className={cx('text-xs', role === r ? 'text-on-primary/70' : 'text-muted')}>{t(`auth.role.${r}.hint`)}</span>
          </button>
        ))}
      </div>

      <Card className="mt-5 p-5 sm:p-6">
        {role === 'customer' ? <CustomerForm onDone={(c) => setDone({ confirm: c, role })} /> : <WorkerForm onDone={(c) => setDone({ confirm: c, role })} />}
      </Card>
      <p className="mt-5 text-center text-sm">{t('auth.haveAccount')} <Link to="/login" className="font-bold text-navy-700 underline">{t('nav.login')}</Link></p>
    </Container>
  )
}

function CustomerForm({ onDone }: { onDone: (needsConfirmation: boolean) => void }) {
  const t = useT()
  const { lang } = useI18n()
  const { signUp } = useAuth()
  const fieldError = useFieldError()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CustomerRegisterForm>({
    resolver: zodResolver(customerRegisterSchema),
    defaultValues: { preferred_language: lang, phone: '', default_locality: '' },
  })

  return (
    <form className="space-y-4" noValidate onSubmit={handleSubmit(async (v) => {
      setError(null)
      try {
        const r = await signUp({ email: v.email, password: v.password, meta: { role: 'customer', full_name: v.full_name, phone: v.phone || null, default_locality: v.default_locality || null, preferred_language: v.preferred_language } })
        if (r.needsConfirmation) onDone(true)
        else { const n = params.get('next'); if (n?.startsWith('/') && !n.startsWith('//')) nav(n, { replace: true }); else onDone(false) }
      } catch (e) { setError(friendlyError(e, t)) }
    })}>
      <Field label={t('auth.fullName')} htmlFor="c-name" required error={fieldError(errors.full_name)}>
        <Input id="c-name" autoComplete="name" invalid={!!errors.full_name} {...register('full_name')} />
      </Field>
      <Field label={t('auth.email')} htmlFor="c-email" required error={fieldError(errors.email)}>
        <Input id="c-email" type="email" autoComplete="email" inputMode="email" invalid={!!errors.email} {...register('email')} />
      </Field>
      <Field label={t('auth.phone')} htmlFor="c-phone" hint={t('auth.phone.customerHint')} error={fieldError(errors.phone)}>
        <Input id="c-phone" type="tel" autoComplete="tel" inputMode="tel" invalid={!!errors.phone} {...register('phone')} />
      </Field>
      <Field label={t('auth.password')} htmlFor="c-pw" required hint={t('auth.passwordHint')} error={fieldError(errors.password)}>
        <Input id="c-pw" type="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('auth.defaultLocality')} htmlFor="c-loc">
          <Input id="c-loc" list="locality-list" placeholder="Indiranagar, Bengaluru" {...register('default_locality')} />
        </Field>
        <Field label={t('auth.preferredLanguage')} htmlFor="c-lang">
          <Select id="c-lang" {...register('preferred_language')}><option value="en">English</option><option value="hi">हिन्दी</option></Select>
        </Field>
      </div>
      <LocalityList />
      {error && <Notice tone="bad">{error}</Notice>}
      <Button type="submit" size="lg" variant="accent" className="w-full" loading={isSubmitting}>{t('auth.register.create')}</Button>
    </form>
  )
}

function LocalityList() {
  return (
    <datalist id="locality-list">
      {LOCALITIES.map((l) => <option key={l.name + l.city} value={`${l.name}, ${l.city}`} />)}
    </datalist>
  )
}

function WorkerForm({ onDone }: { onDone: (needsConfirmation: boolean) => void }) {
  const t = useT()
  const { lang } = useI18n()
  const { signUp } = useAuth()
  const toast = useToast()
  const fieldError = useFieldError()
  const catName = useCategoryName()
  const nav = useNavigate()
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: 5 * 60_000 })
  const [photo, setPhoto] = useState<File | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number; source: 'preset' | 'gps' } | null>(null)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, control, watch, setValue, formState: { errors, isSubmitting } } = useForm<WorkerRegisterForm>({
    resolver: zodResolver(workerRegisterSchema),
    defaultValues: {
      full_name: '', email: '', phone: '', password: '', category_slug: '', skills: [], experience_years: 0, indicative_price: 0,
      pricing_unit: 'per_day', city: '', locality: '', service_radius_km: 10, languages: [], description: '',
      preferred_language: lang, apply_verification: false,
    },
  })
  const city = watch('city'), locality = watch('locality'), slug = watch('category_slug'), fullName = watch('full_name')

  // known locality typed in -> exact coordinates; otherwise keep GPS coordinates if the user took them
  useEffect(() => {
    const m = LOCALITIES.find((l) => l.city.toLowerCase() === city.trim().toLowerCase() && l.name.toLowerCase() === locality.trim().toLowerCase())
    setCoords((c) => (m ? { lat: m.lat, lng: m.lng, source: 'preset' } : c?.source === 'preset' ? null : c))
  }, [city, locality])

  // choose a sensible default pricing unit when the profession changes
  useEffect(() => {
    const u = SUGGESTED_UNITS[slug]?.[0]
    if (u) setValue('pricing_unit', u)
  }, [slug, setValue])

  async function useMyLocation() {
    setLocating(true)
    const r = await requestBrowserLocation()
    setLocating(false)
    if (r.ok && r.point.lat !== null && r.point.lng !== null) setCoords({ lat: r.point.lat, lng: r.point.lng, source: 'gps' })
    else toast.error(t(`location.problem.${r.ok ? 'unavailable' : r.reason}`))
  }

  const units = SUGGESTED_UNITS[slug]
  const orderedUnits = units ? [...units, ...PRICING_UNITS.filter((u) => !units.includes(u))] : PRICING_UNITS

  return (
    <form className="space-y-5" noValidate onSubmit={handleSubmit(async (v) => {
      setError(null)
      try {
        const r = await signUp({
          email: v.email, password: v.password,
          meta: {
            role: 'worker', full_name: v.full_name, phone: v.phone, category_slug: v.category_slug, skills: v.skills,
            experience_years: v.experience_years, indicative_price: v.indicative_price, pricing_unit: v.pricing_unit,
            city: v.city, locality: v.locality, latitude: coords?.lat ?? null, longitude: coords?.lng ?? null,
            service_radius_km: v.service_radius_km, languages: v.languages, description: v.description || null, preferred_language: v.preferred_language,
          },
        })
        if (!r.needsConfirmation) {
          // we hold a session: finish the optional steps that need one
          try {
            const { data } = await supabase.auth.getUser()
            if (data.user && photo) {
              const url = await api.uploadAvatar(data.user.id, photo)
              await api.updateProfile(data.user.id, { avatar_url: url })
            }
            if (v.apply_verification) await api.requestVerification()
          } catch { toast.info(t('auth.register.optionalFailed')) }
          nav('/worker/dashboard', { replace: true })
          return
        }
        onDone(true)
      } catch (e) { setError(friendlyError(e, t)) }
    })}>
      <fieldset className="space-y-4">
        <legend className="mb-1 text-lg font-bold">{t('auth.section.account')}</legend>
        <Field label={t('auth.fullName')} htmlFor="w-name" required error={fieldError(errors.full_name)}>
          <Input id="w-name" autoComplete="name" invalid={!!errors.full_name} {...register('full_name')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('auth.phone')} htmlFor="w-phone" required hint={t('auth.phone.workerHint')} error={fieldError(errors.phone)}>
            <Input id="w-phone" type="tel" inputMode="tel" autoComplete="tel" invalid={!!errors.phone} {...register('phone')} />
          </Field>
          <Field label={t('auth.email')} htmlFor="w-email" required error={fieldError(errors.email)}>
            <Input id="w-email" type="email" inputMode="email" autoComplete="email" invalid={!!errors.email} {...register('email')} />
          </Field>
        </div>
        <Field label={t('auth.password')} htmlFor="w-pw" required hint={t('auth.passwordHint')} error={fieldError(errors.password)}>
          <Input id="w-pw" type="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} />
        </Field>
        <PhotoPicker name={fullName} file={photo} onFile={setPhoto} onError={(m) => toast.error(m)} />
      </fieldset>

      <fieldset className="space-y-4 border-t border-line pt-5">
        <legend className="mb-1 text-lg font-bold">{t('auth.section.work')}</legend>
        <Field label={t('auth.profession')} htmlFor="w-cat" required error={fieldError(errors.category_slug)}>
          <Select id="w-cat" invalid={!!errors.category_slug} {...register('category_slug')}>
            <option value="">{t('common.choose')}</option>
            {categories.data?.map((c) => <option key={c.id} value={c.slug}>{catName(c)}</option>)}
          </Select>
        </Field>
        <Field label={t('auth.skills')} htmlFor="w-skills" hint={t('auth.skillsHint')}>
          <Controller control={control} name="skills" render={({ field }) => <TagInput id="w-skills" value={field.value} onChange={field.onChange} placeholder={t('auth.skillsPlaceholder')} />} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('auth.experience')} htmlFor="w-exp" required error={fieldError(errors.experience_years)}>
            <Input id="w-exp" type="number" inputMode="numeric" min={0} max={70} invalid={!!errors.experience_years} {...register('experience_years', { valueAsNumber: true })} />
          </Field>
          <Field label={t('auth.price')} htmlFor="w-price" error={fieldError(errors.indicative_price)}>
            <Input id="w-price" type="number" inputMode="numeric" min={0} invalid={!!errors.indicative_price} {...register('indicative_price', { valueAsNumber: true })} />
          </Field>
          <Field label={t('auth.priceUnit')} htmlFor="w-unit">
            <Select id="w-unit" {...register('pricing_unit')}>
              {orderedUnits.map((u) => <option key={u} value={u}>{t(`unit.${u}`)}</option>)}
            </Select>
          </Field>
        </div>
        <p className="-mt-2 text-xs text-muted">{t('price.disclaimer')}</p>
        <Field label={t('auth.languages')} required error={fieldError(errors.languages)}>
          <Controller control={control} name="languages" render={({ field }) => <LanguageChips value={field.value} onChange={field.onChange} />} />
        </Field>
        <Field label={t('auth.description')} htmlFor="w-desc" hint={t('auth.descriptionHint')} error={fieldError(errors.description)}>
          <Textarea id="w-desc" rows={3} maxLength={1000} {...register('description')} />
        </Field>
      </fieldset>

      <fieldset className="space-y-4 border-t border-line pt-5">
        <legend className="mb-1 text-lg font-bold">{t('auth.section.area')}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('auth.city')} htmlFor="w-city" required error={fieldError(errors.city)}>
            <Input id="w-city" list="city-list" autoComplete="address-level2" invalid={!!errors.city} {...register('city')} />
            <datalist id="city-list">{[...new Set(LOCALITIES.map((l) => l.city))].map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label={t('auth.locality')} htmlFor="w-loc" required error={fieldError(errors.locality)}>
            <Input id="w-loc" list="loc-list" invalid={!!errors.locality} {...register('locality')} />
            <datalist id="loc-list">{LOCALITIES.filter((l) => !city || l.city.toLowerCase() === city.trim().toLowerCase()).map((l) => <option key={l.name} value={l.name} />)}</datalist>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={useMyLocation} loading={locating}><LocateFixed className="size-4" aria-hidden />{t('auth.useMyLocation')}</Button>
          {coords
            ? <span className="text-sm font-medium text-ok">✓ {coords.source === 'gps' ? t('auth.coords.gps') : t('auth.coords.preset')}</span>
            : <span className="text-sm text-muted">{t('auth.coords.none')}</span>}
        </div>
        <Field label={t('auth.radius')} htmlFor="w-radius" hint={t('auth.radiusHint')} error={fieldError(errors.service_radius_km)}>
          <Input id="w-radius" type="number" inputMode="numeric" min={1} max={100} className="max-w-40" {...register('service_radius_km', { valueAsNumber: true })} />
        </Field>
        <Notice>{t('auth.privacyNote')}</Notice>
      </fieldset>

      <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
        <input type="checkbox" className="mt-1 size-5 accent-navy-900" {...register('apply_verification')} />
        <span><strong>{t('auth.verify.title')}</strong><br /><span className="text-muted">{t('auth.verify.text')}</span></span>
      </label>

      <Field label={t('auth.preferredLanguage')} htmlFor="w-lang">
        <Select id="w-lang" className="max-w-48" {...register('preferred_language')}><option value="en">English</option><option value="hi">हिन्दी</option></Select>
      </Field>

      {error && <Notice tone="bad">{error}</Notice>}
      <Button type="submit" size="lg" variant="accent" className="w-full" loading={isSubmitting}>{t('auth.register.createWorker')}</Button>
    </form>
  )
}
