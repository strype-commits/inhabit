// src/utils/formatters.js — interpret sensor data using its metadata.

// Fallback units for sensors whose metadata has no `units` yet.
// Prefer setting `units` on the sensor in Firebase over adding entries here.
const FALLBACK_UNITS = {
  temperature: '°C',
  litres: 'ltrs',
  showers: 'shwrs'
}

// The variable a sensor should display: an explicit `primaryVariable`, else variables[type],
// else the variable named after its units (units "litres" → variables.litres), else its first variable.
export function primaryVariableKey(sensor) {
  const vars = sensor?.variables
  if (!vars || typeof vars !== 'object') return null
  if (sensor.primaryVariable && sensor.primaryVariable in vars) return sensor.primaryVariable
  if (sensor.type && sensor.type in vars) return sensor.type
  if (sensor.units && sensor.units in vars) return sensor.units
  return Object.keys(vars)[0] ?? null
}

export function sensorUnit(sensor, key = primaryVariableKey(sensor)) {
  if (sensor?.units) return sensor.units
  if (sensor?.unit) return sensor.unit
  return FALLBACK_UNITS[key] ?? ''
}

export function formatValue(value, unit = '') {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'On' : 'Off'
  const shown = typeof value === 'number' && !Number.isInteger(value)
    ? Number(value.toFixed(2)).toString()
    : String(value)
  if (!unit) return shown
  return /^[°%]/.test(unit) ? `${shown}${unit}` : `${shown} ${unit}`
}

export function formatSensorValue(sensor) {
  const key = primaryVariableKey(sensor)
  if (!key) return '—'
  return formatValue(sensor.variables[key], sensorUnit(sensor, key))
}

// A history entry may be a bare value, { [key]: value } or { variables: { [key]: value } }.
export function historyEntryValue(entry, key) {
  if (entry === null || typeof entry !== 'object') return entry
  if (key && key in entry) return entry[key]
  if (key && entry.variables && key in entry.variables) return entry.variables[key]
  if ('value' in entry) return entry.value
  return undefined
}

// History keys are Unix timestamps — seconds today, but tolerate milliseconds.
export function timestampToDate(ts) {
  const n = Number(ts)
  if (!Number.isFinite(n)) return null
  return new Date(n < 1e12 ? n * 1000 : n)
}

export function formatDateTime(date) {
  if (!date) return '—'
  return date.toLocaleString(undefined, {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

export function formatRelativeTime(date, now = new Date()) {
  if (!date) return '—'
  const secs = Math.round((now - date) / 1000)
  if (secs < 45) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

// "pipeTemp" → "Pipe temp", "depthCm" → "Depth cm", "litres" → "Litres"
export function humanizeKey(key) {
  if (!key) return ''
  const words = String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// Units for one variable: an explicit variableUnits entry, else the sensor's units for the
// primary variable. Other variables have no units unless the caller knows they share them.
export function variableUnit(sensor, key) {
  const own = sensor?.variableUnits?.[key]
  if (own) return own
  return key === primaryVariableKey(sensor) ? sensorUnit(sensor, key) : ''
}
