// src/services/push.js — web push via Firebase Cloud Messaging.
// Tokens are per device (browser instance), stored under a stable per-device id so
// re-enabling updates one entry and token rotation leaves no orphans:
//   users/{uid}/fcmTokens/{deviceId}: { token, updatedAt, userAgent }
// Dead tokens are removed by the server after a failed send (functions/notify.js).
import { getMessaging, getToken, deleteToken, onMessage, isSupported } from 'firebase/messaging'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { ref as dbRef, set, remove } from 'firebase/database'
import { app, db } from './firebase'

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY
const DEVICE_KEY = 'inhabit:deviceId'

export function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return 'no-storage'
  }
}

let messaging = null
async function getMessagingIfSupported() {
  if (!VAPID_KEY || !('Notification' in window) || !('serviceWorker' in navigator)) return null
  if (!(await isSupported().catch(() => false))) return null
  messaging ??= getMessaging(app)
  return messaging
}

// 'unsupported' | 'default' | 'granted' | 'denied'
export async function pushPermission() {
  return (await getMessagingIfSupported()) ? Notification.permission : 'unsupported'
}

export function pushEnabledHere(profile) {
  return !!profile?.fcmTokens?.[deviceId()]
}

export async function enablePush(uid) {
  const m = await getMessagingIfSupported()
  if (!m) throw new Error('Push notifications aren\'t supported in this browser')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications are blocked for this site in the browser settings')
  // Start from a fresh subscription so re-enabling always yields a live token.
  await deleteToken(m).catch(() => {})
  // No serviceWorkerRegistration: the SDK registers firebase-messaging-sw.js at its own scope.
  const token = await getToken(m, { vapidKey: VAPID_KEY })
  await set(dbRef(db, `users/${uid}/fcmTokens/${deviceId()}`), {
    token,
    updatedAt: Date.now(),
    userAgent: navigator.userAgent.slice(0, 200)
  })
}

// Turns push off for this device only — never touches the user's other devices.
export async function disablePush(uid) {
  const m = await getMessagingIfSupported()
  if (m) await deleteToken(m).catch(() => {})
  await remove(dbRef(db, `users/${uid}/fcmTokens/${deviceId()}`))
}

// Foreground messages (app open and focused) don't show a system notification; hand them to the UI.
export async function onForegroundMessage(callback) {
  const m = await getMessagingIfSupported()
  if (!m) return () => {}
  return onMessage(m, (payload) => callback({
    title: payload.notification?.title || payload.data?.title || 'inHabit',
    body: payload.notification?.body || payload.data?.body || '',
    url: payload.data?.url
  }))
}

// Asks the server to email a test alert to the signed-in user.
export async function sendTestEmail() {
  const call = httpsCallable(getFunctions(app, 'europe-west1'), 'sendTestEmail')
  const { data } = await call()
  return data   // { sentTo }
}

// Asks the server to push a test notification to all of this user's devices.
export async function sendTestPush() {
  const call = httpsCallable(getFunctions(app, 'europe-west1'), 'sendTestPush')
  const { data } = await call()
  return data   // { successCount, failureCount }
}
