// src/services/admin.js — admin-only reads/writes (enforced by database.rules.json).
import { ref as dbRef, onValue, update, set } from 'firebase/database'
import { db } from './firebase'

const FIRMWARE_BASE_URL = 'https://inhabit-firmware.web.app'

export const ASSIGNABLE_ROLES = ['user', 'admin']

// All user profiles, as { uid: profile }.
export function subscribeUsers(callback, onError) {
  return onValue(dbRef(db, 'users'), (snap) => callback(snap.val() || {}), onError)
}

// Pending device commands, as { sensorId: { command: true } }.
export function subscribeCommands(callback, onError) {
  return onValue(dbRef(db, 'commands'), (snap) => callback(snap.val() || {}), onError)
}

export function setUserRole(uid, role) {
  if (!ASSIGNABLE_ROLES.includes(role)) throw new Error(`Role "${role}" can't be assigned here`)
  return update(dbRef(db, `users/${uid}`), { role })
}

// Grant or revoke a user's access to one sensor.
export function setUserSensorAccess(uid, sensorId, allowed) {
  return set(dbRef(db, `users/${uid}/sensors/${sensorId}`), allowed ? true : null)
}

// Ask a device to check for new firmware right after its next report (contract §9).
export function requestFirmwareCheck(sensorId) {
  return set(dbRef(db, `commands/${sensorId}/checkUpdate`), true)
}

// "oil-tank 1.0.2" → { channel: 'oil-tank', version: '1.0.2' }
export function parseFirmware(firmware) {
  const m = /^(\S+)\s+(\d+\.\d+\.\d+)$/.exec(firmware || '')
  return m ? { channel: m[1], version: m[2] } : null
}

// Latest published version for a firmware channel, or null if unavailable.
export async function fetchLatestFirmware(channel) {
  try {
    const res = await fetch(`${FIRMWARE_BASE_URL}/${channel}/manifest.json`, { cache: 'no-cache' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export function isOlderVersion(current, latest) {
  const a = current.split('.').map(Number)
  const b = latest.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i]
  return false
}
