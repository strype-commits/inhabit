<template>
  <div v-if="notFound" class="card">
    <p>Sensor "{{ id }}" wasn't found, or you don't have access to it.</p>
    <RouterLink to="/" class="btn btn-secondary btn-sm">Back to dashboard</RouterLink>
  </div>

  <div v-else-if="!sensor" class="centered"><LoadingSpinner /></div>

  <template v-else>
    <h1>{{ sensor.name || id }}</h1>

    <section class="card" :class="`state-${stale.state}`">
      <div class="headline-row">
        <div class="headline">{{ headline }}</div>
        <span v-if="stale.state === 'stale'" class="stale-pill">Stale</span>
      </div>
      <dl class="facts">
        <template v-if="sensor.location"><dt>Location</dt><dd>{{ sensor.location }}</dd></template>
        <template v-if="sensor.status"><dt>Status</dt><dd>{{ sensor.status }}</dd></template>
        <template v-if="sensor.type"><dt>Type</dt><dd>{{ sensor.type }}</dd></template>
        <dt>Last updated</dt>
        <dd>
          <template v-if="lastDate">{{ formatRelativeTime(lastDate, now) }} · {{ formatDateTime(lastDate) }}</template>
          <template v-else>No readings yet</template>
        </dd>
        <template v-if="nextDate">
          <dt>Next expected</dt>
          <dd :class="{ overdue: nextDate < now }">
            {{ formatDateTime(nextDate) }}<template v-if="nextDate < now"> (overdue)</template>
          </dd>
        </template>
        <template v-if="sensor.firmware"><dt>Firmware</dt><dd>{{ sensor.firmware }}</dd></template>
        <template v-if="sensor.rssi != null"><dt>WiFi signal</dt><dd>{{ sensor.rssi }} dBm ({{ signalLabel(sensor.rssi) }})</dd></template>
        <template v-if="bootDate"><dt>Last restart</dt><dd>{{ formatDateTime(bootDate) }}</dd></template>
      </dl>
    </section>

    <section v-if="otherVariables.length" class="card">
      <h2 class="card-title">Other values</h2>
      <dl class="facts">
        <template v-for="v in otherVariables" :key="v.key">
          <dt>{{ humanizeKey(v.key) }}</dt><dd>{{ v.value }}</dd>
        </template>
      </dl>
    </section>

    <section v-if="params.showHistory" class="card">
      <div class="history-head">
        <h2 class="card-title">History</h2>
        <div class="range-picker" role="group" aria-label="Graph time range">
          <button v-for="r in CHART_RANGES" :key="r.id" type="button" class="range-btn"
                  :class="{ active: rangeId === r.id }" :aria-pressed="rangeId === r.id" @click="setRange(r.id)">
            {{ r.label }}
          </button>
        </div>
      </div>
      <p v-if="!chartSeries.some((s) => s.points.length)" class="text-muted">
        No readings in the last {{ selectedRange.label.toLowerCase() }}.
      </p>
      <SensorChart v-else :series="chartSeries" :unit="axisUnit" :x-min="windowStartMs" :x-max="windowEndMs" />
      <p v-if="windowTruncated" class="form-hint">Showing the most recent {{ MAX_CHART_POINTS }} readings.</p>
    </section>

    <section class="card">
      <h2 class="card-title">Recent readings</h2>
      <p v-if="!readings.length" class="text-muted">No history recorded yet.</p>
      <table v-else class="readings">
        <thead>
          <tr>
            <th>Time</th><th>Interval</th>
            <th v-for="k in graphKeys" :key="k">{{ graphKeys.length > 1 ? humanizeKey(k) : 'Value' }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in readings" :key="r.ts">
            <td :title="r.date?.toISOString()">{{ formatDateTime(r.date) }}</td>
            <td class="text-muted" :class="{ 'interval-late': r.late }">{{ r.interval }}</td>
            <td v-for="(v, i) in r.values" :key="graphKeys[i]">{{ v }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <SensorAlerts :id="id" :sensor="sensor" :editable="auth.isAdmin" />
    <SensorParameters :id="id" :sensor="sensor" :editable="auth.isAdmin" />
  </template>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import LoadingSpinner from '@/components/LoadingSpinner.vue'
import SensorChart from '@/components/SensorChart.vue'
import SensorParameters from '@/components/SensorParameters.vue'
import SensorAlerts from '@/components/SensorAlerts.vue'
import { useAuthStore } from '@/stores/auth'
import { useNow } from '@/composables/useNow'
import { subscribeSensor, subscribeRecentHistory, subscribeHistorySince } from '@/services/sensors'
import {
  primaryVariableKey, sensorUnit, formatValue, formatSensorValue,
  historyEntryValue, timestampToDate, formatDateTime, formatRelativeTime, humanizeKey, variableUnit
} from '@/utils/formatters'
import {
  sensorParams, lastUpdatedDate, nextExpectedDate, staleness, formatDuration,
  graphVariableKeys, colorSlot
} from '@/utils/sensorConfig'
import { downsample } from '@/utils/downsample'

const RECENT_READINGS = 12
const MAX_CHART_POINTS = 20000   // readings fetched for the graph window
const MAX_PLOTTED_POINTS = 8000  // per series; above this, averaged for drawing (only legacy minute-level data)
const CHART_RANGES = [
  { id: '24h', label: 'Day', days: 1 },
  { id: '7d', label: 'Week', days: 7 },
  { id: '30d', label: 'Month', days: 30 },
  { id: '1y', label: 'Year', days: 365 }
]

const props = defineProps({
  id: { type: String, required: true }
})

const auth = useAuthStore()
const now = useNow()
const sensor = ref(null)
const recent = ref({})
const windowHistory = ref({})
const notFound = ref(false)

let unsubs = []
let unsubWindow = null
function unsubscribeAll() {
  unsubs.forEach((u) => u())
  unsubs = []
  unsubWindow?.()
  unsubWindow = null
}

// Re-subscribe whenever the route id changes (e.g. sensor → sensor navigation).
watch(() => props.id, (id) => {
  unsubscribeAll()
  sensor.value = null
  recent.value = {}
  windowHistory.value = {}
  notFound.value = false

  // Client-side courtesy check; database.rules.json is the real enforcement.
  if (!auth.isAdmin && !auth.authorisedSensorIds.includes(id)) {
    notFound.value = true
    return
  }

  const fail = () => { notFound.value = true }
  unsubs.push(subscribeSensor(id, (s) => {
    sensor.value = s
    notFound.value = !s
  }, fail))
  unsubs.push(subscribeRecentHistory(id, RECENT_READINGS, (h) => { recent.value = h }, () => {}))
}, { immediate: true })

onUnmounted(unsubscribeAll)

const params = computed(() => sensorParams(sensor.value))
const primaryKey = computed(() => primaryVariableKey(sensor.value))
const unit = computed(() => sensorUnit(sensor.value, primaryKey.value))
const headline = computed(() => formatSensorValue(sensor.value))

// History keys may be seconds or milliseconds; detect from the newest key.
const newestKey = computed(() => Object.keys(recent.value).sort().at(-1) ?? null)
const keysInMs = computed(() => Number(newestKey.value) > 1e12)

// Graph time range, remembered per browser.
const RANGE_KEY = 'inhabit:chartRange'
const rangeId = ref(readStoredRange())
const selectedRange = computed(() => CHART_RANGES.find((r) => r.id === rangeId.value) ?? CHART_RANGES[1])

function readStoredRange() {
  try {
    const stored = localStorage.getItem(RANGE_KEY)
    return CHART_RANGES.some((r) => r.id === stored) ? stored : '7d'
  } catch { return '7d' }
}

function setRange(id) {
  rangeId.value = id
  try { localStorage.setItem(RANGE_KEY, id) } catch { /* private mode */ }
}

// Graph window: the selected range back from now. Subscribed once we know the key units,
// and re-subscribed only when the range or units change.
const windowStartMs = ref(null)
const windowEndMs = ref(null)
watch(
  () => [props.id, params.value.showHistory, selectedRange.value.days, newestKey.value !== null, keysInMs.value],
  ([id, show, days, haveKeys, ms], old) => {
    if (old && old[0] === id && old[1] === show && old[2] === days && old[3] === haveKeys && old[4] === ms) return
    unsubWindow?.()
    unsubWindow = null
    windowHistory.value = {}
    if (!show || !haveKeys || notFound.value) return
    windowEndMs.value = Date.now()
    windowStartMs.value = windowEndMs.value - days * 86400000
    const startKey = ms ? windowStartMs.value : Math.floor(windowStartMs.value / 1000)
    unsubWindow = subscribeHistorySince(id, startKey, MAX_CHART_POINTS, (h) => {
      windowHistory.value = h
      windowEndMs.value = Math.max(Date.now(), windowEndMs.value)
    }, () => {})
  }
)

// Variables to plot (sensor's graphVariables, default the primary), each with a fixed colour.
const graphKeys = computed(() => graphVariableKeys(sensor.value))

// Units per variable: explicit variableUnits, else the sensor's units for the primary; sensors
// without variableUnits (e.g. the loft) share their units across every graphed variable.
function keyUnit(key) {
  const own = variableUnit(sensor.value, key)
  if (own) return own
  return !sensor.value?.variableUnits && graphKeys.value.includes(key) ? unit.value : ''
}
// One axis: labelled with the units only if every plotted series shares them.
const axisUnit = computed(() => {
  const units = new Set(graphKeys.value.map(keyUnit))
  return units.size === 1 ? [...units][0] : ''
})

const chartSeries = computed(() => {
  const entries = Object.entries(windowHistory.value)
    .map(([ts, entry]) => [timestampToDate(ts)?.getTime(), entry])
    .filter(([x]) => Number.isFinite(x))
    .sort((a, b) => a[0] - b[0])
  const raw = graphKeys.value.map((key) => ({
    key,
    points: entries
      .map(([x, entry]) => ({ x, y: Number(historyEntryValue(entry, key)) }))
      .filter((p) => Number.isFinite(p.y))
  }))
  // Average all series or none, on window-aligned buckets, so hovers line up across traces.
  const average = raw.some((s) => s.points.length > MAX_PLOTTED_POINTS)
  return raw.map((s) => ({
    key: s.key,
    label: humanizeKey(s.key),
    colorSlot: colorSlot(sensor.value, s.key),
    points: average
      ? downsample(s.points, MAX_PLOTTED_POINTS, windowStartMs.value, windowEndMs.value, true)
      : s.points
  }))
})
const windowTruncated = computed(() => Object.keys(windowHistory.value).length >= MAX_CHART_POINTS)

const lastDate = computed(() => lastUpdatedDate(sensor.value, newestKey.value))
const nextDate = computed(() => nextExpectedDate(sensor.value))
const bootDate = computed(() => timestampToDate(sensor.value?.bootedAt))

function signalLabel(rssi) {
  if (rssi >= -60) return 'strong'
  if (rssi >= -70) return 'good'
  if (rssi >= -80) return 'fair'
  return 'weak'
}
const stale = computed(() => staleness(sensor.value, lastDate.value, now.value))

const otherVariables = computed(() =>
  Object.entries(sensor.value?.variables || {})
    .filter(([key]) => key !== primaryKey.value)
    .map(([key, value]) => ({
      key,
      value: formatValue(value, keyUnit(key))
    })))

// Newest first, with the gap since the previous reading. Gaps beyond the stale
// threshold are highlighted so missed readings stand out.
const readings = computed(() => {
  const threshold = stale.value.thresholdMinutes
  const rows = Object.entries(recent.value)
    .map(([ts, entry]) => ({
      ts,
      date: timestampToDate(ts),
      values: graphKeys.value.map((k) => formatValue(historyEntryValue(entry, k), keyUnit(k)))
    }))
    .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0))
  return rows
    .map((r, i) => {
      const prev = rows[i - 1]
      const gap = prev?.date && r.date ? r.date - prev.date : null
      return {
        ...r,
        interval: gap === null ? '—' : formatDuration(gap / 60000),
        late: gap !== null && threshold !== null && gap / 60000 > threshold
      }
    })
    .reverse()
})
</script>

<style scoped>
.centered { display: flex; justify-content: center; padding: var(--space-8); }

.headline-row { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); }
.headline {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
}
.state-stale { border-left: 4px solid var(--color-stale); }
.state-stale .headline { opacity: 0.55; }
.stale-pill {
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  background: var(--color-stale);
  color: var(--color-surface);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.history-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.history-head .card-title { margin: 0; }
.range-picker {
  display: inline-flex;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  overflow: hidden;
}
.range-btn {
  padding: var(--space-1) var(--space-3);
  border: none;
  background: none;
  color: var(--color-text-muted);
  font: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;
}
.range-btn + .range-btn { border-left: 1px solid var(--color-border); }
.range-btn.active { background: var(--color-accent-1); color: var(--color-text-on-accent); }

.facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-1) var(--space-4);
  margin: 0;
  font-size: var(--font-size-sm);
}
.facts dt { color: var(--color-text-muted); text-transform: capitalize; }
.facts dd { margin: 0; }

.readings {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
  font-variant-numeric: tabular-nums;
}
.readings th {
  text-align: left;
  font-weight: var(--font-weight-medium);
  color: var(--color-text-muted);
  border-bottom: 1px solid var(--color-border);
  padding: var(--space-2) var(--space-2) var(--space-2) 0;
}
.readings td { padding: var(--space-2) var(--space-2) var(--space-2) 0; border-bottom: 1px solid var(--color-border); }
.readings tr:last-child td { border-bottom: none; }
.readings td:last-child, .readings th:last-child { text-align: right; padding-right: 0; }
.overdue { color: var(--color-warning); }
.interval-late { color: var(--color-warning); font-weight: var(--font-weight-semibold); }
</style>
