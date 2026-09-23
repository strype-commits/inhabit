<template>
  <div v-if="!auth.initialised" class="app-loading">
    <LoadingSpinner />
  </div>
  <template v-else>
    <AppHeader />
    <AppDrawer />
    <main class="page-content">
      <RouterView />
    </main>
    <AppFooter />
    <ToastHost />
  </template>
</template>

<script setup>
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import AppHeader from '@/components/AppHeader.vue'
import AppDrawer from '@/components/AppDrawer.vue'
import AppFooter from '@/components/AppFooter.vue'
import LoadingSpinner from '@/components/LoadingSpinner.vue'
import ToastHost from '@/components/ToastHost.vue'

const auth = useAuthStore()
const ui = useUiStore()
const router = useRouter()

auth.init()

// Signed out elsewhere (another tab, token expiry) — leave protected pages.
watch(() => auth.isLoggedIn, (loggedIn) => {
  if (!loggedIn) {
    ui.closeDrawer()
    if (router.currentRoute.value.meta.requiresAuth) router.push({ name: 'Login' })
  }
})
</script>
