import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  { path: '/', name: 'Dashboard', component: () => import('@/pages/Dashboard.vue'), meta: { requiresAuth: true } },
  { path: '/sensor/:id', name: 'SensorDetail', component: () => import('@/pages/SensorDetail.vue'), props: true, meta: { requiresAuth: true } },
  { path: '/settings', name: 'Settings', component: () => import('@/pages/Settings.vue'), meta: { requiresAuth: true } },
  { path: '/admin', name: 'Admin', component: () => import('@/pages/Admin.vue'), meta: { requiresAuth: true, requiresAdmin: true } },
  { path: '/changelog', name: 'Changelog', component: () => import('@/pages/Changelog.vue') },
  { path: '/login', name: 'Login', component: () => import('@/pages/Login.vue'), meta: { guestOnly: true } },
  { path: '/register', name: 'Register', component: () => import('@/pages/Register.vue'), meta: { guestOnly: true } },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.init()

  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return { name: 'Login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} }
  }
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return { name: 'Dashboard' }
  }
  if (to.meta.guestOnly && auth.isLoggedIn) {
    return { name: 'Dashboard' }
  }
})

export default router
