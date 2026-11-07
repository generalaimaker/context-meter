import type { Alerted } from '../types'

// Where the band turns yellow and red, and where a toast says to hand the
// session over with /handoff before the engine compacts it. On 2.1.296 the
// engine auto-compacts at 967,000 of a 1,000,000-token window (96.7%; 33k
// "Autocompact buffer" in /context), so CRITICAL sits at least 3 points under
// it rather than at 95.
export const WARN_PERCENT = 85
export const CRITICAL_PERCENT = 93

export type Band = 'none' | 'warn' | 'critical'

const RANK: Record<Band, number> = { none: 0, warn: 1, critical: 2 }

export const bandOf = (percent: number): Band => {
  if (percent >= CRITICAL_PERCENT) {
    return 'critical'
  }
  if (percent >= WARN_PERCENT) {
    return 'warn'
  }

  return 'none'
}

export const toastOf = (alert: 'warn' | 'critical'): string =>
  alert === 'critical'
    ? `컨텍스트 ${CRITICAL_PERCENT}% — 지금 /handoff 하세요`
    : `컨텍스트 ${WARN_PERCENT}% — /handoff 후 새 세션 권장`

// A threshold speaks once, on the way up past it; dropping below it re-arms it.
// A jump past both speaks for the higher alone. No reading changes nothing.
export const stepOf = (
  alerted: Alerted,
  percent: number | null,
): { alerted: Alerted; toast: 'warn' | 'critical' | null } => {
  if (percent === null) {
    return { alerted, toast: null }
  }

  const band = bandOf(percent)
  const now = band === 'none' ? null : band

  return { alerted: now, toast: RANK[band] > RANK[alerted ?? 'none'] ? now : null }
}
