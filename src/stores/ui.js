import { defineStore } from 'pinia'
import { ref } from 'vue'

const THEME_KEY = 'inhabit:theme'

export function readStoredTheme() {
  try { return localStorage.getItem(THEME_KEY) } catch { return null }
}

// Applied from main.js before mount to avoid a flash of the wrong palette.
export function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.dataset.theme = theme
  } else {
    delete document.documentElement.dataset.theme
  }
}

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const useUiStore = defineStore('ui', () => {
  const theme = ref(readStoredTheme() || systemTheme())
  const drawerOpen = ref(false)

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    applyTheme(theme.value)
    try { localStorage.setItem(THEME_KEY, theme.value) } catch { /* private mode */ }
  }

  function toggleDrawer() { drawerOpen.value = !drawerOpen.value }
  function closeDrawer() { drawerOpen.value = false }

  return { theme, drawerOpen, toggleTheme, toggleDrawer, closeDrawer }
})
