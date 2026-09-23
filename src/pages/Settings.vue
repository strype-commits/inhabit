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
    <h2 class="card-title">Appearance</h2>
    <button class="btn btn-secondary" @click="ui.toggleTheme()">
      Switch to {{ ui.theme === 'dark' ? 'light' : 'dark' }} mode
    </button>
  </section>
</template>

<script setup>
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

const auth = useAuthStore()
const ui = useUiStore()
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
</style>
