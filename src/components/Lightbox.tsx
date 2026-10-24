import { useEffect, useRef, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useT } from '@/i18n'

export interface LightboxImage { url: string; alt: string }

/** Full-screen photo viewer: next/previous buttons, arrow keys, swipe, Esc to close (native <dialog>). */
export function Lightbox({ images, index, onIndex, onClose, caption }: {
  images: LightboxImage[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
  caption?: ReactNode
}) {
  const t = useT()
  const ref = useRef<HTMLDialogElement>(null)
  const touchX = useRef<number | null>(null)
  const count = images.length
  const go = (d: number) => count > 1 && onIndex((index + d + count) % count)

  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])

  const img = images[index]
  if (!img) return null

  return (
    <dialog
      ref={ref}
      aria-label={img.alt}
      onClose={onClose}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
        if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
      }}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        touchX.current = null
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
      }}
      className="m-0 h-dvh w-screen max-w-none bg-black/95 text-white"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold" aria-live="polite">{t('lightbox.counter', { n: index + 1, total: count })}</span>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="grid size-11 cursor-pointer place-items-center rounded-full bg-white/10 hover:bg-white/20">
            <X className="size-6" aria-hidden />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
          <img key={img.url} src={img.url} alt={img.alt} className="max-h-full max-w-full object-contain" />
          {count > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} aria-label={t('lightbox.prev')} className="absolute left-2 grid size-12 cursor-pointer place-items-center rounded-full bg-black/60 hover:bg-black/80 sm:left-4">
                <ChevronLeft className="size-7" aria-hidden />
              </button>
              <button type="button" onClick={() => go(1)} aria-label={t('lightbox.next')} className="absolute right-2 grid size-12 cursor-pointer place-items-center rounded-full bg-black/60 hover:bg-black/80 sm:right-4">
                <ChevronRight className="size-7" aria-hidden />
              </button>
            </>
          )}
        </div>

        {count > 1 && (
          <ul className="flex justify-center gap-1.5 overflow-x-auto px-4 py-2" aria-hidden>
            {images.map((im, i) => (
              <li key={im.url}>
                <button type="button" tabIndex={-1} onClick={() => onIndex(i)} className={`block size-12 cursor-pointer overflow-hidden rounded-md border-2 ${i === index ? 'border-amber-400' : 'border-transparent opacity-60'}`}>
                  <img src={im.url} alt="" className="size-full object-cover" loading="lazy" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {caption && <div className="max-h-[32dvh] overflow-y-auto bg-black px-4 py-3 text-sm sm:px-8">{caption}</div>}
      </div>
    </dialog>
  )
}
