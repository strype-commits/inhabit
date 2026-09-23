<template>
  <div class="page-narrow">
    <form class="card" @submit.prevent="submit">
      <h1>Create an account</h1>

      <div class="form-group">
        <label class="form-label" for="username">Username</label>
        <input id="username" v-model.trim="username" class="form-input" type="text" autocomplete="nickname" required />
        <span class="form-hint">Your name, but the shorter the better!</span>
      </div>

      <div class="form-group">
        <label class="form-label" for="email">Email</label>
        <input id="email" v-model.trim="email" class="form-input" type="email" autocomplete="email" required />
      </div>

      <div class="form-group">
        <label class="form-label" for="password">Password</label>
        <input id="password" v-model="password" class="form-input" type="password" autocomplete="new-password" minlength="6" required />
        <span class="form-hint">At least 6 characters.</span>
      </div>

      <button type="submit" class="btn btn-primary btn-block" :disabled="busy">
        {{ busy ? 'Creating account…' : 'Register' }}
      </button>
      <p v-if="error" class="form-error">{{ error }}</p>

      <p class="switch">
        Already registered? <RouterLink :to="{ name: 'Login', query: route.query }">Log in</RouterLink>
      </p>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { authErrorMessage } from '@/utils/authErrors'

const auth = useAuthStore()
const toast = useToastStore()
const router = useRouter()
const route = useRoute()

const username = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await auth.register({ email: email.value, password: password.value, username: username.value })
    toast.success(`Welcome, ${username.value}!`)
    router.push('/')
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
