<template>
  <div class="page-narrow">
    <form class="card" @submit.prevent="submit">
      <h1>Log in</h1>

      <div class="form-group">
        <label class="form-label" for="email">Email</label>
        <input id="email" v-model="email" class="form-input" type="email" autocomplete="email" required />
      </div>

      <div class="form-group">
        <label class="form-label" for="password">Password</label>
        <input id="password" v-model="password" class="form-input" type="password" autocomplete="current-password" required />
      </div>

      <button type="submit" class="btn btn-primary btn-block" :disabled="busy">
        {{ busy ? 'Logging in…' : 'Log in' }}
      </button>
      <p v-if="error" class="form-error">{{ error }}</p>

      <p class="switch">
        No account? <RouterLink :to="{ name: 'Register', query: route.query }">Register</RouterLink>
      </p>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { authErrorMessage } from '@/utils/authErrors'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await auth.login({ email: email.value, password: password.value })
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
      ? route.query.redirect
      : '/'
    router.push(redirect)
  } catch (err) {
    error.value = authErrorMessage(err)
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.switch { margin: var(--space-4) 0 0; font-size: var(--font-size-sm); }
</style>
