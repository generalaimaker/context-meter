export type Meter = {
  tokens: number | null
  window: number
  percent: number | null
}

/**
 * The highest threshold already announced while the fill stays at or past it;
 * null below WARN, or before any reading. Each threshold speaks again only
 * after the fill has dropped below it.
 */
export type Alerted = 'warn' | 'critical' | null

declare module 'claude-code' {
  interface PluginState {
    'context-meter': { meter: Meter | null; alerted: Alerted }
  }
}
