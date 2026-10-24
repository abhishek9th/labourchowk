import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useT } from '@/i18n'
import { cx } from '@/components/ui'

type Mode = 'light' | 'dark'
const read = (): Mode => document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'

/** Light / dark switch. The choice is remembered in this browser; light is the default. */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useT()
  const [mode, setMode] = useState<Mode>(read)
  useEffect(() => {
    if (mode === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
    else document.documentElement.removeAttribute('data-theme')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#0f1210' : '#f5f3ed')
    try { localStorage.setItem('lc.theme', mode) } catch { /* private mode: just not remembered */ }
  }, [mode])
  const next: Mode = mode === 'dark' ? 'light' : 'dark'
  const label = next === 'dark' ? t('theme.toDark') : t('theme.toLight')
  return (
    <button type="button" onClick={() => setMode(next)} aria-label={label} title={label}
      className={cx('grid size-10 cursor-pointer place-items-center rounded-lg border border-line bg-card text-ink transition-colors hover:bg-surface', className)}>
      {mode === 'dark' ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
    </button>
  )
}
