// src/services/notifications.js — the signed-in user's alert feed and preferences.
// Notifications are written by Cloud Functions (functions/notify.js); users only mark or delete them.
import {
  ref as dbRef, onValue, update, remove, query, orderByChild, limitToLast
} from 'firebase/database'
import { db } from './firebase'

const FEED_LIMIT = 50

// Newest first: [{ id, sensorId, ruleId, kind, title, body, createdAt, read }]
export function subscribeNotifications(uid, callback, onError) {
  const q = query(dbRef(db, `notifications/${uid}`), orderByChild('createdAt'), limitToLast(FEED_LIMIT))
  return onValue(q, (snap) => {
    const list = []
    snap.forEach((child) => { list.push({ id: child.key, ...child.val() }) })
    callback(list.reverse())
  }, onError)
}

export function markRead(uid, ids) {
  if (!ids.length) return Promise.resolve()
  return update(dbRef(db, `notifications/${uid}`), Object.fromEntries(ids.map((id) => [`${id}/read`, true])))
}

export function deleteNotification(uid, id) {
  return remove(dbRef(db, `notifications/${uid}/${id}`))
}

export function setEmailAlerts(uid, enabled) {
  return update(dbRef(db, `users/${uid}/notificationPrefs`), { email: enabled })
}
