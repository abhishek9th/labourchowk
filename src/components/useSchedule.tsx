import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '@/i18n'
import { useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/ui'
import { ScheduleVisitDialog } from '@/components/ScheduleVisitDialog'

/**
 * "Schedule a visit" entry point shared by cards and profile pages.
 * Anonymous users are sent to log in first (and come back to the same worker afterwards);
 * worker accounts are told that only customers can book.
 */
export function useSchedule() {
  const { session, profile } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const t = useT()
  const [workerId, setWorkerId] = useState<string | null>(null)

  const open = useCallback((id: string) => {
    if (!session) {
      nav(`/login?next=${encodeURIComponent(`/workers/${id}?schedule=1`)}`)
      return
    }
    if (!profile) return
    if (profile.role !== 'customer') {
      toast.info(t('schedule.customersOnly'))
      return
    }
    if (profile.id === id) return
    setWorkerId(id)
  }, [session, profile, nav, toast, t])

  const dialog = workerId ? <ScheduleVisitDialog workerId={workerId} onClose={() => setWorkerId(null)} /> : null
  return { open, dialog }
}
