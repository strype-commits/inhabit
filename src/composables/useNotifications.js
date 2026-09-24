import { ref, computed, watch, effectScope } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { subscribeNotifications } from '@/services/notifications'

// One shared subscription to the signed-in user's feed (header bell + notifications page).
const items = ref([])
let unsub = null
let watching = false

export function useNotifications() {
  const auth = useAuthStore()
  if (!watching) {
    watching = true
    // Detached scope: the subscription outlives whichever component asked first.
    effectScope(true).run(() => {
      watch(() => auth.user?.uid, (uid) => {
        unsub?.()
        unsub = null
        items.value = []
        if (uid) unsub = subscribeNotifications(uid, (list) => { items.value = list }, () => {})
      }, { immediate: true })
    })
  }
  const unreadCount = computed(() => items.value.filter((n) => !n.read).length)
  return { items, unreadCount }
}
