// Sensor alerts: threshold rules checked on every sensor write, plus a scheduled
// "gone quiet" check. Each alert is raised once and cleared once (with hysteresis),
// never repeated on every reading. State lives in /alertState/{sensorId}/{ruleId}.
//
// Rules are app-owned sensor metadata (admin-edited in the app):
//   sensors/{id}/alerts/{ruleId}: { variable: "litres", below: 300, label: "Oil level", enabled: true }
//   sensors/{id}/alertOffline:    false to switch off the "gone quiet" alert (default on)
import { onValueWritten } from 'firebase-functions/v2/database'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions'
import { getDatabase } from 'firebase-admin/database'
import { notifySensorUsers, resendApiKey } from './notify.js'

const REGION = 'europe-west1'
const DB_INSTANCE = 'inhabit-webapp-default-rtdb'
const OFFLINE_RULE = 'offline'
const DEFAULT_STALE_MULTIPLIER = 2   // keep in step with src/utils/sensorConfig.js

// ---------- helpers ----------

const toSeconds = (t) => {
  const n = Number(t)
  if (!Number.isFinite(n) || n <= 0) return null
  return n > 1e12 ? Math.floor(n / 1000) : n
}

// Margin a value must recover past the threshold before the alert clears.
const hysteresis = (below) => Math.max(0.5, Math.abs(below) * 0.1)

function thresholdRules(sensor) {
  return Object.entries(sensor?.alerts || {})
    .filter(([, r]) => r && r.enabled !== false && r.variable && Number.isFinite(Number(r.below)))
    .map(([id, r]) => ({ id, variable: r.variable, below: Number(r.below), label: r.label }))
}

// Reporting interval in seconds: the device's own (nextUpdate − epoch), else expectedFrequencyMinutes.
function reportingIntervalS(sensor) {
  const last = toSeconds(sensor?.epoch ?? sensor?.lastUpdated)
  const next = toSeconds(sensor?.nextUpdate)
  if (last && next && next > last) return next - last
  const freq = Number(sensor?.expectedFrequencyMinutes)
  return Number.isFinite(freq) && freq > 0 ? freq * 60 : null
}

function lastReportS(sensor) {
  return toSeconds(sensor?.epoch ?? sensor?.lastUpdated)
}

function overdue(sensor, nowS) {
  if (sensor?.alertOffline === false) return false
  const interval = reportingIntervalS(sensor)
  const last = lastReportS(sensor)
  if (!interval || !last) return false
  const mult = Number(sensor?.staleAfterMultiplier) >= 1 ? Number(sensor.staleAfterMultiplier) : DEFAULT_STALE_MULTIPLIER
  return nowS - last > interval * mult
}

// ---------- triggers ----------

// Every write to a sensor (device readings or admin edits): evaluate threshold rules,
// and clear "gone quiet" when a fresh report arrives.
export const evaluateSensorAlerts = onValueWritten(
  { ref: '/sensors/{sensorId}', instance: DB_INSTANCE, region: REGION, secrets: [resendApiKey] },
  async (event) => {
    const sensor = event.data.after.val()
    if (!sensor) return
    const sensorId = event.params.sensorId
    const before = event.data.before.val() || {}
    const db = getDatabase()
    const stateRef = db.ref(`alertState/${sensorId}`)
    const state = (await stateRef.once('value')).val() || {}
    const nowMs = Date.now()
    const updates = {}
    const events = []

    for (const rule of thresholdRules(sensor)) {
      const value = Number(sensor.variables?.[rule.variable])
      if (!Number.isFinite(value)) continue
      const active = !!state[rule.id]?.active
      if (!active && value < rule.below) {
        updates[rule.id] = { active: true, since: nowMs, value }
        events.push({ kind: 'raise', rule, value })
      } else if (active && value >= rule.below + hysteresis(rule.below)) {
        updates[rule.id] = { active: false, since: nowMs, value }
        events.push({ kind: 'clear', rule, value })
      }
    }

    const reported = lastReportS(sensor) && lastReportS(sensor) !== lastReportS(before)
    if (state[OFFLINE_RULE]?.active && reported) {
      updates[OFFLINE_RULE] = { active: false, since: nowMs }
      events.push({ kind: 'clear', rule: { id: OFFLINE_RULE } })
    }

    if (!events.length) return
    await stateRef.update(updates)
    for (const e of events) {
      await notifySensorUsers({ sensorId, sensor, ...e }).catch((err) =>
        logger.error('Alert notification failed', { sensorId, rule: e.rule.id, message: err?.message }))
    }
  }
)

// Every 15 minutes: raise "gone quiet" for sensors well past their expected report.
export const checkOfflineSensors = onSchedule(
  { schedule: 'every 15 minutes', timeZone: 'Europe/London', region: REGION, secrets: [resendApiKey] },
  async () => {
    const db = getDatabase()
    const [sensors, states] = await Promise.all([
      db.ref('sensors').once('value').then((s) => s.val() || {}),
      db.ref('alertState').once('value').then((s) => s.val() || {})
    ])
    const nowS = Math.floor(Date.now() / 1000)

    for (const [sensorId, sensor] of Object.entries(sensors)) {
      if (states[sensorId]?.[OFFLINE_RULE]?.active || !overdue(sensor, nowS)) continue
      await db.ref(`alertState/${sensorId}/${OFFLINE_RULE}`).set({ active: true, since: Date.now() })
      await notifySensorUsers({ sensorId, sensor, kind: 'raise', rule: { id: OFFLINE_RULE } }).catch((err) =>
        logger.error('Offline notification failed', { sensorId, message: err?.message }))
    }
  }
)

// Exported for tests.
export const _internal = { hysteresis, thresholdRules, reportingIntervalS, overdue }
