<template>
  <h1>Admin</h1>

  <div class="tabs" role="tablist">
    <button v-for="t in tabs" :key="t.id" role="tab" class="tab" :class="{ active: tab === t.id }"
            :aria-selected="tab === t.id" @click="tab = t.id">
      {{ t.label }}
    </button>
  </div>

  <p v-if="error" class="card form-error">{{ error }}</p>

  <!-- ===== Users ===== -->
  <template v-if="tab === 'users'">
    <div class="summary">
      <div v-for="s in roleSummary" :key="s.role" class="card summary-card">
        <div class="summary-count">{{ s.count }}</div>
        <div class="text-muted">{{ s.label }}</div>
      </div>
    </div>

    <input v-model.trim="search" class="form-input search" type="search" placeholder="Search by name or email" />

    <section v-for="u in filteredUsers" :key="u.uid" class="card user-row">
      <div class="user-main">
        <div>
          <div class="user-name">
            {{ u.username || '(no name)' }}
            <span v-if="u.uid === auth.user?.uid" class="badge">You</span>
            <span v-if="u.isDeveloper" class="badge" title="Set in the Firebase console only">Developer</span>
          </div>
          <div class="text-muted user-email">{{ u.email || u.uid }}</div>
        </div>

        <div class="user-controls">
          <select v-if="isAssignable(u)" class="form-input role-select" :value="u.role || 'user'"
                  :disabled="u.uid === auth.user?.uid || busy[u.uid]" :aria-label="`Role for ${u.username || u.email}`"
                  @change="changeRole(u, $event.target.value)">
            <option v-for="r in ASSIGNABLE_ROLES" :key="r" :value="r">{{ roleLabel(r) }}</option>
          </select>
          <span v-else class="badge badge-fixed">{{ roleLabel(u.role) }}</span>

          <button v-if="u.role !== 'device'" class="btn btn-ghost btn-sm" :aria-expanded="expanded === u.uid"
                  @click="expanded = expanded === u.uid ? null : u.uid">
            Sensors ({{ Object.keys(u.sensors || {}).length }})
          </button>
        </div>
      </div>

      <div v-if="expanded === u.uid" class="sensor-access">
        <p v-if="isAdminRole(u)" class="text-muted">Admins see every sensor; these only apply if the role changes.</p>
        <label v-for="(s, id) in sensors" :key="id" class="checkbox">
          <input type="checkbox" :checked="!!u.sensors?.[id]" :disabled="busy[u.uid]"
                 @change="toggleSensor(u, id, $event.target.checked)" />
          {{ s.name || id }} <span class="text-muted">· {{ s.location || id }}</span>
        </label>
      </div>
    </section>

    <p v-if="!filteredUsers.length" class="text-muted">No users match.</p>
  </template>

  <!-- ===== Sensors ===== -->
  <template v-if="tab === 'sensors'">
    <section v-for="s in sensorRows" :key="s.id" class="card">
      <div class="sensor-head">
        <RouterLink :to="`/sensor/${s.id}`" class="sensor-name">{{ s.name }}</RouterLink>
        <span class="badge" :class="`status-${s.statusClass}`">{{ s.status || 'unknown' }}</span>
      </div>
      <dl class="facts">
        <dt>ID</dt><dd>{{ s.id }}</dd>
        <dt>Last report</dt>
        <dd>{{ s.lastDate ? `${formatRelativeTime(s.lastDate, now)} · ${formatDateTime(s.lastDate)}` : '—' }}</dd>
        <dt>Firmware</dt>
        <dd>
          {{ s.firmware || 'Legacy (no version reported)' }}
          <span v-if="s.latest && s.outdated" class="outdated">· {{ s.latest }} available</span>
          <span v-else-if="s.latest" class="text-muted">· up to date</span>
        </dd>
        <template v-if="s.rssi != null"><dt>WiFi signal</dt><dd>{{ s.rssi }} dBm</dd></template>
      </dl>
      <div v-if="s.updatable" class="sensor-actions">
        <span v-if="s.checkPending" class="text-muted">Update check requested — runs after the next report.</span>
        <button v-else class="btn btn-secondary btn-sm" :disabled="busy[s.id]" @click="requestUpdate(s)">
          Update firmware now
        </button>
      </div>
    </section>
  </template>
</template>

<script setup>
import { ref, reactive, computed, watch, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { useNow } from '@/composables/useNow'
import { subscribeAllSensors } from '@/services/sensors'
import {
  ASSIGNABLE_ROLES, subscribeUsers, subscribeCommands, setUserRole, setUserSensorAccess,
  requestFirmwareCheck, parseFirmware, fetchLatestFirmware, isOlderVersion
} from '@/services/admin'
import { formatRelativeTime, formatDateTime } from '@/utils/formatters'
import { lastUpdatedDate } from '@/utils/sensorConfig'

const auth = useAuthStore()
const toast = useToastStore()
const now = useNow()

const tabs = [{ id: 'users', label: 'Users' }, { id: 'sensors', label: 'Sensors' }]
const tab = ref('users')
const users = ref({})
const sensors = ref({})
const commands = ref({})
const latestByChannel = ref({})
const search = ref('')
const expanded = ref(null)
const busy = reactive({})
const error = ref('')

const onError = (err) => { error.value = `Couldn't load admin data: ${err.message}` }
const unsubs = [
  subscribeUsers((u) => { users.value = u }, onError),
  subscribeAllSensors((s) => { sensors.value = s }, onError),
  subscribeCommands((c) => { commands.value = c }, onError)
]
onUnmounted(() => unsubs.forEach((u) => u()))

const ROLE_LABELS = { user: 'User', admin: 'Admin', master: 'Admin (master)', device: 'Device' }
const roleLabel = (r) => ROLE_LABELS[r || 'user'] || r
const isAdminRole = (u) => u.role === 'admin' || u.role === 'master'
// Only plain user/admin roles are editable here; device and legacy master stay console-managed.
const isAssignable = (u) => ASSIGNABLE_ROLES.includes(u.role || 'user')

const userList = computed(() =>
  Object.entries(users.value)
    .map(([uid, p]) => ({ uid, ...p }))
    .sort((a, b) => (a.username || a.email || '').localeCompare(b.username || b.email || '')))

const filteredUsers = computed(() => {
  const q = search.value.toLowerCase()
  if (!q) return userList.value
  return userList.value.filter((u) =>
    (u.username || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
})

const roleSummary = computed(() => {
  const counts = { admin: 0, user: 0, device: 0 }
  for (const u of userList.value) {
    const key = isAdminRole(u) ? 'admin' : u.role === 'device' ? 'device' : 'user'
    counts[key]++
  }
  return [
    { role: 'admin', label: 'Admins', count: counts.admin },
    { role: 'user', label: 'Users', count: counts.user },
    { role: 'device', label: 'Devices', count: counts.device }
  ]
})

async function withBusy(key, fn, success) {
  busy[key] = true
  try {
    await fn()
    if (success) toast.success(success)
  } catch (err) {
    toast.error(`Couldn't save: ${err.message}`)
  } finally {
    busy[key] = false
  }
}

function changeRole(u, role) {
  withBusy(u.uid, () => setUserRole(u.uid, role), `${u.username || u.email} is now ${roleLabel(role)}`)
}

function toggleSensor(u, sensorId, allowed) {
  withBusy(u.uid, () => setUserSensorAccess(u.uid, sensorId, allowed))
}

function requestUpdate(s) {
  withBusy(s.id, () => requestFirmwareCheck(s.id), `${s.name} will check for firmware after its next report`)
}

// Latest published firmware per channel, fetched once per channel seen.
watch(sensors, async (all) => {
  const channels = new Set(Object.values(all).map((s) => parseFirmware(s.firmware)?.channel).filter(Boolean))
  for (const ch of channels) {
    if (ch in latestByChannel.value) continue
    latestByChannel.value = { ...latestByChannel.value, [ch]: null }
    const m = await fetchLatestFirmware(ch)
    latestByChannel.value = { ...latestByChannel.value, [ch]: m?.version ?? null }
  }
})

const STATUS_CLASS = { ok: 'ok', 'sensor-error': 'error', 'update-failed': 'error', updating: 'warn' }

const sensorRows = computed(() =>
  Object.entries(sensors.value)
    .map(([id, s]) => {
      const fw = parseFirmware(s.firmware)
      const latest = fw ? latestByChannel.value[fw.channel] : null
      return {
        id,
        name: s.name || id,
        status: s.status,
        statusClass: STATUS_CLASS[s.status] || 'neutral',
        firmware: s.firmware,
        latest,
        outdated: !!(fw && latest && isOlderVersion(fw.version, latest)),
        updatable: !!fw,  // only boards on OTA-capable firmware report a version
        checkPending: !!commands.value[id]?.checkUpdate,
        rssi: s.rssi,
        lastDate: lastUpdatedDate(s)
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name)))
</script>

<style scoped>
.tabs { display: flex; gap: var(--space-2); margin-bottom: var(--space-4); }
.tab {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}
.tab.active { background: var(--color-accent-1); border-color: var(--color-accent-1); color: var(--color-text-on-accent); }

.summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3); margin-bottom: var(--space-4); }
.summary-card { text-align: center; margin: 0 !important; }
.summary-count { font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); }

.search { margin-bottom: var(--space-4); background: var(--color-surface); }

.user-main { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--space-3); }
.user-name { font-weight: var(--font-weight-semibold); display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.user-email { font-size: var(--font-size-sm); overflow-wrap: anywhere; }
.user-controls { display: flex; align-items: center; gap: var(--space-2); }
.role-select { width: auto; }

.sensor-access {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.sensor-access p { margin: 0; font-size: var(--font-size-sm); }

.checkbox { display: flex; align-items: center; gap: var(--space-2); font-size: var(--font-size-sm); cursor: pointer; }
.checkbox input { width: 18px; height: 18px; accent-color: var(--color-accent-1); }

.badge {
  display: inline-block;
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  background: var(--color-surface-raised);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}
.badge-fixed { padding: var(--space-1) var(--space-3); }
.status-ok { background: var(--color-success); color: var(--color-text-on-accent); }
.status-error { background: var(--color-critical); color: var(--color-text-on-accent); }
.status-warn { background: var(--color-warning); color: var(--color-text-on-accent); }

.sensor-head { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3); }
.sensor-name { font-weight: var(--font-weight-semibold); color: var(--color-text); }

.facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-1) var(--space-4);
  margin: 0;
  font-size: var(--font-size-sm);
}
.facts dt { color: var(--color-text-muted); }
.facts dd { margin: 0; overflow-wrap: anywhere; }
.outdated { color: var(--color-warning); font-weight: var(--font-weight-semibold); }

.sensor-actions { margin-top: var(--space-3); display: flex; justify-content: flex-end; font-size: var(--font-size-sm); }
</style>
