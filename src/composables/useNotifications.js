import { ref, computed, watch, effectScope } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { subscribeNotifications } from '@/services/notifications'

const isValid = (n) => n && typeof n.title === 'string' && Number.isFinite(Number(n.createdAt))

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
        // Skip malformed entries (e.g. a bare { read: true } stub) so one bad record can't
        // break the page or inflate the unread count.
        if (uid) unsub = subscribeNotifications(uid, (list) => { items.value = list.filter(isValid) }, () => {})
      }, { immediate: true })
    })
  }
  const unreadCount = computed(() => items.value.filter((n) => !n.read).length)
  return { items, unreadCount }
}
