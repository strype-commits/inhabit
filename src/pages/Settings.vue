<template>
  <h1>Settings</h1>

  <section class="card">
    <h2 class="card-title">Account</h2>
    <dl class="facts">
      <dt>Name</dt><dd>{{ auth.displayName }}</dd>
      <dt>Email</dt><dd>{{ auth.user?.email }}</dd>
      <dt>Role</dt><dd>{{ auth.isAdmin ? 'Admin' : 'User' }}</dd>
    </dl>
  </section>

  <section class="card">
    <h2 class="card-title">Alerts</h2>
    <p class="text-muted hint">
      You'll get alerts for the sensors you can see: low levels, frost and sensors that go quiet.
      They always appear under the bell; email is optional.
    </p>
    <label class="checkbox">
      <input type="checkbox" :checked="emailAlerts" :disabled="saving" @change="toggleEmail($event.target.checked)" />
      Email me alerts at {{ auth.user?.email }}
    </label>

    <div class="push">
      <label class="checkbox">
        <input type="checkbox" :checked="pushOn" :disabled="pushBusy || permission === 'unsupported'"
               @change="togglePush($event.target.checked)" />
        Push notifications on this device
      </label>
      <p class="form-hint">{{ pushHint }}</p>
      <button v-if="pushOn" class="btn btn-secondary btn-sm" :disabled="pushBusy" @click="testPush">
        Send a test notification
      </button>
    </div>
  </section>

  <section class="card">
    <h2 class="card-title">Appearance</h2>
    <button class="btn btn-secondary" @click="ui.toggleTheme()">
      Switch to {{ ui.theme === 'dark' ? 'light' : 'dark' }} mode
    </button>
  </section>
</template>

<script setup>
import { useAuthStore } from '@/stores/auth'
import { ref, computed, onMounted } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useToastStore } from '@/stores/toast'
import { setEmailAlerts } from '@/services/notifications'
import { pushPermission, pushEnabledHere, enablePush, disablePush, sendTestPush } from '@/services/push'

const auth = useAuthStore()
const ui = useUiStore()
const toast = useToastStore()
const saving = ref(false)
const emailAlerts = computed(() => auth.profile?.notificationPrefs?.email !== false)

// ----- Push (per device) -----
const permission = ref('default')
const pushBusy = ref(false)
const pushOn = computed(() => pushEnabledHere(auth.profile))
onMounted(async () => { permission.value = await pushPermission() })

const pushHint = computed(() => {
  if (permission.value === 'unsupported') return "This browser doesn't support push notifications."
  if (permission.value === 'denied') return 'Notifications are blocked for this site — allow them in the browser settings, then try again.'
  if (pushOn.value) return 'Alerts will pop up on this device, even when inHabit is closed. Works best with the app installed.'
  return 'Get alerts on this device even when inHabit is closed. Turn on separately on each phone or computer.'
})

async function togglePush(enabled) {
  pushBusy.value = true
  try {
    if (enabled) await enablePush(auth.user.uid)
    else await disablePush(auth.user.uid)
    toast.success(enabled ? 'Push notifications on for this device' : 'Push notifications off for this device')
  } catch (err) {
    toast.error(err.message)
  } finally {
    permission.value = await pushPermission()
    pushBusy.value = false
  }
}

async function testPush() {
  pushBusy.value = true
  try {
    const { successCount, failureCount } = await sendTestPush()
    if (successCount) toast.success(`Test sent to ${successCount} device${successCount === 1 ? '' : 's'}. If nothing appears, check the OS notification settings.`)
    else toast.error(`Test failed on ${failureCount} device(s). Try turning push off and on again.`)
  } catch (err) {
    toast.error(`Couldn't send test: ${err.message}`)
  } finally {
    pushBusy.value = false
  }
}

async function toggleEmail(enabled) {
  saving.value = true
  try {
    await setEmailAlerts(auth.user.uid, enabled)
    toast.success(enabled ? 'Email alerts on' : 'Email alerts off')
  } catch (err) {
    toast.error(`Couldn't save: ${err.message}`)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-1) var(--space-4);
  margin: 0;
  font-size: var(--font-size-sm);
}
.facts dt { color: var(--color-text-muted); }
.facts dd { margin: 0; overflow-wrap: anywhere; }
.hint { margin: 0 0 var(--space-3); font-size: var(--font-size-sm); }
.push { margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--color-border); }
.push .form-hint { margin: var(--space-1) 0 var(--space-3); }
.checkbox { display: flex; align-items: center; gap: var(--space-2); font-size: var(--font-size-sm); cursor: pointer; }
.checkbox input { width: 18px; height: 18px; accent-color: var(--color-accent-1); }
</style>
