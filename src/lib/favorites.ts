import { useSyncExternalStore } from 'react'

// "Saved workers": kept in this browser only (no account data, no server table).
const KEY = 'lc.favorites'
let ids = new Set<string>()
let snapshot = ''
const listeners = new Set<() => void>()
const emit = () => { snapshot = [...ids].join(','); listeners.forEach((l) => l()) }

try {
  const v = localStorage.getItem(KEY)
  if (v) { ids = new Set(JSON.parse(v) as string[]); snapshot = [...ids].join(',') }
} catch { /* storage blocked: favourites just won't persist */ }

export function toggleFavorite(id: string) {
  if (ids.has(id)) ids.delete(id); else ids.add(id)
  emit()
  try { localStorage.setItem(KEY, JSON.stringify([...ids])) } catch { /* ignore */ }
}

export function useFavorites(): { has: (id: string) => boolean; count: number } {
  useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => snapshot)
  return { has: (id) => ids.has(id), count: ids.size }
}
