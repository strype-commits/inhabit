import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from 'firebase/auth'
import { ref as dbRef, onValue, get, set, update } from 'firebase/database'
import { auth, db } from '@/services/firebase'

// Roles that can see every sensor. 'master' kept for the original master account.
const ADMIN_ROLES = ['admin', 'master']

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)       // Firebase Auth user
  const profile = ref(null)    // /users/{uid}
  const initialised = ref(false)

  let initPromise = null
  let unsubProfile = null

  const isLoggedIn = computed(() => !!user.value)
  const displayName = computed(() =>
    profile.value?.username || user.value?.displayName || user.value?.email || '')
  const role = computed(() => profile.value?.role || 'user')
  const hasDeveloperAccess = computed(() => profile.value?.isDeveloper === true)
  const isAdmin = computed(() => ADMIN_ROLES.includes(role.value) || hasDeveloperAccess.value)
  // Sensor ids this user may see (ignored for admins, who see everything).
  const authorisedSensorIds = computed(() => Object.keys(profile.value?.sensors || {}))

  // Client backstop — never assume /users/{uid} exists.
  async function ensureUserProfile(u, extra = {}) {
    const userRef = dbRef(db, `users/${u.uid}`)
    const snap = await get(userRef)
    if (!snap.exists()) {
      await set(userRef, {
        email: u.email,
        username: extra.username || u.displayName || '',
        role: 'user',
        sensors: {}
      })
    }
  }

  function watchProfile(uid) {
    unsubProfile?.()
    unsubProfile = null
    if (!uid) { profile.value = null; return Promise.resolve() }
    return new Promise((resolve) => {
      unsubProfile = onValue(dbRef(db, `users/${uid}`), (snap) => {
        profile.value = snap.val()
        resolve()
      }, () => { profile.value = null; resolve() })
    })
  }

  // Idempotent — App.vue and the router guard share one listener.
  function init() {
    if (initPromise) return initPromise
    initPromise = new Promise((resolve) => {
      onAuthStateChanged(auth, async (u) => {
        user.value = u
        if (u) await ensureUserProfile(u).catch(() => {})
        await watchProfile(u?.uid)
        if (!initialised.value) { initialised.value = true; resolve() }
      })
    })
    return initPromise
  }

  async function register({ email, password, username }) {
    const { user: u } = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(u, { displayName: username })
    await ensureUserProfile(u, { username })
    // The auth listener may have created the profile first, before displayName was set.
    await update(dbRef(db, `users/${u.uid}`), { username })
    return u
  }

  function login({ email, password }) {
    return signInWithEmailAndPassword(auth, email, password)
  }

  function logout() {
    return signOut(auth)
  }

  return {
    user, profile, initialised,
    isLoggedIn, displayName, role, isAdmin, hasDeveloperAccess, authorisedSensorIds,
    init, register, login, logout
  }
})
