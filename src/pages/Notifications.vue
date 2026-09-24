<template>
  <div class="page-head">
    <h1>Notifications</h1>
    <button v-if="unreadCount" class="btn btn-secondary btn-sm" @click="markAllRead">Mark all read</button>
  </div>

  <div v-if="!items.length" class="card">
    <p class="empty">No notifications yet. Alerts for your sensors will appear here.</p>
  </div>

  <section v-for="n in items" :key="n.id" class="card notification" :class="[`kind-${n.kind}`, { unread: !n.read }]">
    <div class="icon" aria-hidden="true">{{ n.kind === 'clear' ? '✓' : '!' }}</div>
    <div class="content">
      <div class="title">
        <span class="sr-only">{{ n.kind === 'clear' ? 'Resolved:' : 'Alert:' }}</span>
        {{ n.title }}
      </div>
      <div class="body">{{ n.body }}</div>
      <div class="meta">
        <time :datetime="new Date(n.createdAt).toISOString()" :title="formatDateTime(new Date(n.createdAt))">
          {{ formatRelativeTime(new Date(n.createdAt), now) }}
        </time>
        <RouterLink v-if="n.sensorId" :to="`/sensor/${n.sensorId}`" @click="open(n)">View sensor</RouterLink>
        <button class="link-btn" @click="dismiss(n)">Dismiss</button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { onMounted, onBeforeUnmount } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { useNow } from '@/composables/useNow'
import { useNotifications } from '@/composables/useNotifications'
import { markRead, deleteNotification } from '@/services/notifications'
import { formatRelativeTime, formatDateTime } from '@/utils/formatters'

const auth = useAuthStore()
const toast = useToastStore()
const now = useNow()
const { items, unreadCount } = useNotifications()

const uid = () => auth.user?.uid

function markAllRead() {
  markRead(uid(), items.value.filter((n) => !n.read).map((n) => n.id))
    .catch((err) => toast.error(`Couldn't update: ${err.message}`))
}

function open(n) {
  if (!n.read) markRead(uid(), [n.id]).catch(() => {})
}

function dismiss(n) {
  deleteNotification(uid(), n.id).catch((err) => toast.error(`Couldn't dismiss: ${err.message}`))
}

// Anything seen on this page counts as read once you leave it.
let seen = []
onMounted(() => { seen = items.value.filter((n) => !n.read).map((n) => n.id) })
onBeforeUnmount(() => { if (uid()) markRead(uid(), seen).catch(() => {}) })
</script>

<style scoped>
.page-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.page-head h1 { margin-bottom: var(--space-4); }
.empty { margin: 0; }

.notification { display: flex; gap: var(--space-3); border-left: 4px solid var(--color-border); }
.notification.kind-raise { border-left-color: var(--color-warning); }
.notification.kind-clear { border-left-color: var(--color-success); }
.notification:not(.unread) { opacity: 0.75; }

.icon {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  display: grid;
  place-items: center;
  font-weight: var(--font-weight-bold);
  color: var(--color-surface);
  background: var(--color-warning);
}
.kind-clear .icon { background: var(--color-success); }

.title { font-weight: var(--font-weight-semibold); }
.unread .title::after {
  content: "";
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-left: var(--space-2);
  border-radius: var(--radius-full);
  background: var(--color-accent-1);
  vertical-align: middle;
}
.body { margin-top: var(--space-1); font-size: var(--font-size-sm); }
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}
.link-btn {
  background: none;
  border: none;
  padding: 0;
  color: var(--color-text-muted);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
</style>
