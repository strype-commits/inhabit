<template>
  <RouterLink :to="`/sensor/${id}`" class="sensor-card" :class="`state-${stale.state}`">
    <div class="top">
      <div class="title">{{ sensor.name || id }}</div>
      <span v-if="stale.state !== 'unknown'" class="status-dot" :title="statusTitle" aria-hidden="true" />
    </div>

    <div class="value">{{ value }}</div>

    <div class="meta">
      <span v-if="sensor.location">{{ sensor.location }}</span>
      <span v-if="sensor.location && sensor.status"> • </span>
      <span v-if="sensor.status">{{ sensor.status }}</span>
    </div>

    <div class="updated">
      <span v-if="stale.state === 'stale'" class="stale-pill">Stale</span>
      <time v-if="lastDate" :datetime="lastDate.toISOString()" :title="formatDateTime(lastDate)">
        {{ formatRelativeTime(lastDate, now) }}
      </time>
      <span v-else>No readings yet</span>
    </div>
  </RouterLink>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { formatSensorValue, formatRelativeTime, formatDateTime } from '@/utils/formatters'
import { lastUpdatedDate, staleness, formatDuration } from '@/utils/sensorConfig'
import { subscribeRecentHistory } from '@/services/sensors'
import { useNow } from '@/composables/useNow'

const props = defineProps({
  id: { type: String, required: true },
  sensor: { type: Object, required: true }
})

const now = useNow()
const latestKey = ref(null)

// Newest history key, used for "last updated" when the sensor node has no timestamp of its own.
let unsub = null
watch(() => props.id, (id) => {
  unsub?.()
  unsub = subscribeRecentHistory(id, 1, (h) => { latestKey.value = Object.keys(h)[0] ?? null }, () => {})
}, { immediate: true })
onUnmounted(() => unsub?.())

// Primary value is chosen by the sensor's `type` metadata, not by variable name.
const value = computed(() => formatSensorValue(props.sensor))
const lastDate = computed(() => lastUpdatedDate(props.sensor, latestKey.value))
const stale = computed(() => staleness(props.sensor, lastDate.value, now.value))
const statusTitle = computed(() => stale.value.state === 'stale'
  ? `No reading for over ${formatDuration(stale.value.thresholdMinutes)}`
  : 'Reporting on schedule')
</script>

<style scoped>
.sensor-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 130px;
  padding: var(--space-4);
  background: var(--color-surface);
  color: var(--color-text);
  border-radius: var(--radius-lg);
  border-left: 4px solid transparent;
  box-shadow: var(--shadow-sm);
  text-decoration: none;
  transition: box-shadow var(--transition-fast);
}
.sensor-card:hover { box-shadow: var(--shadow-md); }
.sensor-card:active { transform: translateY(1px); }

.top { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-2); }
.title { font-size: var(--font-size-sm); opacity: 0.95; }

.status-dot {
  flex: none;
  width: 10px;
  height: 10px;
  margin-top: 4px;
  border-radius: var(--radius-full);
  background: var(--color-success);
}

.value {
  margin-top: var(--space-2);
  font-size: 28px;
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
}
.meta { margin-top: var(--space-2); font-size: var(--font-size-xs); color: var(--color-text-muted); }
.updated {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-1);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

/* Stale: grey accent, dimmed value — distinct from OK (green) and warning (amber). */
.state-stale { border-left-color: var(--color-stale); }
.state-stale .status-dot { background: var(--color-stale); }
.state-stale .value { opacity: 0.55; }
.stale-pill {
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  background: var(--color-stale);
  color: var(--color-surface);
  font-weight: var(--font-weight-semibold);
}
</style>
