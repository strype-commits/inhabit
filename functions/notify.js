// Delivers sensor alerts to everyone with access to the sensor: an in-app notification
// (/notifications/{uid}) always, web push to every device they've enabled, and email via
// Resend unless they've switched it off.
import { defineSecret, defineString } from 'firebase-functions/params'
import { logger } from 'firebase-functions'
import { getDatabase } from 'firebase-admin/database'
import { getMessaging } from 'firebase-admin/messaging'

// Set with: firebase functions:secrets:set RESEND_API_KEY
// A placeholder value (e.g. "placeholder") makes email a no-op; in-app still works.
export const resendApiKey = defineSecret('RESEND_API_KEY')
const EMAIL_FROM = defineString('ALERT_EMAIL_FROM', { default: 'inHabit <alerts@strype.uk>' })
const APP_URL = defineString('APP_URL', { default: 'https://inhabit-webapp-dev.web.app' })

const ADMIN_ROLES = ['admin', 'master']

const humanize = (key) => {
  const w = String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase()
  return w.charAt(0).toUpperCase() + w.slice(1)
}

function unitFor(sensor, variable) {
  if (sensor?.variableUnits?.[variable]) return sensor.variableUnits[variable]
  const graphed = Object.values(sensor?.graphVariables || {})
  return variable === sensor?.primaryVariable || graphed.includes(variable) ? (sensor?.units || '') : ''
}

function fmt(value, unit) {
  if (!Number.isFinite(value)) return '—'
  const v = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)))
  if (!unit) return v
  return /^[°%]/.test(unit) ? `${v}${unit}` : `${v} ${unit}`
}

const londonTime = (ms) => new Date(ms).toLocaleString('en-GB', {
  timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
})

// Title and body for an alert event.
export function describe({ sensor, kind, rule, value }) {
  const name = sensor?.name || 'Sensor'
  if (rule.id === 'offline') {
    const last = Number(sensor?.epoch ?? sensor?.lastUpdated)
    const lastText = Number.isFinite(last) ? londonTime(last > 1e12 ? last : last * 1000) : 'unknown'
    return kind === 'raise'
      ? { title: `${name} has gone quiet`, body: `No reading since ${lastText}. Check its power and WiFi.` }
      : { title: `${name} is reporting again`, body: 'Readings have resumed.' }
  }
  const label = rule.label || humanize(rule.variable)
  const unit = unitFor(sensor, rule.variable)
  return kind === 'raise'
    ? { title: `${name}: ${label} low`, body: `${label} is ${fmt(value, unit)}, below the alert level of ${fmt(rule.below, unit)}.` }
    : { title: `${name}: ${label} back to normal`, body: `${label} is ${fmt(value, unit)}, back above ${fmt(rule.below, unit)}.` }
}

async function recipients(sensorId) {
  const users = (await getDatabase().ref('users').once('value')).val() || {}
  return Object.entries(users)
    .filter(([, u]) => u && u.role !== 'device')
    .filter(([, u]) => ADMIN_ROLES.includes(u.role) || u.isDeveloper === true || u.sensors?.[sensorId])
    .map(([uid, u]) => ({
      uid,
      email: u.email,
      wantsEmail: u.notificationPrefs?.email !== false,
      devices: Object.entries(u.fcmTokens || {})
        .filter(([, t]) => t?.token)
        .map(([deviceId, t]) => ({ deviceId, token: t.token }))
    }))
}

function isPlaceholder(key) {
  return !key || /^(placeholder|changeme|todo|x+)$/i.test(key.trim())
}

export async function sendEmail(to, subject, text, link) {
  const key = resendApiKey.value()
  if (isPlaceholder(key)) return 'skipped'
  const html = `<p>${text}</p><p><a href="${link}">Open in inHabit</a></p>
    <p style="color:#888;font-size:12px">You can turn off email alerts in inHabit → Settings.</p>`
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM.value(), to: [to], subject, text: `${text}\n\n${link}`, html })
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
  return 'sent'
}

// Tokens FCM reports as permanently dead; anything else (e.g. quota) is left alone.
const DEAD_TOKEN_CODES = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']

// Push to a list of { uid, deviceId, token }. Top-level notification AND a data copy, so the
// dependency-free service worker can render whatever shape FCM delivers.
export async function sendPush(devices, { title, body, url, tag }) {
  if (!devices.length) return { successCount: 0, failureCount: 0 }
  const data = { title, body, url, ...(tag ? { tag } : {}) }
  const res = await getMessaging().sendEachForMulticast({
    tokens: devices.map((d) => d.token),
    notification: { title, body },
    data,
    webpush: { fcmOptions: { link: url }, headers: { Urgency: 'high' } }
  })
  const db = getDatabase()
  await Promise.all(res.responses.map((r, i) => {
    if (r.success || !DEAD_TOKEN_CODES.includes(r.error?.code)) return null
    const d = devices[i]
    logger.info('Removing dead push token', { uid: d.uid, deviceId: d.deviceId })
    return db.ref(`users/${d.uid}/fcmTokens/${d.deviceId}`).remove()
  }))
  return { successCount: res.successCount, failureCount: res.failureCount }
}

// All push-enabled devices for one user.
export async function userDevices(uid) {
  const tokens = (await getDatabase().ref(`users/${uid}/fcmTokens`).once('value')).val() || {}
  return Object.entries(tokens).filter(([, t]) => t?.token).map(([deviceId, t]) => ({ uid, deviceId, token: t.token }))
}

export async function notifySensorUsers({ sensorId, sensor, kind, rule, value }) {
  const { title, body } = describe({ sensor, kind, rule, value })
  const link = `${APP_URL.value()}/sensor/${sensorId}`
  const db = getDatabase()
  const people = await recipients(sensorId)
  const createdAt = Date.now()

  await Promise.all(people.map(({ uid }) =>
    db.ref(`notifications/${uid}`).push({ sensorId, ruleId: rule.id, kind, title, body, createdAt, read: false })))

  const devices = people.flatMap((p) => p.devices.map((d) => ({ uid: p.uid, ...d })))
  const push = await sendPush(devices, { title, body, url: link, tag: `${sensorId}-${rule.id}` })
    .catch((err) => { logger.error('Push failed', { message: err?.message }); return null })

  // One email per person, so addresses aren't shared between recipients.
  for (const p of people.filter((p) => p.wantsEmail && p.email)) {
    try {
      const result = await sendEmail(p.email, title, body, link)
      if (result === 'skipped') { logger.info('Email skipped: RESEND_API_KEY not set'); break }
    } catch (err) {
      logger.error('Alert email failed', { uid: p.uid, message: err?.message })
    }
  }
  logger.info('Alert delivered', { sensorId, rule: rule.id, kind, recipients: people.length, push })
}
