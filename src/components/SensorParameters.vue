<template>
  <section class="card">
    <h2 class="card-title">Sensor parameters</h2>

    <!-- Read-only view for normal users -->
    <p v-if="deviceInterval" class="device-note">
      This device reports every {{ formatDuration(deviceInterval) }} (from its <code>nextUpdate</code>),
      which is used for staleness ahead of the expected frequency below.
    </p>

    <dl v-if="!editable" class="facts">
      <dt>Displayed value</dt>
      <dd>{{ displayedKey || '—' }}</dd>
      <dt>Expected reading every</dt>
      <dd>{{ current.expectedFrequencyMinutes ? formatDuration(current.expectedFrequencyMinutes) : 'Not set' }}</dd>
      <dt>Stale after</dt>
      <dd>{{ staleText }}</dd>
      <dt>History kept for</dt>
      <dd>{{ current.retentionDays ? `${current.retentionDays} days` : 'Kept indefinitely' }}</dd>
      <dt>History graph</dt>
      <dd>{{ current.showHistory ? 'Shown' : 'Hidden' }}</dd>
    </dl>

    <!-- Admin edit form -->
    <form v-else @submit.prevent="save">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label" :for="`primary-${id}`">Displayed value</label>
          <select :id="`primary-${id}`" v-model="form.primaryVariable" class="form-input">
            <option value="">Automatic ({{ autoKey || 'none' }})</option>
            <option v-for="k in variableKeys" :key="k" :value="k">{{ k }}</option>
          </select>
          <span class="form-hint">Which reading the dashboard and graph show.</span>
        </div>

        <div class="form-group">
          <label class="form-label" :for="`freq-${id}`">Expected reading every (min)</label>
          <input :id="`freq-${id}`" v-model="form.expectedFrequencyMinutes" class="form-input"
                 type="number" inputmode="decimal" min="0.1" step="any" placeholder="Not set" />
          <span class="form-hint">{{ deviceInterval ? "Fallback if the device stops sending nextUpdate." : 'Leave blank to turn off staleness checks.' }}</span>
        </div>

        <div class="form-group">
          <label class="form-label" :for="`mult-${id}`">Stale after (× expected)</label>
          <input :id="`mult-${id}`" v-model="form.staleAfterMultiplier" class="form-input"
                 type="number" inputmode="decimal" min="1" step="0.5" required />
          <span class="form-hint">{{ staleText }}</span>
        </div>

        <div class="form-group">
          <label class="form-label" :for="`ret-${id}`">Keep history for (days)</label>
          <input :id="`ret-${id}`" v-model="form.retentionDays" class="form-input"
                 type="number" inputmode="numeric" min="1" max="3650" step="1" placeholder="Keep all" />
          <span class="form-hint">Older readings are deleted daily. Leave blank to keep everything.</span>
        </div>
      </div>

      <label class="checkbox">
        <input v-model="form.showHistory" type="checkbox" />
        Show history graph
      </label>

      <p v-if="error" class="form-error">{{ error }}</p>

      <div class="actions">
        <button type="button" class="btn btn-ghost btn-sm" :disabled="!dirty || busy" @click="reset">Cancel</button>
        <button type="submit" class="btn btn-primary btn-sm" :disabled="!dirty || busy">
          {{ busy ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </form>
  </section>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { sensorParams, deviceIntervalMinutes, formatDuration } from '@/utils/sensorConfig'
import { primaryVariableKey } from '@/utils/formatters'
import { updateSensorParameters } from '@/services/sensors'
import { useToastStore } from '@/stores/toast'

const props = defineProps({
  id: { type: String, required: true },
  sensor: { type: Object, required: true },
  editable: { type: Boolean, default: false }
})

const toast = useToastStore()
const current = computed(() => sensorParams(props.sensor))
const deviceInterval = computed(() => deviceIntervalMinutes(props.sensor))
const variableKeys = computed(() => Object.keys(props.sensor?.variables || {}))
const displayedKey = computed(() => primaryVariableKey(props.sensor))
// What "Automatic" would pick if primaryVariable were cleared.
const autoKey = computed(() => primaryVariableKey({ ...props.sensor, primaryVariable: undefined }))
const savedPrimary = computed(() => props.sensor?.primaryVariable ?? '')

const form = reactive({})
const busy = ref(false)
const error = ref('')

function reset() {
  const p = current.value
  form.primaryVariable = savedPrimary.value
  form.expectedFrequencyMinutes = p.expectedFrequencyMinutes ?? ''
  form.staleAfterMultiplier = p.staleAfterMultiplier
  form.retentionDays = p.retentionDays ?? ''
  form.showHistory = p.showHistory
  error.value = ''
}
const dirty = computed(() => {
  const p = current.value
  return form.primaryVariable !== savedPrimary.value
    || String(form.expectedFrequencyMinutes ?? '') !== String(p.expectedFrequencyMinutes ?? '')
    || Number(form.staleAfterMultiplier) !== p.staleAfterMultiplier
    || String(form.retentionDays ?? '') !== String(p.retentionDays ?? '')
    || form.showHistory !== p.showHistory
})

reset()
// Pick up changes made elsewhere, unless mid-edit.
watch(() => [current.value, savedPrimary.value], (next, prev) => {
  if (JSON.stringify(next) !== JSON.stringify(prev) && !busy.value) reset()
})

const staleText = computed(() => {
  const freq = deviceInterval.value
    ?? Number(props.editable ? form.expectedFrequencyMinutes : current.value.expectedFrequencyMinutes)
  const mult = Number(props.editable ? form.staleAfterMultiplier : current.value.staleAfterMultiplier)
  if (!freq || !mult) return 'Staleness not checked'
  return `Stale after ${formatDuration(freq * mult)} without a reading`
})

async function save() {
  error.value = ''
  const freq = form.expectedFrequencyMinutes === '' ? null : Number(form.expectedFrequencyMinutes)
  const mult = Number(form.staleAfterMultiplier)
  const days = form.retentionDays === '' ? null : Number(form.retentionDays)

  if (freq !== null && !(freq > 0)) return (error.value = 'Expected frequency must be more than 0.')
  if (!(mult >= 1)) return (error.value = 'Stale multiplier must be at least 1.')
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 3650)) return (error.value = 'Retention must be 1–3650 whole days.')

  busy.value = true
  try {
    await updateSensorParameters(props.id, {
      primaryVariable: form.primaryVariable || null, // null → automatic
      expectedFrequencyMinutes: freq, // null removes the field
      staleAfterMultiplier: mult,
      retentionDays: days, // null removes the field
      showHistory: form.showHistory
    })
    toast.success('Sensor parameters saved')
  } catch (err) {
    error.value = `Couldn't save: ${err.message}`
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.device-note { margin: 0 0 var(--space-3); font-size: var(--font-size-sm); color: var(--color-text-muted); }

.facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-1) var(--space-4);
  margin: 0;
  font-size: var(--font-size-sm);
}
.facts dt { color: var(--color-text-muted); }
.facts dd { margin: 0; }

.form-row {
  display: grid;
  gap: 0 var(--space-4);
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.checkbox {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  cursor: pointer;
}
.checkbox input { width: 18px; height: 18px; accent-color: var(--color-accent-1); }

.actions { display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-4); }
</style>
