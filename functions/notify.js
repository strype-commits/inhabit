// Delivers sensor alerts to everyone with access to the sensor: an in-app notification
// (/notifications/{uid}) always, plus email via Resend unless the user has switched it off.
import { defineSecret, defineString } from 'firebase-functions/params'
import { logger } from 'firebase-functions'
import { getDatabase } from 'firebase-admin/database'

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
    .map(([uid, u]) => ({ uid, email: u.email, wantsEmail: u.notificationPrefs?.email !== false }))
}

function isPlaceholder(key) {
  return !key || /^(placeholder|changeme|todo|x+)$/i.test(key.trim())
}

async function sendEmail(to, subject, text, link) {
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

export async function notifySensorUsers({ sensorId, sensor, kind, rule, value }) {
  const { title, body } = describe({ sensor, kind, rule, value })
  const link = `${APP_URL.value()}/sensor/${sensorId}`
  const db = getDatabase()
  const people = await recipients(sensorId)
  const createdAt = Date.now()

  await Promise.all(people.map(({ uid }) =>
    db.ref(`notifications/${uid}`).push({ sensorId, ruleId: rule.id, kind, title, body, createdAt, read: false })))

  // One email per person, so addresses aren't shared between recipients.
  for (const p of people.filter((p) => p.wantsEmail && p.email)) {
    try {
      const result = await sendEmail(p.email, title, body, link)
      if (result === 'skipped') { logger.info('Email skipped: RESEND_API_KEY not set'); break }
    } catch (err) {
      logger.error('Alert email failed', { uid: p.uid, message: err?.message })
    }
  }
  logger.info('Alert delivered', { sensorId, rule: rule.id, kind, recipients: people.length })
}
