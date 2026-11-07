import type { Meter } from '../types'
import { bandOf } from './alert'
import type { Band } from './alert'

export type Level = 'normal' | 'warning' | 'error'

export const percentOf = (meter: Meter): number | null => {
  if (meter.percent !== null) {
    return meter.percent
  }
  if (meter.tokens === null || meter.window <= 0) {
    return null
  }

  return Math.round((meter.tokens / meter.window) * 100)
}

export const levelOf = (percent: number | null): Level => {
  if (percent === null) {
    return 'normal'
  }

  const band = bandOf(percent)
  if (band === 'critical') {
    return 'error'
  }
  if (band === 'warn') {
    return 'warning'
  }

  return 'normal'
}

export const formatTokens = (n: number): string => {
  if (n >= 1_000_000) {
    const millions = n / 1_000_000

    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`
  }
  if (n < 1000) {
    return `${n}`
  }

  return `${Math.round(n / 1000)}k`
}

// The bar, a line: heavy cells, a heavy half cell to the nearest half, then
// the light track. The track's cells past WARN and CRITICAL are tinted ahead
// of time, so the fill is seen closing in on them.
export const FULL = '━'
export const HALF = '╸'
export const EMPTY = '─'

export type Zone = 'fill' | Band

export type Segment = { text: string; zone: Zone }

export const BAR_MIN = 10
export const BAR_MAX = 40

// The label, the percentage and the token count take about 30 columns; the
// rest of the row, up to BAR_MAX, is the bar's.
export const barWidthOf = (columns: number): number =>
  Math.max(BAR_MIN, Math.min(BAR_MAX, columns - 30))

export const barOf = (percent: number | null, width: number): Segment[] => {
  const clamped = Math.min(100, Math.max(0, percent ?? 0))
  const halves = Math.round((clamped / 100) * width * 2)
  const whole = Math.floor(halves / 2)
  const part = halves % 2 === 1 ? HALF : ''
  const segments: Segment[] = []
  const push = (text: string, zone: Zone) => {
    const last = segments[segments.length - 1]
    if (last !== undefined && last.zone === zone) {
      segments[segments.length - 1] = { text: last.text + text, zone }
    } else {
      segments.push({ text, zone })
    }
  }

  if (whole > 0) {
    push(FULL.repeat(whole), 'fill')
  }
  if (part !== '') {
    push(part, 'fill')
  }
  // Each empty cell takes the band its middle falls in.
  for (let cell = whole + (part === '' ? 0 : 1); cell < width; cell++) {
    push(EMPTY, bandOf(((cell + 0.5) / width) * 100))
  }

  return segments
}

export const LABEL = 'Context '

export type Line = { bar: Segment[]; percent: string; tokens: string }

export const lineOf = (meter: Meter, width: number): Line => {
  const window = formatTokens(meter.window)
  const percent = percentOf(meter)

  if (meter.tokens === null || percent === null) {
    return { bar: barOf(null, width), percent: ' —', tokens: `  — / ${window}` }
  }

  return {
    bar: barOf(percent, width),
    percent: ` ${percent}%`,
    tokens: `  ${formatTokens(meter.tokens)} / ${window}`,
  }
}

// The line as plain text, every cell of the bar in it.
export const formatMeter = (meter: Meter, width: number): string => {
  const line = lineOf(meter, width)

  return `${LABEL}${line.bar.map(segment => segment.text).join('')}${line.percent}${line.tokens}`
}
