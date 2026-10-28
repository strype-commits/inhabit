// src/services/featureRequests.js — user-submitted feature requests and bug reports.
//   featureRequests/{id}: { type, title, description, status, archived, uid, from,
//                           createdAt, updatedAt, adminNotes?, closedAt? }
// Users create (status "submitted", not archived) and read their own; everything after is admin-only.
// A Cloud Function notifies admins on create and exports the backlog as JSON (functions/featureRequests.js).
import {
  ref as dbRef, push, update, onValue, query, orderByChild, equalTo
} from 'firebase/database'
import { db } from './firebase'

export const STATUSES = [
  { id: 'submitted', label: 'Submitted' },
  { id: 'planned', label: 'Planned' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'complete', label: 'Complete' },
  { id: 'wont-do', label: "Won't do" }
]
export const TYPES = [
  { id: 'feature', label: 'Feature' },
  { id: 'bug', label: 'Bug' }
]
// Statuses that close a request (stamps the silent closedAt).
const TERMINAL = ['complete', 'wont-do']

export const statusLabel = (id) => STATUSES.find((s) => s.id === id)?.label || id
export const typeLabel = (id) => TYPES.find((t) => t.id === id)?.label || id

const toList = (val) =>
  Object.entries(val || {}).map(([id, r]) => ({ id, ...r })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))

export function submitFeatureRequest({ uid, displayName, type, title, description }) {
  const now = Date.now()
  return push(dbRef(db, 'featureRequests'), {
    type,
    title: title.trim(),
    description: description.trim(),
    status: 'submitted',
    archived: false,
    uid,
    from: (displayName || '').trim().split(/\s+/)[0] || 'User',   // first name only
    createdAt: now,
    updatedAt: now
  })
}

// The signed-in user's own requests, newest first.
export function subscribeMyFeatureRequests(uid, callback, onError) {
  const q = query(dbRef(db, 'featureRequests'), orderByChild('uid'), equalTo(uid))
  return onValue(q, (snap) => callback(toList(snap.val())), onError)
}

// Admin: every request, newest first.
export function subscribeAllFeatureRequests(callback, onError) {
  return onValue(dbRef(db, 'featureRequests'), (snap) => callback(toList(snap.val())), onError)
}

// Admin: edit fields. Moving to a terminal status stamps closedAt; reopening clears it.
export function updateFeatureRequest(id, fields, current = {}) {
  const changes = { ...fields, updatedAt: Date.now() }
  if (fields.status && fields.status !== current.status) {
    if (TERMINAL.includes(fields.status) && !TERMINAL.includes(current.status)) changes.closedAt = Date.now()
    if (!TERMINAL.includes(fields.status)) changes.closedAt = null
  }
  return update(dbRef(db, `featureRequests/${id}`), changes)
}
