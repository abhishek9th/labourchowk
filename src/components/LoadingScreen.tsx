import { Hourglass } from 'lucide-react'

/** Brand loading screen: the wordmark with a slowly flipping hourglass right below it. */
export function LoadingScreen() {
  return (
    <div role="status" aria-label="Loading" className="grid min-h-dvh place-items-center bg-paper">
      <div className="flex flex-col items-center">
        <p className="text-4xl font-extrabold tracking-tight text-navy-900 sm:text-5xl">Labour <span className="text-brand">Chowk</span></p>
        <Hourglass className="lc-flip mt-6 size-11 text-muted" aria-hidden />
      </div>
    </div>
  )
}
