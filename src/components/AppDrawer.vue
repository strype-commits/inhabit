<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="ui.drawerOpen" class="drawer-overlay" @click="ui.closeDrawer()" />
    </Transition>

    <aside
      id="app-drawer"
      class="app-drawer"
      :class="{ open: ui.drawerOpen }"
      :aria-hidden="!ui.drawerOpen"
      :inert="!ui.drawerOpen"
    >
      <div class="drawer-user">
        <div class="avatar" aria-hidden="true">{{ initial }}</div>
        <div>
          <div class="drawer-name">{{ auth.displayName }}</div>
          <div v-if="auth.isAdmin" class="drawer-role">Admin</div>
        </div>
      </div>

      <nav>
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="drawer-link"
          @click="ui.closeDrawer()"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="drawer-actions">
        <button v-if="canInstall" class="btn btn-sm btn-secondary" @click="install">Install app</button>
        <button class="btn btn-sm btn-secondary" @click="ui.toggleTheme()">
          {{ ui.theme === 'dark' ? 'Light mode' : 'Dark mode' }}
        </button>
      </div>

      <button class="drawer-link drawer-logout" @click="logout">Log out</button>
    </aside>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useInstallPrompt } from '@/composables/useInstallPrompt'

const auth = useAuthStore()
const ui = useUiStore()
const router = useRouter()
const { canInstall, install } = useInstallPrompt()

const navItems = computed(() => [
  { label: 'Dashboard', to: '/' },
  ...(auth.isAdmin ? [{ label: 'Admin', to: '/admin' }] : []),
  { label: 'Settings', to: '/settings' },
  { label: "What's new", to: '/changelog' }
])

const initial = computed(() => (auth.displayName || '?').charAt(0).toUpperCase())

async function logout() {
  ui.closeDrawer()
  await auth.logout()
  router.push({ name: 'Login' })
}
</script>

<style scoped>
.drawer-overlay {
  position: fixed;
  inset: var(--header-height) 0 0 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: var(--z-overlay);
}

.app-drawer {
  position: fixed;
  top: var(--header-height);
  right: 0;
  bottom: 0;
  width: var(--drawer-width);
  max-width: 85vw;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
  background: var(--color-drawer-bg);
  color: var(--color-drawer-text);
  box-shadow: var(--shadow-lg);
  z-index: var(--z-drawer);
  transform: translateX(100%);
  transition: transform var(--transition-drawer);
  overflow-y: auto;
}
.app-drawer.open { transform: translateX(0); }

.drawer-user { display: flex; align-items: center; gap: var(--space-3); }
.avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  display: grid;
  place-items: center;
  background: var(--color-accent-1);
  color: var(--color-text-on-accent);
  font-weight: var(--font-weight-bold);
}
.drawer-name { font-weight: var(--font-weight-semibold); }
.drawer-role { font-size: var(--font-size-xs); color: var(--color-text-muted); }

nav { display: flex; flex-direction: column; gap: var(--space-1); }

.drawer-link {
  display: block;
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border: none;
  border-radius: var(--radius-md);
  background: none;
  color: inherit;
  font: inherit;
  font-weight: var(--font-weight-medium);
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  transition: background-color var(--transition-fast), color var(--transition-fast);
}
.drawer-link:hover { background: var(--color-accent-1); color: var(--color-text-on-accent); }
.drawer-link.router-link-exact-active {
  background: var(--color-accent-2);
  color: var(--color-text-on-accent);
  font-weight: var(--font-weight-semibold);
}

.drawer-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.drawer-logout { margin-top: auto; }

.fade-enter-active, .fade-leave-active { transition: opacity var(--transition-drawer); }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
