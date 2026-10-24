function messageOf(e: unknown): string {
  return typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : ''
}

/** Extracts the machine code (e.g. ERR_DATE_BLOCKED) the database raised, if any. */
export function errorCode(e: unknown): string | null {
  const m = messageOf(e).match(/ERR_[A-Z_]+/)
  return m ? m[0] : null
}

/** Extra detail attached by the database (e.g. the conflicting date). */
export function errorDetail(e: unknown): string | null {
  const d = typeof e === 'object' && e !== null && 'details' in e ? (e as { details: unknown }).details : null
  return typeof d === 'string' && d ? d : null
}

export function isNetworkError(e: unknown): boolean {
  return /failed to fetch|network|load failed/i.test(messageOf(e))
}

/** Maps any thrown value to a translated, user-friendly message. */
export function friendlyError(e: unknown, t: (key: string) => string): string {
  const code = errorCode(e)
  if (code) {
    const key = `err.${code}`
    const text = t(key)
    if (text !== key) return text
  }
  if (isNetworkError(e)) return t('err.network')
  const msg = messageOf(e)
  if (/row-level security|permission denied/i.test(msg)) return t('err.ERR_FORBIDDEN')
  if (/invalid login credentials/i.test(msg)) return t('err.invalidLogin')
  if (/already registered|already been registered/i.test(msg)) return t('err.alreadyRegistered')
  if (/rate limit|too many/i.test(msg)) return t('err.ERR_RATE_LIMIT')
  return t('err.generic')
}
