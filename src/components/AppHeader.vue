<template>
  <header class="app-header">
    <RouterLink to="/" class="brand" aria-label="inHabit home">
      <img class="logo" src="/logo.png" alt="" />
    </RouterLink>

    <div class="header-title">inHabit</div>

    <div class="header-right">
      <button
        v-if="auth.isLoggedIn"
        class="menu-button"
        :aria-expanded="ui.drawerOpen"
        aria-controls="app-drawer"
        aria-label="Menu"
        @click="ui.toggleDrawer()"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-width="2" d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
    </div>
  </header>
</template>

<script setup>
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

const auth = useAuthStore()
const ui = useUiStore()
</script>

<style scoped>
.app-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--header-height);
  z-index: var(--z-header);
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 var(--space-4);
  background: var(--color-surface);
  color: var(--color-accent-1);
}

/* Soft shadow fading down from the header. */
.app-header::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(var(--space-4) * -1);
  height: var(--space-4);
  background: linear-gradient(to bottom, var(--shadow-edge), transparent);
  pointer-events: none;
}

.brand { display: flex; align-items: center; justify-self: start; }
.logo { height: 34px; display: block; }

.header-title {
  font-family: var(--font-display);
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-accent-3);
}

.header-right { justify-self: end; display: flex; align-items: center; }

.menu-button {
  display: flex;
  background: none;
  border: none;
  padding: var(--space-1);
  color: inherit;
  cursor: pointer;
}
</style>
