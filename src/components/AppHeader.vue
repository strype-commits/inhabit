<template>
  <header class="app-header">
    <div class="brand">
      <router-link to="/" class="flex items-center space-x-2">
        <img class="logo" src="/logo.png" alt="inHabit logo">
      </router-link>
    </div>

    <!-- Center title -->
    <div style="flex:1; display:flex; justify-content:center;">
      <div class="header-title">inHabit</div>
    </div>

    <!-- Right side: user icon or login -->
    <div class="right-section">
      <!-- User icon and name -->
      <router-link
        v-if="!currentUser"
        to="/login"
        class="user-icon logged-out"
        aria-label="Login"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z"/>
        </svg>
      </router-link>

      <div
        v-else
        class="user-icon logged-in">
        <span class="username">{{ username }}</span>
          
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z"/>
        </svg>
      </div>

      <!-- Hamburger menu -->
      <button
        @click="$emit('toggle-drawer')"
        class="menu-button"
        aria-label="menu"
        style="background:none;border:none;color:inherit"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-width="2" d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import { currentUser, logout } from '../services/firebase'
import { useRouter } from 'vue-router'

const router = useRouter()

const username = computed(() => {
  if (currentUser.value) {
    return currentUser.value.displayName || currentUser.value.email
  }
  return ''
})

const logoutUser = async () => {
  await logout()
  router.push('/login')
}
</script>

<style scoped>
.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.username {
  font-weight: 500;
}

.logout-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
}

.menu-btn {
  background: none;
  border: none;
  color: inherit;
}

.username {
  font-size: 0.9rem;
  font-weight: 500;
  padding: 0.75rem;
}

.right-section {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.menu-button {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
}

.user-icon {
  display: flex;
  align-items: center;
  padding: 0.25rem;
}

.user-icon.logged-out {
  color: #888;      /* grey color */
  text-decoration: none;
  pointer-events: auto;
}

</style>
