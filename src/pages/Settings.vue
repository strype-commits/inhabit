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
import { ref, computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useToastStore } from '@/stores/toast'
import { setEmailAlerts } from '@/services/notifications'

const auth = useAuthStore()
const ui = useUiStore()
const toast = useToastStore()
const saving = ref(false)
const emailAlerts = computed(() => auth.profile?.notificationPrefs?.email !== false)

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
.checkbox { display: flex; align-items: center; gap: var(--space-2); font-size: var(--font-size-sm); cursor: pointer; }
.checkbox input { width: 18px; height: 18px; accent-color: var(--color-accent-1); }
</style>
