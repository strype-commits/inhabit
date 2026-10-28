<template>
  <h1>Feature requests</h1>

  <form class="card" @submit.prevent="submit">
    <h2 class="card-title">Suggest something</h2>
    <p class="text-muted hint">Ideas for inHabit, or something that isn't working. Every request is read.</p>

    <div class="form-group">
      <span class="form-label">Type</span>
      <div class="type-toggle" role="radiogroup" aria-label="Request type">
        <label v-for="t in TYPES" :key="t.id" class="type-option" :class="{ active: form.type === t.id }">
          <input v-model="form.type" type="radio" name="type" :value="t.id" class="sr-only" />
          {{ t.id === 'bug' ? 'Something’s wrong' : 'Idea or feature' }}
        </label>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label" for="fr-title">Title</label>
      <input id="fr-title" v-model="form.title" class="form-input" type="text" maxlength="120" required
             :placeholder="form.type === 'bug' ? 'e.g. Graph doesn’t load on my phone' : 'e.g. Show oil usage per month'" />
    </div>

    <div class="form-group">
      <label class="form-label" for="fr-desc">Details</label>
      <textarea id="fr-desc" v-model="form.description" class="form-textarea" rows="4" maxlength="2000"
                :placeholder="form.type === 'bug' ? 'What happened, and what did you expect? Which device?' : 'What would you like it to do, and why?'" />
    </div>

    <p v-if="error" class="form-error">{{ error }}</p>
    <button type="submit" class="btn btn-primary" :disabled="busy || !form.title.trim()">
      {{ busy ? 'Sending…' : 'Send request' }}
    </button>
  </form>

  <section class="card">
    <h2 class="card-title">Your requests</h2>
    <p v-if="!mine.length" class="text-muted empty">You haven't sent any yet.</p>
    <ul v-else class="mine">
      <li v-for="r in mine" :key="r.id">
        <div class="mine-head">
          <span class="badge" :class="`type-${r.type}`">{{ typeLabel(r.type) }}</span>
          <span class="badge" :class="`status-${r.status}`">{{ statusLabel(r.status) }}</span>
          <span class="text-muted date">{{ formatDateTime(new Date(r.createdAt)) }}</span>
        </div>
        <div class="mine-title">{{ r.title }}</div>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { ref, reactive, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import {
  TYPES, submitFeatureRequest, subscribeMyFeatureRequests, statusLabel, typeLabel
} from '@/services/featureRequests'
import { formatDateTime } from '@/utils/formatters'

const auth = useAuthStore()
const toast = useToastStore()
const form = reactive({ type: 'feature', title: '', description: '' })
const busy = ref(false)
const error = ref('')
const mine = ref([])

const unsub = subscribeMyFeatureRequests(auth.user.uid, (list) => { mine.value = list.filter((r) => !r.archived) }, () => {})
onUnmounted(() => unsub())

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await submitFeatureRequest({ uid: auth.user.uid, displayName: auth.displayName, ...form })
    toast.success('Thanks — your request has been sent')
    form.title = ''
    form.description = ''
  } catch (err) {
    error.value = `Couldn't send: ${err.message}`
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.hint { margin: 0 0 var(--space-4); font-size: var(--font-size-sm); }
.empty { margin: 0; }

.type-toggle { display: inline-flex; border: 1px solid var(--color-border); border-radius: var(--radius-full); overflow: hidden; }
.type-option { padding: var(--space-2) var(--space-4); font-size: var(--font-size-sm); cursor: pointer; color: var(--color-text-muted); }
.type-option + .type-option { border-left: 1px solid var(--color-border); }
.type-option.active { background: var(--color-accent-1); color: var(--color-text-on-accent); }
.type-option:focus-within { outline: 2px solid var(--color-accent-1); outline-offset: 2px; }

.mine { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
.mine li { padding-bottom: var(--space-3); border-bottom: 1px solid var(--color-border); }
.mine li:last-child { border-bottom: none; padding-bottom: 0; }
.mine-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.mine-title { margin-top: var(--space-1); font-weight: var(--font-weight-medium); }
.date { font-size: var(--font-size-xs); margin-left: auto; }

.badge {
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  background: var(--color-surface-raised);
  color: var(--color-text);
}
.type-bug { background: var(--color-critical); color: var(--color-text-on-accent); }
.status-planned, .status-in-progress { background: var(--color-accent-1); color: var(--color-text-on-accent); }
.status-complete { background: var(--color-success); color: var(--color-text-on-accent); }
.status-wont-do { background: var(--color-neutral); color: var(--color-text-on-accent); }
</style>
