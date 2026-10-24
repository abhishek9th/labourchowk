import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useT } from '@/i18n'
import { api } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { reviewSchema } from '@/lib/schemas'
import { Button, Field, Modal, StarInput, Textarea, useToast } from '@/components/ui'

export function ReviewDialog({ visitId, workerName, onClose }: { visitId: string; workerName: string; onClose: () => void }) {
  const t = useT()
  const toast = useToast()
  const qc = useQueryClient()
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | undefined>()

  const m = useMutation({
    mutationFn: () => api.submitReview(visitId, rating, text.trim()),
    onSuccess: async () => {
      toast.success(t('review.thanks'))
      await Promise.all([qc.invalidateQueries({ queryKey: ['customerBookings'] }), qc.invalidateQueries({ queryKey: ['reviews'] }), qc.invalidateQueries({ queryKey: ['worker'] })])
      onClose()
    },
    onError: (e) => toast.error(friendlyError(e, t)),
  })

  function submit() {
    const parsed = reviewSchema.safeParse({ rating, text })
    if (!parsed.success) { setErr(t(parsed.error.issues[0].message)); return }
    setErr(undefined)
    m.mutate()
  }

  return (
    <Modal open onClose={onClose} title={t('review.title', { name: workerName })}
      footer={<><Button variant="outline" onClick={onClose} disabled={m.isPending}>{t('common.cancel')}</Button><Button variant="accent" loading={m.isPending} onClick={submit}>{t('review.submit')}</Button></>}>
      <div className="space-y-4">
        <Field label={t('review.rating')} required error={err}>
          <StarInput value={rating} onChange={setRating} label={t('review.rating')} />
        </Field>
        <Field label={t('review.text')} htmlFor="rv-text" hint={t('review.textHint')}>
          <Textarea id="rv-text" rows={4} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <p className="text-xs text-muted">{t('review.rules')}</p>
      </div>
    </Modal>
  )
}
