<template>
  <div class="login-page">
    <h1>Login</h1>
    <p>Enter your email and password</p>

    <form @submit.prevent="login">
      <div class="form-group">
        <label for="email">Email:</label>
        <input id="email" v-model="email" type="email" required />
      </div>

      <div class="form-group">
        <label for="password">Password:</label>
        <input id="password" v-model="password" type="password" required />
      </div>

      <button type="submit">Login</button>
      <p v-if="error" class="error">{{ error }}</p>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { auth, loginWithEmail } from '../services/firebase'
import { useRouter } from 'vue-router'

const email = ref('')
const password = ref('')
const error = ref('')

const router = useRouter()

const login = async () => {
  error.value = ''
  try {
    await loginWithEmail({ email: email.value, password: password.value })
    // Redirect to dashboard after successful login
    router.push('/')
  } catch (err) {
    error.value = err.message
  }
}
</script>

<style scoped>
.login-page {
  max-width: 400px;
  margin: 2rem auto;
  padding: 1rem;
  background-color: #f3f4f6;
  border-radius: 0.5rem;
  text-align: left;
}

.form-group {
  margin-bottom: 1rem;
}

label {
  display: block;
  margin-bottom: 0.25rem;
}

input {
  width: 100%;
  padding: 0.5rem;
  border-radius: 0.25rem;
  border: 1px solid #ccc;
}

button {
  background-color: #06b6d4;
  color: white;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
}

button:hover {
  background-color: #0aa9c5;
}

.error {
  color: red;
  margin-top: 0.5rem;
}
</style>
