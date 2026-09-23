import { ref, computed } from 'vue'

// Captured at module load (imported from main.js) so the event isn't missed
// while the app shell is still waiting on auth.
const deferredPrompt = ref(null)
const installed = ref(window.matchMedia?.('(display-mode: standalone)').matches ?? false)

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredPrompt.value = e
})
window.addEventListener('appinstalled', () => {
  installed.value = true
  deferredPrompt.value = null
})

export function useInstallPrompt() {
  const canInstall = computed(() => !!deferredPrompt.value && !installed.value)

  async function install() {
    const prompt = deferredPrompt.value
    if (!prompt) return
    deferredPrompt.value = null
    prompt.prompt()
    await prompt.userChoice
  }

  return { canInstall, install }
}
