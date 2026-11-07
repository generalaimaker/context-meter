import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionContextUsage } from 'claude-code'

import { CRITICAL_PERCENT, WARN_PERCENT, toastOf } from '../hooks/alert'
import { EMPTY, FULL, HALF, barOf, barWidthOf, formatMeter, formatTokens, levelOf } from '../hooks/format'
import type { Meter } from '../types'

const SURFACES = ['terminal', 'desktop'] as const

// BAND's 80 columns give the bar its full 40 cells.
const WIDTH = 40
const lineText = (meter: Meter) => formatMeter(meter, WIDTH)

type Finder = Pick<Awaited<ReturnType<Engine['ui']['mount']>>, 'findAll'>

// find matches text by inclusion, outermost first: this is the run whose own
// text is exactly `text`.
const run = async (ui: Finder, text: string) =>
  (await ui.findAll({ type: 'Text', text })).find(found => found.text === text)

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const measure = ($: Engine, tokens: number | undefined, percent: number | undefined) =>
  $.session.measure({
    context: { tokens, window: 200_000, percent },
    rateLimits: [],
    changed: ['context'],
  })

describe('format', () => {
  test('levels: from WARN is warning, from CRITICAL is error', () => {
    expect(levelOf(70)).toBe('normal')
    expect(levelOf(84)).toBe('normal')
    expect(levelOf(85)).toBe('warning')
    expect(levelOf(CRITICAL_PERCENT - 1)).toBe('warning')
    expect(levelOf(CRITICAL_PERCENT)).toBe('error')
    expect(levelOf(100)).toBe('error')
    expect(levelOf(null)).toBe('normal')
  })

  test('tokens read as k and M', () => {
    expect(formatTokens(84_123)).toBe('84k')
    expect(formatTokens(200_000)).toBe('200k')
    expect(formatTokens(1_000_000)).toBe('1M')
    expect(formatTokens(512)).toBe('512')
  })

  test('the bar takes the row left over, 10 to 40 cells', () => {
    expect(barWidthOf(80)).toBe(40)
    expect(barWidthOf(200)).toBe(40)
    expect(barWidthOf(50)).toBe(20)
    expect(barWidthOf(20)).toBe(10)
  })

  // 40 cells of 2.5 points: the track's cell 34 (middle 86.25) is the first
  // past WARN, cell 37 (middle 93.75) the first past CRITICAL.
  test('the bar: whole cells, a half, then the track tinted at WARN and CRITICAL', () => {
    expect(barOf(0, WIDTH)).toEqual([
      { text: EMPTY.repeat(34), zone: 'none' },
      { text: EMPTY.repeat(3), zone: 'warn' },
      { text: EMPTY.repeat(3), zone: 'critical' },
    ])
    expect(barOf(41, WIDTH)).toEqual([
      { text: `${FULL.repeat(16)}${HALF}`, zone: 'fill' },
      { text: EMPTY.repeat(17), zone: 'none' },
      { text: EMPTY.repeat(3), zone: 'warn' },
      { text: EMPTY.repeat(3), zone: 'critical' },
    ])
    expect(barOf(42, WIDTH)).toEqual([
      { text: FULL.repeat(17), zone: 'fill' },
      { text: EMPTY.repeat(17), zone: 'none' },
      { text: EMPTY.repeat(3), zone: 'warn' },
      { text: EMPTY.repeat(3), zone: 'critical' },
    ])
    expect(barOf(90, WIDTH)).toEqual([
      { text: FULL.repeat(36), zone: 'fill' },
      { text: EMPTY, zone: 'warn' },
      { text: EMPTY.repeat(3), zone: 'critical' },
    ])
    expect(barOf(100, WIDTH)).toEqual([{ text: FULL.repeat(40), zone: 'fill' }])
    expect(barOf(130, WIDTH)).toEqual([{ text: FULL.repeat(40), zone: 'fill' }])
    expect(barOf(null, WIDTH)).toEqual(barOf(0, WIDTH))
  })

  test('every width draws exactly its cells', () => {
    for (const width of [10, 17, 40]) {
      for (const percent of [0, 0.4, 12, 42, 85, 93, 99.9, 100]) {
        expect([...barOf(percent, width).map(s => s.text).join('')]).toHaveLength(width)
      }
    }
  })

  test('the line', () => {
    expect(formatMeter({ tokens: 84_000, window: 200_000, percent: 42 }, WIDTH)).toBe(
      `Context ${FULL.repeat(17)}${EMPTY.repeat(23)} 42%  84k / 200k`,
    )
    expect(formatMeter({ tokens: null, window: 200_000, percent: null }, WIDTH)).toBe(
      `Context ${EMPTY.repeat(40)} —  — / 200k`,
    )
  })
})

// The engine's own band beneath: nothing but a survey.
const engineBeneath = (on: On) =>
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'engine' as const, ref: 0 }))

test('the band shows the last measurement, coloured by fill', async ($, on) => {
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('ui.toast', () => ({ value: undefined }))
  engineBeneath(on)

  const cases = [
    { tokens: 84_000, percent: 42, color: undefined, fill: 'success' },
    { tokens: 150_000, percent: 75, color: undefined, fill: 'success' },
    { tokens: 176_000, percent: 88, color: 'warning', fill: 'warning' },
    { tokens: 190_000, percent: 95, color: 'error', fill: 'error' },
  ]

  for (const one of cases) {
    await measure($, one.tokens, one.percent)
    const meter = { tokens: one.tokens, window: 200_000, percent: one.percent }
    const fill = barOf(one.percent, WIDTH)[0]

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: 'context-meter', surface, ...BAND })
      expect((await ui.find({ key: 'meter' }))?.text).toBe(lineText(meter))
      const percent = await run(ui, ` ${one.percent}%`)
      expect(percent?.props.color).toBe(one.color)
      expect(percent?.props.weight).toBe('bold')
      expect(fill?.zone).toBe('fill')
      expect((await run(ui, fill?.text ?? ''))?.props.color).toBe(one.fill)
      await ui.unmount()
    }
  }
})

test('the track is dim, its WARN and CRITICAL stretches tinted', async ($, on) => {
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  engineBeneath(on)
  await measure($, 24_000, 12)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'context-meter', surface, ...BAND })
    const [, none, warn, critical] = barOf(12, WIDTH)
    expect((await run(ui, none?.text ?? ''))?.props.dimColor).toBe(true)
    // WARN and CRITICAL stretches are both three cells: tell them by color.
    const tinted = (await ui.findAll({ type: 'Text', text: warn?.text ?? '' }))
      .filter(found => found.text === warn?.text)
      .map(found => found.props.color)
    expect(critical?.text).toBe(warn?.text)
    expect(tinted.sort()).toEqual(['error', 'warning'])
    await ui.unmount()
  }
})

test('a window with no reading yet shows dashes', async ($, on) => {
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  engineBeneath(on)
  await measure($, undefined, undefined)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'context-meter', surface, ...BAND })
    expect((await ui.find({ key: 'meter' }))?.text).toBe(
      lineText({ tokens: null, window: 200_000, percent: null }),
    )
    await ui.unmount()
  }
})

test('the band yields to a survey', async ($, on) => {
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box key="survey">
        <Text>survey</Text>
      </Box>
    )
  })
  await measure($, 84_000, 42)

  const ui = await $.ui.mount({
    plugin: 'context-meter',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { ...BAND.props, hasSurvey: true },
  })
  expect(await ui.find({ key: 'meter' })).toBeUndefined()
  expect((await ui.find({ key: 'survey' }))?.text).toBe('survey')
  await ui.unmount()
})

// status-band's git line, drawn beneath this plugin.
const gitBeneath = (on: On) =>
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box key="git">
        <Text>dev · 29aa71840</Text>
      </Box>
    )
  })

const childKeys = (drawn: Awaited<ReturnType<Awaited<ReturnType<Engine['ui']['mount']>>['drawn']>>) =>
  drawn.type === 'Box'
    ? drawn.children?.map(child =>
        typeof child === 'string' ? child : child.type === 'Box' ? child.props?.key : child.type,
      )
    : []

test('a band drawn beneath (status-band) stays, under the meter', async ($, on) => {
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  gitBeneath(on)
  await measure($, 84_000, 42)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'context-meter', surface, ...BAND })
    expect((await ui.find({ key: 'meter' }))?.text).toBe(
      lineText({ tokens: 84_000, window: 200_000, percent: 42 }),
    )
    expect((await ui.find({ key: 'git' }))?.text).toBe('dev · 29aa71840')
    const drawn = await ui.drawn()
    expect(drawn).toMatchObject({ type: 'Box', props: { flexDirection: 'column' } })
    expect(childKeys(drawn)).toEqual(['meter', 'git'])
    await ui.unmount()
  }
})

// ── handoff alerts ────────────────────────────────────────────────────────

const WINDOW = 1_000_000
const WARN = toastOf('warn')
const CRITICAL = toastOf('critical')

const contextAt = (percent: number | undefined): SessionContextUsage => ({
  tokens: percent === undefined ? undefined : Math.round((percent / 100) * WINDOW),
  window: WINDOW,
  percent,
})

// The engine beneath: it echoes measurements, answers usage with `usage.now`,
// takes /clear and /resume, and records every toast raised.
const world = (on: On, beneath: (on: On) => unknown = engineBeneath) => {
  const toasts: string[] = []
  const usage: { now: SessionContextUsage } = { now: contextAt(undefined) }
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: { startedAt: 0, context: usage.now, rateLimits: [] } }))
  on('classic.SessionStart', () => ({}))
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  beneath(on)

  return { toasts, usage }
}

const fill = ($: Engine, ...percents: (number | undefined)[]) =>
  percents.reduce<Promise<unknown>>(
    (done, percent) =>
      done.then(() =>
        $.session.measure({ context: contextAt(percent), rateLimits: [], changed: ['context'] }),
      ),
    Promise.resolve(),
  )

test('the toasts say the thresholds in force', () => {
  expect(WARN).toBe(`컨텍스트 ${WARN_PERCENT}% — /handoff 후 새 세션 권장`)
  expect(CRITICAL).toBe(`컨텍스트 ${CRITICAL_PERCENT}% — 지금 /handoff 하세요`)
  expect(WARN_PERCENT).toBe(85)
  expect(CRITICAL_PERCENT).toBeLessThanOrEqual(96.7 - 3)
})

test('84 → 86: WARN once', async ($, on) => {
  const w = world(on)
  await fill($, 84)
  expect(w.toasts).toEqual([])
  await fill($, 86)
  expect(w.toasts).toEqual([WARN])
})

test('86 → 90 → 92: nothing more while past WARN', async ($, on) => {
  const w = world(on)
  await fill($, 86, 90, 92)
  expect(w.toasts).toEqual([WARN])
})

test('90 → 70 → 88: WARN again after dropping under it', async ($, on) => {
  const w = world(on)
  await fill($, 90, 70)
  expect(w.toasts).toEqual([WARN])
  await fill($, 88)
  expect(w.toasts).toEqual([WARN, WARN])
})

test('80 → 96: CRITICAL alone', async ($, on) => {
  const w = world(on)
  await fill($, 80, 96)
  expect(w.toasts).toEqual([CRITICAL])
  await fill($, 97, 99)
  expect(w.toasts).toEqual([CRITICAL])
})

test('85 → CRITICAL: each threshold speaks once on the way up', async ($, on) => {
  const w = world(on)
  await fill($, 85, CRITICAL_PERCENT)
  expect(w.toasts).toEqual([WARN, CRITICAL])
})

test('dropping under CRITICAL but not WARN re-arms CRITICAL alone', async ($, on) => {
  const w = world(on)
  await fill($, 96, 90, 96)
  expect(w.toasts).toEqual([CRITICAL, CRITICAL])
})

test('no reading (just compacted) leaves the flags as they were', async ($, on) => {
  const w = world(on)
  await fill($, 90, undefined, 91)
  expect(w.toasts).toEqual([WARN])
})

test('/clear, then a low reading: the flags start over', async ($, on) => {
  const w = world(on)
  await fill($, 96)
  expect(w.toasts).toEqual([CRITICAL])

  w.usage.now = contextAt(undefined) // a fresh conversation has no reading yet
  await $.classic.SessionStart({ source: 'clear' })
  expect(w.toasts).toEqual([CRITICAL])

  await fill($, 3)
  expect(w.toasts).toEqual([CRITICAL])
  await fill($, 88)
  expect(w.toasts).toEqual([CRITICAL, WARN])
})

test('/clear alone starts the flags over, with no low reading in between', async ($, on) => {
  const w = world(on)
  await fill($, 96)
  w.usage.now = contextAt(undefined)
  await $.classic.SessionStart({ source: 'clear' })
  await fill($, 96)
  expect(w.toasts).toEqual([CRITICAL, CRITICAL])
})

test('/resume into a conversation already past WARN judges its own figure at once', async ($, on) => {
  const w = world(on)
  await fill($, 90)
  expect(w.toasts).toEqual([WARN])

  w.usage.now = contextAt(91)
  await $.classic.SessionStart({ source: 'resume' })
  expect(w.toasts).toEqual([WARN, WARN])

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'context-meter', surface, ...BAND })
    expect((await ui.find({ key: 'meter' }))?.text).toBe(
      lineText({ tokens: 910_000, window: WINDOW, percent: 91 }),
    )
    await ui.unmount()
  }
})

test('a compaction start (classic compact source) changes no flag', async ($, on) => {
  const w = world(on)
  await fill($, 90)
  w.usage.now = contextAt(undefined)
  await $.classic.SessionStart({ source: 'compact' })
  await fill($, 91)
  expect(w.toasts).toEqual([WARN])
})

test('colour boundaries: 84.9 / 85 / CRITICAL − 0.1 / CRITICAL', async ($, on) => {
  world(on)

  const cases = [
    { percent: WARN_PERCENT - 0.1, color: undefined },
    { percent: WARN_PERCENT, color: 'warning' },
    { percent: CRITICAL_PERCENT - 0.1, color: 'warning' },
    { percent: CRITICAL_PERCENT, color: 'error' },
  ]
  expect(cases.map(one => one.percent)).toEqual([84.9, 85, CRITICAL_PERCENT - 0.1, CRITICAL_PERCENT])

  for (const one of cases) {
    await fill($, one.percent)

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: 'context-meter', surface, ...BAND })
      const text = (await ui.find({ key: 'meter' }))?.text
      expect(text).toBe(lineText({ tokens: Math.round((one.percent / 100) * WINDOW), window: WINDOW, percent: one.percent }))
      expect((await run(ui, ` ${one.percent}%`))?.props.color).toBe(one.color)
      const fill = barOf(one.percent, WIDTH)[0]
      expect((await run(ui, fill?.text ?? ''))?.props.color).toBe(one.color ?? 'success')
      await ui.unmount()
    }
  }
})

test('alerting keeps status-band beneath, and appends no row', async ($, on) => {
  const session = mock.session(on)
  const w = world(on, gitBeneath)
  await fill($, 84, 88, CRITICAL_PERCENT + 1)
  expect(w.toasts).toEqual([WARN, CRITICAL])
  expect(session.appended()).toEqual([])

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'context-meter', surface, ...BAND })
    expect((await ui.find({ key: 'git' }))?.text).toBe('dev · 29aa71840')
    expect(childKeys(await ui.drawn())).toEqual(['meter', 'git'])
    expect((await run(ui, ` ${CRITICAL_PERCENT + 1}%`))?.props.color).toBe('error')
    await ui.unmount()
  }
})
