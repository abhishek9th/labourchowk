import { lazy, Suspense } from 'react'
import { LoadingScreen } from '@/components/LoadingScreen'
import { Route, Routes } from 'react-router-dom'
import { DashboardLayout, PublicLayout } from '@/components/Layout'
import { GuestOnly, RequireRole } from '@/auth/guards'
import { isSupabaseConfigured } from '@/lib/supabase'
import Home from '@/pages/public/Home'
import { HowItWorks, Legal, NotFound, Services, SetupRequired } from '@/pages/public/Static'
import { Login, Register } from '@/pages/public/Auth'
import Workers from '@/pages/public/Workers'
import Saved from '@/pages/public/Saved'
import WorkerProfile from '@/pages/public/WorkerProfile'
import Passport from '@/pages/public/Passport'
import Notifications from '@/pages/shared/Notifications'

// dashboards are code-split so the public pages stay light on low-end phones
const L = (loader: () => Promise<Record<string, unknown>>, name: string) =>
  lazy(() => loader().then((m) => ({ default: m[name] as React.ComponentType })))
const customer = () => import('@/pages/customer/Customer')
const worker = () => import('@/pages/worker/Worker')
const admin = () => import('@/pages/admin/Admin')

const CustomerDashboard = L(customer, 'CustomerDashboard')
const CustomerBookings = L(customer, 'CustomerBookings')
const CustomerBookingDetail = L(customer, 'CustomerBookingDetail')
const CustomerProfile = L(customer, 'CustomerProfile')
const WorkerDashboard = L(worker, 'WorkerDashboard')
const WorkerRequests = L(worker, 'WorkerRequests')
const WorkerBookings = L(worker, 'WorkerBookings')
const WorkerReviews = L(worker, 'WorkerReviews')
const WorkerProfileEdit = L(worker, 'WorkerProfileEdit')
const WorkerAvailability = L(worker, 'WorkerAvailability')
const WorkerPortfolio = lazy(() => import('@/pages/worker/Portfolio'))
const WorkerPassport = lazy(() => import('@/pages/worker/Passport'))
const AdminHome = L(admin, 'AdminHome')
const AdminCategories = L(admin, 'AdminCategories')
const AdminWorkers = L(admin, 'AdminWorkers')

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="*" element={<SetupRequired />} />
        </Route>
      </Routes>
    )
  }
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="services" element={<Services />} />
          <Route path="workers" element={<Workers />} />
          <Route path="saved" element={<Saved />} />
          <Route path="workers/:id" element={<WorkerProfile />} />
          <Route path="p/:publicId" element={<Passport />} />
          <Route path="how-it-works" element={<HowItWorks />} />
          <Route path="privacy" element={<Legal kind="privacy" />} />
          <Route path="terms" element={<Legal kind="terms" />} />
          <Route path="login" element={<GuestOnly><Login /></GuestOnly>} />
          <Route path="register" element={<GuestOnly><Register /></GuestOnly>} />
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="customer" element={<RequireRole role="customer"><DashboardLayout kind="customer" /></RequireRole>}>
          <Route index element={<CustomerDashboard />} />
          <Route path="dashboard" element={<CustomerDashboard />} />
          <Route path="bookings" element={<CustomerBookings />} />
          <Route path="bookings/:id" element={<CustomerBookingDetail />} />
          <Route path="saved" element={<Saved />} />
          <Route path="profile" element={<CustomerProfile />} />
          <Route path="notifications" element={<Notifications />} />
        </Route>

        <Route path="worker" element={<RequireRole role="worker"><DashboardLayout kind="worker" /></RequireRole>}>
          <Route index element={<WorkerDashboard />} />
          <Route path="dashboard" element={<WorkerDashboard />} />
          <Route path="profile" element={<WorkerProfileEdit />} />
          <Route path="availability" element={<WorkerAvailability />} />
          <Route path="portfolio" element={<WorkerPortfolio />} />
          <Route path="passport" element={<WorkerPassport />} />
          <Route path="requests" element={<WorkerRequests />} />
          <Route path="bookings" element={<WorkerBookings />} />
          <Route path="reviews" element={<WorkerReviews />} />
          <Route path="notifications" element={<Notifications />} />
        </Route>

        <Route path="admin" element={<RequireRole role="admin"><DashboardLayout kind="admin" /></RequireRole>}>
          <Route index element={<AdminHome />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="workers" element={<AdminWorkers />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
