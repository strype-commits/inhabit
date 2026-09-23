// src/services/sensors.js — Realtime Database reads/writes for sensors and their history.
// Every subscribe* returns an unsubscribe function.
import {
  ref as dbRef, onValue, update, query, orderByKey, limitToLast, startAt
} from 'firebase/database'
import { db } from './firebase'

// All sensors, as { id: sensor }. Admin view.
export function subscribeAllSensors(callback, onError) {
  return onValue(dbRef(db, 'sensors'), (snap) => callback(snap.val() || {}), onError)
}

// Only the given sensor ids, merged into one { id: sensor } object. Normal-user view.
export function subscribeSensorsByIds(ids, callback, onError) {
  const result = {}
  const unsubs = ids.map((id) =>
    onValue(dbRef(db, `sensors/${id}`), (snap) => {
      if (snap.exists()) result[id] = snap.val()
      else delete result[id]
      callback({ ...result })
    }, onError))
  if (!ids.length) callback({})
  return () => unsubs.forEach((u) => u())
}

export function subscribeSensor(id, callback, onError) {
  return onValue(dbRef(db, `sensors/${id}`), (snap) => callback(snap.val()), onError)
}

// Most recent `limit` history entries, keyed by timestamp. Never loads the whole node.
export function subscribeRecentHistory(id, limit, callback, onError) {
  const q = query(dbRef(db, `sensorDataHistory/${id}`), orderByKey(), limitToLast(limit))
  return onValue(q, (snap) => callback(snap.val() || {}), onError)
}

// History from `startKey` (a timestamp in the same units as the keys) onwards, capped at `limit`.
export function subscribeHistorySince(id, startKey, limit, callback, onError) {
  const q = query(dbRef(db, `sensorDataHistory/${id}`), orderByKey(), startAt(String(startKey)), limitToLast(limit))
  return onValue(q, (snap) => callback(snap.val() || {}), onError)
}

// Admin-only (enforced by database rules): write per-sensor configuration fields.
export function updateSensorParameters(id, params) {
  return update(dbRef(db, `sensors/${id}`), params)
}
