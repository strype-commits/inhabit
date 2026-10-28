// src/services/localBoard.js — talking to a sensor board directly over the home network.
// A board that runs its own web page publishes its address as `localUrl` on its sensor node
// (docs/device-contract.md §10). Nothing here touches Firebase.

const FETCH_OK_KEY = 'inhabit:localFetchOk'

// The board's page address if the sensor has a usable one, else null. Only http(s) links are
// accepted, since the value comes from the database and ends up in an href.
export function localBoardUrl(sensor) {
  const raw = sensor?.localUrl
  if (typeof raw !== 'string' || !raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch { return null }
}

// A fresh reading straight from the board: { variables, state, status, ... }, in the same shape
// the board writes to Firebase. Rejects if the board can't be reached from this network, or if
// the browser won't let a secure page call a plain-HTTP address on the LAN.
export async function fetchLocalReading(localUrl, timeoutMs = 6000) {
  const url = new URL(localUrl)
  url.pathname = '/api/reading'   // keeps ?token=
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    if (!res.ok) throw new Error(`Board answered ${res.status}`)
    const reading = await res.json()
    if (!reading || typeof reading.variables !== 'object') throw new Error('Unexpected reply from the board')
    return reading
  } finally {
    clearTimeout(timer)
  }
}

// Whether an in-app fetch has ever worked in this browser. Until it has, "Update now" keeps
// opening the board's own page, which always works on the home network.
export function localFetchProven() {
  try { return localStorage.getItem(FETCH_OK_KEY) === '1' } catch { return false }
}

export function rememberLocalFetchWorks() {
  try { localStorage.setItem(FETCH_OK_KEY, '1') } catch { /* private mode */ }
}
