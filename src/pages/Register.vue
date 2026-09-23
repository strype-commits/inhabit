<template>
  <div class="register-page">
    <h1>Register</h1>
    <p>Create a new account</p>

    <form @submit.prevent="register">
      <div class="form-group">
        <label for="username">Username*:</label>
        <input id="username" v-model="username" type="text" required />
        <span class="form-descr" >Your name, but the shorter the better!</span>
      </div>

      <div class="form-group">
        <label for="email">Email*:</label>
        <input id="email" v-model="email" type="email" required />
      </div>

      <div class="form-group">
        <label for="password">Password*:</label>
        <input id="password" v-model="password" type="password" required />
      </div>

      <button type="submit">Register</button>
      <p v-if="error">{{ error }}</p>
    </form>

  </div>
</template>

<script setup>
import { ref } from 'vue'
import { auth, createUserWithEmailAndPassword, updateProfile, db, set, ref as dbRef } from '../services/firebase'
import { useRouter } from 'vue-router'

const email = ref('')
const password = ref('')
const username = ref('')
const error = ref('')
const router = useRouter()

const register = async () => {
  try {
    // Create user
    const userCredential = await createUserWithEmailAndPassword(auth, email.value, password.value)
    const user = userCredential.user

    // Update displayName for auth
    await updateProfile(user, { displayName: username.value })

    // Store user info in Realtime Database under /users/{uid}
    const userRef = dbRef(db, `users/${user.uid}`)
    await set(userRef, {
      email: email.value,
      username: username.value,
      role: 'user',
      sensors: {}
    })

    router.push('/') // Redirect to dashboard

  } catch (err) {
    error.value = err.message
  }
}
</script>

<style scoped>
.register-page {
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

.form-descr {
  font-size: 0.75rem;
}

.error {
  color: red;
  margin-top: 0.5rem;
}
</style>
