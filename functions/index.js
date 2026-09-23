// inHabit Cloud Functions (gen 2). Requires the Blaze plan to deploy.
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions'
import { initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'

initializeApp()

const DELETE_BATCH = 500
// Used when a sensor has no retentionDays of its own. Keep in step with src/utils/sensorConfig.js.
const DEFAULT_RETENTION_DAYS = 365

// Delete history keys at or before `cutoffKey`, in batches, returning how many were removed.
async function pruneSensorHistory(db, sensorId, cutoffKey) {
  const historyRef = db.ref(`sensorDataHistory/${sensorId}`)
  let removed = 0
  for (;;) {
    const snap = await historyRef.orderByKey().endAt(String(cutoffKey)).limitToFirst(DELETE_BATCH).once('value')
    if (!snap.exists()) break
    const updates = {}
    snap.forEach((child) => { updates[child.key] = null })
    await historyRef.update(updates)
    removed += snap.numChildren()
    if (snap.numChildren() < DELETE_BATCH) break
  }
  return removed
}

// Daily: delete history older than each sensor's `retentionDays` (default DEFAULT_RETENTION_DAYS).
export const pruneSensorHistoryDaily = onSchedule(
  { schedule: 'every day 03:00', timeZone: 'Europe/London', region: 'europe-west1' },
  async () => {
    const db = getDatabase()
    const sensors = (await db.ref('sensors').once('value')).val() || {}

    for (const [sensorId, sensor] of Object.entries(sensors)) {
      const own = Number(sensor?.retentionDays)
      const days = Number.isFinite(own) && own >= 1 ? own : DEFAULT_RETENTION_DAYS

      try {
        // Keys are Unix timestamps; detect seconds vs milliseconds from the newest key.
        const newest = await db.ref(`sensorDataHistory/${sensorId}`).orderByKey().limitToLast(1).once('value')
        if (!newest.exists()) continue
        let newestKey = null
        newest.forEach((c) => { newestKey = c.key })
        const inMs = Number(newestKey) > 1e12

        const cutoffMs = Date.now() - days * 86400000
        const cutoffKey = inMs ? cutoffMs : Math.floor(cutoffMs / 1000)
        const removed = await pruneSensorHistory(db, sensorId, cutoffKey)
        if (removed) logger.info('Pruned sensor history', { sensorId, removed, retentionDays: days })
      } catch (err) {
        logger.error('Pruning failed for sensor', { sensorId, message: err?.message, stack: err?.stack })
      }
    }
  }
)
