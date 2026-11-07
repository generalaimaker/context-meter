import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage } from 'claude-code'

import type { Meter } from '../types'
import { stepOf, toastOf } from './alert'
import { LABEL, barWidthOf, levelOf, lineOf, percentOf } from './format'

// The fill is green until WARN, then the band's color; the empty track is dim
// with its WARN and CRITICAL stretches tinted.
const FILL_COLOR = { normal: 'success', warning: 'warning', error: 'error' } as const
const TRACK_COLOR = { warn: 'warning', critical: 'error' } as const

const meter = atom({ plugin: 'context-meter', key: 'meter' } as const, null)
const alerted = atom({ plugin: 'context-meter', key: 'alerted' } as const, null)

const toMeter = (context: SessionContextUsage): Meter => ({
  tokens: context.tokens ?? null,
  window: context.window,
  percent: context.percent ?? null,
})

// Every refresh of the meter judges the thresholds on the same figure at the
// same moment, never on a timer of its own. A threshold crossed on the way up
// raises one toast; nothing reaches the transcript or the model.
const take = async ($: EngineInterface, context: SessionContextUsage): Promise<void> => {
  const reading = toMeter(context)
  await update($, meter, () => reading)

  const percent = percentOf(reading)
  if (percent === null) {
    return
  }

  const said: { toast: 'warn' | 'critical' | null } = { toast: null }
  await update($, alerted, before => {
    const step = stepOf(before, percent)
    said.toast = step.toast

    return step.alerted
  })
  if (said.toast !== null) {
    $.ui.toast(toastOf(said.toast))
  }
}

export const register: Register = on => {
  // Start and every hot reload: take the figure the status line has right
  // now, so the band is right before the next turn ends.
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await take($, (await $.session.usage()).context)

    return started
  })

  // /clear and /resume raise no session.start: the thresholds start over and
  // are judged again on the new conversation's own figure.
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    if (e.source === 'clear' || e.source === 'resume' || e.source === 'fork') {
      await update($, alerted, () => null)
      await take($, (await $.session.usage()).context)
    }

    return result
  }).catch(($, e, next) => next(e))

  // Pushed by the engine after each main-thread turn.
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await take($, e.context)
    }

    return next(e)
  })

  // A compaction empties the reading until the next response. A meter that
  // fails must never change what the compaction answered.
  on('session.compact', async ($, e, next) => {
    const compacted = await next(e)
    await take($, (await $.session.usage()).context)

    return compacted
  }).catch(($, e, next) => next(e))

  // What plugins beneath draw in the band (status-band's git line) stays,
  // under this line.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const current = await read($, meter)

    if (e.props.hasSurvey || current === null) {
      return below
    }

    const { Box, Text } = $.ui.resolve(e)
    const level = levelOf(percentOf(current))
    const line = lineOf(current, barWidthOf(e.props.bodyColumns))
    const mine = (
      <Box key="meter">
        <Text wrap="truncate">
          <Text dimColor>{LABEL}</Text>
          {line.bar.map(segment =>
            segment.zone === 'fill' ? (
              <Text color={FILL_COLOR[level]}>{segment.text}</Text>
            ) : segment.zone === 'none' ? (
              <Text dimColor>{segment.text}</Text>
            ) : (
              <Text color={TRACK_COLOR[segment.zone]}>{segment.text}</Text>
            ),
          )}
          <Text color={level === 'normal' ? undefined : level} weight="bold">
            {line.percent}
          </Text>
          <Text dimColor>{line.tokens}</Text>
        </Text>
      </Box>
    )

    if (below.type === 'engine') {
      return mine
    }

    return (
      <Box flexDirection="column">
        {mine}
        {below}
      </Box>
    )
  })
}
