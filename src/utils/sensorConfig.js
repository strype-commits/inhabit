// src/utils/sensorConfig.js — per-sensor behaviour driven by metadata on /sensors/{id}.
//
//   nextUpdate (device)       when the device will next report; with epoch gives its interval
//   expectedFrequencyMinutes  how often a reading should arrive, used when there's no nextUpdate
//                             (neither → staleness not checked)
//   staleAfterMultiplier      stale once silent for the reporting interval × this (default 2)
//   retentionDays             days of history to keep; older readings are pruned daily
//                             (no value → DEFAULT_RETENTION_DAYS)
//   showHistory               false hides the graph, e.g. for on/off sensors (default true)
//   graphVariables            which variables the graph plots, e.g. ["pipeTemp", "enclosureTemp"]
//                             (default: the primary variable only)
import { timestampToDate, primaryVariableKey } from './formatters'

// Keep in step with functions/index.js.
export const DEFAULT_RETENTION_DAYS = 365

export const PARAM_DEFAULTS = {
  expectedFrequencyMinutes: null,
  staleAfterMultiplier: 2,
  retentionDays: null,
  showHistory: true
}

function positiveNumber(v) {
  const n = Number(v)
  return v !== null && v !== '' && Number.isFinite(n) && n > 0 ? n : null
}

// Metadata merged over defaults, with invalid values ignored.
export function sensorParams(sensor) {
  return {
    expectedFrequencyMinutes: positiveNumber(sensor?.expectedFrequencyMinutes),
    staleAfterMultiplier: positiveNumber(sensor?.staleAfterMultiplier) ?? PARAM_DEFAULTS.staleAfterMultiplier,
    retentionDays: positiveNumber(sensor?.retentionDays),
    showHistory: sensor?.showHistory !== false
  }
}

// Timestamp fields a device might write on the sensor node itself.
const TIMESTAMP_FIELDS = ['epoch', 'lastUpdated', 'updatedAt', 'timestamp']

// When the sensor last reported: a timestamp on the sensor node if present,
// otherwise the newest history key.
export function lastUpdatedDate(sensor, latestHistoryKey) {
  for (const f of TIMESTAMP_FIELDS) {
    if (sensor?.[f] != null) {
      const d = timestampToDate(sensor[f]) ?? new Date(sensor[f])
      if (!Number.isNaN(d?.getTime())) return d
    }
  }
  return latestHistoryKey != null ? timestampToDate(latestHistoryKey) : null
}

// The reporting interval the device itself declares: nextUpdate − epoch, in minutes.
export function deviceIntervalMinutes(sensor) {
  const last = timestampToDate(sensor?.epoch)
  const next = timestampToDate(sensor?.nextUpdate)
  if (!last || !next || next <= last) return null
  return (next - last) / 60000
}

export function nextExpectedDate(sensor) {
  return timestampToDate(sensor?.nextUpdate)
}

// How often a reading should arrive: the device's declared interval if it sends
// nextUpdate, otherwise the admin-set expectedFrequencyMinutes.
export function effectiveFrequency(sensor) {
  const device = deviceIntervalMinutes(sensor)
  if (device) return { minutes: device, source: 'device' }
  const configured = sensorParams(sensor).expectedFrequencyMinutes
  if (configured) return { minutes: configured, source: 'configured' }
  return { minutes: null, source: null }
}

// 'ok' | 'stale' | 'unknown' (no known frequency). Stale once silent for
// frequency × staleAfterMultiplier.
export function staleness(sensor, lastDate, now = new Date()) {
  const { staleAfterMultiplier } = sensorParams(sensor)
  const { minutes, source } = effectiveFrequency(sensor)
  if (!minutes) return { state: 'unknown', thresholdMinutes: null, source }
  const thresholdMinutes = minutes * staleAfterMultiplier
  if (!lastDate) return { state: 'stale', thresholdMinutes, source }
  const ageMinutes = (now - lastDate) / 60000
  return { state: ageMinutes > thresholdMinutes ? 'stale' : 'ok', thresholdMinutes, source }
}

// "8 hr" / "90 min" / "30 s"
export function formatDuration(minutes) {
  if (minutes == null) return '—'
  if (minutes < 1) return `${Math.round(minutes * 60)} s`
  if (minutes < 120) return `${Number(minutes.toFixed(1))} min`
  if (minutes < 2880) return `${Number((minutes / 60).toFixed(1))} hr`
  return `${Number((minutes / 1440).toFixed(1))} days`
}

// Every variable the sensor reports, primary first then alphabetical. A variable's position
// here is its colour slot, so colours stay put whichever subset is plotted.
export function orderedVariableKeys(sensor) {
  const primary = primaryVariableKey(sensor)
  const rest = Object.keys(sensor?.variables || {}).filter((k) => k !== primary).sort()
  return primary ? [primary, ...rest] : rest
}

// Variables to plot, in colour-slot order.
export function graphVariableKeys(sensor) {
  const all = orderedVariableKeys(sensor)
  const chosen = new Set(Object.values(sensor?.graphVariables || {}))
  const keys = all.filter((k) => chosen.has(k))
  return keys.length ? keys : all.slice(0, 1)
}

export const MAX_SERIES = 8

// 1-based categorical colour slot for a variable (see --series-N tokens).
export function colorSlot(sensor, key) {
  const i = orderedVariableKeys(sensor).indexOf(key)
  return i < 0 ? 1 : Math.min(i, MAX_SERIES - 1) + 1   // palette never cycles; >8 variables share slot 8
}
