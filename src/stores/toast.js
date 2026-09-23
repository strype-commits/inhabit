import { defineStore } from 'pinia'
import { ref } from 'vue'

const DISMISS_MS = 4000
let nextId = 1

export const useToastStore = defineStore('toast', () => {
  const toasts = ref([])

  function show(type, message) {
    const id = nextId++
    toasts.value.push({ id, type, message })
    setTimeout(() => dismiss(id), DISMISS_MS)
  }

  function dismiss(id) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return {
    toasts,
    dismiss,
    success: (msg) => show('success', msg),
    error: (msg) => show('error', msg),
    warning: (msg) => show('warning', msg)
  }
})
