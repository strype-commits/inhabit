import { createRouter, createWebHistory } from 'vue-router';
import Dashboard from '@/pages/Dashboard.vue';
import SensorDetail from '@/pages/SensorDetail.vue';
import Login from '@/pages/Login.vue';
import Register from '@/pages/Register.vue';
import Settings from '@/pages/Settings.vue';

const routes = [
  { path: '/', name: 'Dashboard', component: Dashboard },
  { path: '/sensor/:id', name: 'SensorDetail', component: SensorDetail, props:true },
  { path: '/login', name: 'Login', component: Login },
  { path: '/register', name: 'Register', component: Register },
  { path: '/settings', name: 'Settings', component: Settings }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;
