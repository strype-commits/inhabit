<template>
  <section class="card">
    <h2 class="card-title">Alerts</h2>

    <!-- Read-only for normal users -->
    <template v-if="!editable">
      <ul class="rule-list">
        <li v-for="r in savedRules" :key="r.id">
          {{ r.label || humanizeKey(r.variable) }} below {{ formatValue(r.below, unitOf(r.variable)) }}
          <span v-if="r.enabled === false" class="text-muted">(off)</span>
        </li>
        <li>Gone quiet: {{ sensor.alertOffline === false ? 'off' : 'on' }}</li>
      </ul>
    </template>

    <!-- Admin editor -->
    <form v-else @submit.prevent="save">
      <p v-if="!rows.length" class="text-muted hint">No threshold alerts yet.</p>

      <div v-for="(r, i) in rows" :key="r.id" class="rule-row">
        <label class="checkbox" :title="r.enabled ? 'On' : 'Off'">
          <input v-model="r.enabled" type="checkbox" :aria-label="`Alert ${i + 1} on`" />
        </label>
        <input v-model.trim="r.label" class="form-input label-input" type="text" placeholder="Label, e.g. Oil level"
               :aria-label="`Alert ${i + 1} label`" />
        <select v-model="r.variable" class="form-input" :aria-label="`Alert ${i + 1} reading`">
          <option v-for="k in allKeys" :key="k" :value="k">{{ humanizeKey(k) }}</option>
        </select>
        <span class="below">below</span>
        <input v-model="r.below" class="form-input num-input" type="number" step="any" required
               :aria-label="`Alert ${i + 1} threshold`" />
        <span v-if="activeState[r.id]?.active" class="badge-active" title="This alert is currently raised">Active</span>
        <button type="button" class="btn btn-ghost btn-sm" :aria-label="`Remove alert ${i + 1}`" @click="rows.splice(i, 1)">✕</button>
      </div>

      <button type="button" class="btn btn-secondary btn-sm" :disabled="!allKeys.length" @click="addRule">Add alert</button>

      <label class="checkbox offline">
        <input v-model="offline" type="checkbox" />
        Alert when this sensor goes quiet (misses its reports)
        <span v-if="activeState.offline?.active" class="badge-active">Active</span>
      </label>
      <span class="form-hint">Alerts go to everyone who can see this sensor, once when raised and once when cleared.</span>

      <p v-if="error" class="form-error">{{ error }}</p>
      <div class="actions">
        <button type="button" class="btn btn-ghost btn-sm" :disabled="!dirty || busy" @click="reset">Cancel</button>
        <button type="submit" class="btn btn-primary btn-sm" :disabled="!dirty || busy">{{ busy ? 'Saving…' : 'Save' }}</button>
      </div>
    </form>
  </section>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { ref as dbRef, onValue } from 'firebase/database'
import { db } from '@/services/firebase'
import { updateSensorParameters } from '@/services/sensors'
import { useToastStore } from '@/stores/toast'
import { humanizeKey, formatValue, variableUnit } from '@/utils/formatters'
import { orderedVariableKeys, graphVariableKeys } from '@/utils/sensorConfig'

const props = defineProps({
  id: { type: String, required: true },
  sensor: { type: Object, required: true },
  editable: { type: Boolean, default: false }
})

const toast = useToastStore()
const rows = ref([])
const offline = ref(true)
const busy = ref(false)
const error = ref('')
const activeState = ref({})

const allKeys = computed(() => orderedVariableKeys(props.sensor))
const savedRules = computed(() =>
  Object.entries(props.sensor?.alerts || {}).map(([id, r]) => ({ id, ...r })))
const unitOf = (key) => variableUnit(props.sensor, key)
  || (graphVariableKeys(props.sensor).includes(key) ? (props.sensor?.units || '') : '')

function snapshot() {
  return JSON.stringify({ rows: rows.value.map(normalise), offline: offline.value })
}
function normalise(r) {
  return { id: r.id, variable: r.variable, below: Number(r.below), label: r.label || '', enabled: r.enabled !== false }
}

let savedSnapshot = ''
function reset() {
  rows.value = savedRules.value.map((r) => ({ ...r, label: r.label || '', enabled: r.enabled !== false }))
  offline.value = props.sensor?.alertOffline !== false
  savedSnapshot = snapshot()
  error.value = ''
}
const dirty = computed(() => snapshot() !== savedSnapshot)

reset()
watch(() => [props.sensor?.alerts, props.sensor?.alertOffline], (next, prev) => {
  if (JSON.stringify(next) !== JSON.stringify(prev) && !busy.value) reset()
}, { deep: true })

function addRule() {
  rows.value.push({
    id: `rule-${Date.now().toString(36)}`,
    variable: allKeys.value[0],
    below: '',
    label: '',
    enabled: true
  })
}

async function save() {
  error.value = ''
  const alerts = {}
  for (const r of rows.value.map(normalise)) {
    if (!r.variable || !Number.isFinite(r.below)) return (error.value = 'Each alert needs a reading and a threshold.')
    alerts[r.id] = { variable: r.variable, below: r.below, enabled: r.enabled, ...(r.label ? { label: r.label } : {}) }
  }
  busy.value = true
  try {
    await updateSensorParameters(props.id, {
      alerts: Object.keys(alerts).length ? alerts : null,
      alertOffline: offline.value ? null : false   // default on; store only the opt-out
    })
    savedSnapshot = snapshot()
    toast.success('Alerts saved')
  } catch (err) {
    error.value = `Couldn't save: ${err.message}`
  } finally {
    busy.value = false
  }
}

// Which alerts are currently raised (admins only; readable per database rules).
let unsubState = null
watch(() => [props.id, props.editable], ([id, editable]) => {
  unsubState?.()
  unsubState = null
  activeState.value = {}
  if (editable) {
    unsubState = onValue(dbRef(db, `alertState/${id}`), (snap) => { activeState.value = snap.val() || {} }, () => {})
  }
}, { immediate: true })
onUnmounted(() => unsubState?.())
</script>

<style scoped>
.hint { margin: 0 0 var(--space-3); font-size: var(--font-size-sm); }
.rule-list { margin: 0; padding-left: var(--space-5); font-size: var(--font-size-sm); display: flex; flex-direction: column; gap: var(--space-1); }

.rule-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.rule-row .form-input { width: auto; }
.label-input { flex: 1 1 140px; }
.num-input { width: 90px !important; }
.below { font-size: var(--font-size-sm); color: var(--color-text-muted); }

.checkbox { display: flex; align-items: center; gap: var(--space-2); font-size: var(--font-size-sm); cursor: pointer; }
.checkbox input { width: 18px; height: 18px; accent-color: var(--color-accent-1); }
.offline { margin-top: var(--space-4); }

.badge-active {
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  background: var(--color-warning);
  color: var(--color-surface);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.actions { display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-4); }
</style>
