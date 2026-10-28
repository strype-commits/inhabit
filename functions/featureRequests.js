// Feature requests: admin notification on submit, and a key-gated, read-only JSON export
// of the backlog for a coding agent (style guide §7 "Feature requests → agent-readable export").
//
//   featureRequests/{id}: { type, title, description, status, archived, uid, from,
//                           createdAt, updatedAt, adminNotes?, closedAt? }
//
// Export (no Firebase credentials needed, just the key):
//   GET .../featureRequestsExport?key=<FEATURE_EXPORT_KEY>[&status=planned,in-progress][&type=bug]
//       [&includeArchived=1]
// PII-stripped: first name only — no emails or UIDs.
import { onValueCreated } from 'firebase-functions/v2/database'
import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions'
import { getDatabase } from 'firebase-admin/database'
import { timingSafeEqual } from 'crypto'
import { notifyAdmins, resendApiKey } from './notify.js'

const REGION = 'europe-west1'
const DB_INSTANCE = 'inhabit-webapp-default-rtdb'
export const featureExportKey = defineSecret('FEATURE_EXPORT_KEY')

export const STATUSES = ['submitted', 'planned', 'in-progress', 'complete', 'wont-do']
export const TYPES = ['feature', 'bug']

const TYPE_LABEL = { feature: 'Feature request', bug: 'Bug report' }

export const onFeatureRequestCreated = onValueCreated(
  { ref: '/featureRequests/{requestId}', instance: DB_INSTANCE, region: REGION, secrets: [resendApiKey] },
  async (event) => {
    const r = event.data.val() || {}
    const summary = String(r.description || '').replace(/\s+/g, ' ').slice(0, 140)
    await notifyAdmins({
      title: `${TYPE_LABEL[r.type] || 'Feature request'}: ${r.title || '(untitled)'}`,
      body: `From ${r.from || 'a user'}${summary ? ` — ${summary}` : ''}`,
      path: '/admin?tab=requests',
      tag: `request-${event.params.requestId}`,
      kind: 'request'
    }).catch((err) => logger.error('Feature request notification failed', { message: err?.message }))
  }
)

function keyMatches(given, expected) {
  if (!given || !expected) return false
  const a = Buffer.from(String(given))
  const b = Buffer.from(String(expected))
  return a.length === b.length && timingSafeEqual(a, b)
}

const iso = (ms) => (Number.isFinite(Number(ms)) ? new Date(Number(ms)).toISOString() : null)
const list = (q) => String(q || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)

export const featureRequestsExport = onRequest(
  { region: REGION, secrets: [featureExportKey], cors: true },
  async (req, res) => {
    try {
      if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })
      if (!keyMatches(req.query.key, featureExportKey.value())) return res.status(403).json({ error: 'Invalid key' })

      const statuses = list(req.query.status)
      const types = list(req.query.type)
      const includeArchived = req.query.includeArchived === '1' || req.query.includeArchived === 'true'

      const all = (await getDatabase().ref('featureRequests').once('value')).val() || {}
      const requests = Object.entries(all)
        .map(([id, r]) => ({ id, ...r }))
        .filter((r) => includeArchived || !r.archived)
        .filter((r) => !statuses.length || statuses.includes(r.status))
        .filter((r) => !types.length || types.includes(r.type))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .map((r) => ({
          id: r.id,
          type: r.type,
          status: r.status,
          title: r.title,
          description: r.description,
          from: r.from || null,                    // first name only
          adminNotes: r.adminNotes || null,
          archived: !!r.archived,
          createdAt: iso(r.createdAt),
          updatedAt: iso(r.updatedAt),
          closedAt: iso(r.closedAt)
        }))

      res.set('Cache-Control', 'no-store')
      return res.json({
        app: 'inHabit',
        generatedAt: new Date().toISOString(),
        filters: { status: statuses, type: types, includeArchived },
        statuses: STATUSES,
        types: TYPES,
        count: requests.length,
        requests
      })
    } catch (err) {
      logger.error('featureRequestsExport crashed', { message: err?.message, stack: err?.stack })
      return res.status(500).json({ error: 'Export failed' })
    }
  }
)
