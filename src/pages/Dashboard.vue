<template>
  <h1>My Dashboard</h1>

  <div v-if="loading" class="centered"><LoadingSpinner /></div>

  <p v-else-if="error" class="card form-error">{{ error }}</p>

  <div v-else-if="!sensorCount" class="card">
    <p class="empty">No sensors are linked to your account yet.</p>
  </div>

  <section v-else class="dashboard-grid">
    <SensorCard v-for="(s, id) in sensors" :key="id" :id="id" :sensor="s" />
  </section>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import SensorCard from '@/components/SensorCard.vue'
import LoadingSpinner from '@/components/LoadingSpinner.vue'
import { useAuthStore } from '@/stores/auth'
import { subscribeAllSensors, subscribeSensorsByIds } from '@/services/sensors'

const auth = useAuthStore()
const sensors = ref({})
const loading = ref(true)
const error = ref('')
const sensorCount = computed(() => Object.keys(sensors.value).length)

let unsub = null

function onError(err) {
  error.value = `Couldn't load sensors: ${err.message}`
  loading.value = false
}

// Admins see every sensor; everyone else only their authorised ones.
// Re-subscribes if the user's role or sensor list changes.
watch(
  () => [auth.isAdmin, auth.authorisedSensorIds.join(',')],
  () => {
    unsub?.()
    loading.value = true
    error.value = ''
    const done = (data) => { sensors.value = data; loading.value = false }
    unsub = auth.isAdmin
      ? subscribeAllSensors(done, onError)
      : subscribeSensorsByIds(auth.authorisedSensorIds, done, onError)
  },
  { immediate: true }
)

onUnmounted(() => unsub?.())
</script>

<style scoped>
.centered { display: flex; justify-content: center; padding: var(--space-8); }
.empty { margin: 0; }

/* Mobile 2 columns, small landscape 3, desktop auto-fit. */
.dashboard-grid {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(2, 1fr);
}
@media (min-width: 600px) {
  .dashboard-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (min-width: 1000px) {
  .dashboard-grid { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
}
</style>
