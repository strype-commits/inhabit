import '@/assets/styles/main.css'
import { applyTheme, readStoredTheme } from '@/stores/ui'
import '@/composables/useInstallPrompt'

// Apply the saved theme before anything renders.
applyTheme(readStoredTheme())

// Missing-config guard: show what's missing instead of a blank white screen.
const REQUIRED_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_DATABASE_URL',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID'
]
const missing = REQUIRED_ENV.filter((k) => !import.meta.env[k])

if (missing.length) {
  document.getElementById('app').innerHTML = `
    <div style="max-width:560px;margin:4rem auto;padding:1.5rem;font-family:system-ui,sans-serif;
                background:#fff;color:#111;border-radius:12px">
      <h1 style="margin-top:0;font-size:1.25rem">inHabit isn't configured</h1>
      <p>Copy <code>.env.example</code> to <code>.env.local</code> and fill in these values
         from the Firebase console, then restart the dev server:</p>
      <ul>${missing.map((k) => `<li><code>${k}</code></li>`).join('')}</ul>
    </div>`
} else {
  const [{ createApp }, { createPinia }, { default: App }, { default: router }] = await Promise.all([
    import('vue'), import('pinia'), import('./App.vue'), import('./router')
  ])
  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.mount('#app')
}
