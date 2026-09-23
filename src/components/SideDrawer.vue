<template>
  <aside class="side-drawer" v-show="isOpen">
  <h2>Menu</h2>
  <nav>
    <ul>
  <li v-for="item in menuItems" :key="item.label">
    <!-- If item has an action, render as a button -->
    <button
      v-if="item.action"
      class="block logout-btn"
      @click="() => { item.action(); $emit('close'); }"
    >
      {{ item.label }}
    </button>

    <!-- Otherwise render as a router link -->
    <router-link
      v-else
      :to="item.to"
      class="block"
      @click="$emit('close')"
    >
      {{ item.label }}
    </router-link>
  </li>
</ul>

  </nav>

  </aside>
</template>

<script setup>
import { defineProps } from 'vue'
import { computed } from 'vue'
import { currentUser, logout } from '../services/firebase'
import { useRouter } from 'vue-router'

defineProps({
  isOpen: {
    type: Boolean,
    required: true,
  },
})

const router = useRouter()

// Base menu items
const baseItems = [
  { label: 'Home', to: '/' },
  { label: 'Dummy', to: '/dummy' },
  { label: 'Test', to: '/test' },
  { label: 'Login', to: '/login' },  // will be replaced if logged in
  

  /*{ label: 'Register', to: '/register' },*/
]

// Compute final menu items
const menuItems = computed(() => {
  if (currentUser.value) {
    return baseItems.map(item => 
      item.label === 'Login' ? 
      { label: 'Log out', action: async () => { await logout(); router.push('/'); } } 
      : item
    )
  }
  return baseItems
})
</script>

<style scoped>

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  display: block;
  margin-left: auto;
}


.logout-btn {
  display: block;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  text-decoration: none;
  color: #1F2937; /* slate/navy text for drawer */
  font-weight: inherit;
  transition: background-color 0.2s, color 0.2s;
}

.logout-btn:hover {
  background-color: #06B6D4; /* accent1 teal/cyan */
  color: white;
}

</style>
