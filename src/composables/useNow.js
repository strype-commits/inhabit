import { ref, onUnmounted } from 'vue'

// One shared ticking clock so relative times and staleness update without a reload.
const now = ref(new Date())
let timer = null
let users = 0

export function useNow(intervalMs = 30000) {
  if (users++ === 0) timer = setInterval(() => { now.value = new Date() }, intervalMs)
  onUnmounted(() => {
    if (--users === 0) { clearInterval(timer); timer = null }
  })
  return now
}
