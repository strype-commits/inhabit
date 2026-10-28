<template>
  <div class="filters">
    <div class="pills" role="group" aria-label="Filter by status">
      <button v-for="s in statusFilters" :key="s.id" type="button" class="pill" :class="{ active: statusFilter === s.id }"
              :aria-pressed="statusFilter === s.id" @click="statusFilter = s.id">
        {{ s.label }} <span class="count">{{ s.count }}</span>
      </button>
    </div>
    <div class="selects">
      <select v-model="typeFilter" class="form-input" aria-label="Filter by type">
        <option value="">All types</option>
        <option v-for="t in TYPES" :key="t.id" :value="t.id">{{ t.label }}</option>
      </select>
      <select v-model="sort" class="form-input" aria-label="Sort">
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
      </select>
      <label class="checkbox"><input v-model="showArchived" type="checkbox" /> Show archived</label>
    </div>
  </div>

  <p v-if="!visible.length" class="card text-muted empty">No requests match.</p>

  <section v-for="r in visible" :key="r.id" class="card request" :class="{ archived: r.archived }">
    <div class="request-head">
      <span class="badge" :class="`type-${r.type}`">{{ typeLabel(r.type) }}</span>
      <span class="badge" :class="`status-${r.status}`">{{ statusLabel(r.status) }}</span>
      <span v-if="r.archived" class="badge">Archived</span>
      <span class="text-muted date" :title="formatDateTime(new Date(r.createdAt))">{{ formatDateTime(new Date(r.createdAt)) }}</span>
    </div>

    <template v-if="editing === r.id">
      <input v-model="draft.title" class="form-input edit-title" type="text" maxlength="120" aria-label="Title" />
      <textarea v-model="draft.description" class="form-textarea" rows="4" maxlength="2000" aria-label="Description" />
      <div class="row-actions">
        <button class="btn btn-ghost btn-sm" @click="editing = null">Cancel</button>
        <button class="btn btn-primary btn-sm" :disabled="!draft.title.trim()" @click="saveEdit(r)">Save</button>
      </div>
    </template>
    <template v-else>
      <div class="title">{{ r.title }}</div>
      <p v-if="r.description" class="description">{{ r.description }}</p>
      <div class="text-muted from">From: {{ r.from || 'unknown' }}</div>
    </template>

    <div class="controls">
      <select class="form-input" :value="r.status" aria-label="Status" @change="change(r, { status: $event.target.value })">
        <option v-for="s in STATUSES" :key="s.id" :value="s.id">{{ s.label }}</option>
      </select>
      <select class="form-input" :value="r.type" aria-label="Type" @change="change(r, { type: $event.target.value })">
        <option v-for="t in TYPES" :key="t.id" :value="t.id">{{ t.label }}</option>
      </select>
      <button v-if="editing !== r.id" class="btn btn-secondary btn-sm" @click="startEdit(r)">Edit</button>
      <button class="btn btn-ghost btn-sm" @click="change(r, { archived: !r.archived }, r.archived ? 'Restored' : 'Archived')">
        {{ r.archived ? 'Restore' : 'Archive' }}
      </button>
    </div>

    <label class="notes">
      <span class="form-label">Admin notes <span class="text-muted">(never shown to the submitter)</span></span>
      <textarea class="form-textarea" rows="2" :value="r.adminNotes || ''" placeholder="Triage notes…"
                @blur="saveNotes(r, $event.target.value)" />
    </label>
  </section>
</template>

<script setup>
import { ref, reactive, computed, onUnmounted } from 'vue'
import { useToastStore } from '@/stores/toast'
import {
  STATUSES, TYPES, statusLabel, typeLabel, subscribeAllFeatureRequests, updateFeatureRequest
} from '@/services/featureRequests'
import { formatDateTime } from '@/utils/formatters'

const toast = useToastStore()
const requests = ref([])
const statusFilter = ref('open')
const typeFilter = ref('')
const sort = ref('newest')
const showArchived = ref(false)
const editing = ref(null)
const draft = reactive({ title: '', description: '' })

const unsub = subscribeAllFeatureRequests((list) => { requests.value = list }, (err) => toast.error(err.message))
onUnmounted(() => unsub())

const OPEN = ['submitted', 'planned', 'in-progress']
const pool = computed(() => requests.value.filter((r) => showArchived.value || !r.archived))

const statusFilters = computed(() => [
  { id: 'open', label: 'Open', count: pool.value.filter((r) => OPEN.includes(r.status)).length },
  ...STATUSES.map((s) => ({ ...s, count: pool.value.filter((r) => r.status === s.id).length })),
  { id: 'all', label: 'All', count: pool.value.length }
])

const visible = computed(() => pool.value
  .filter((r) => statusFilter.value === 'all'
    || (statusFilter.value === 'open' ? OPEN.includes(r.status) : r.status === statusFilter.value))
  .filter((r) => !typeFilter.value || r.type === typeFilter.value)
  .sort((a, b) => sort.value === 'newest' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt))

async function change(r, fields, message) {
  try {
    await updateFeatureRequest(r.id, fields, r)
    if (message) toast.success(message)
  } catch (err) {
    toast.error(`Couldn't save: ${err.message}`)
  }
}

function startEdit(r) {
  editing.value = r.id
  draft.title = r.title || ''
  draft.description = r.description || ''
}

async function saveEdit(r) {
  await change(r, { title: draft.title.trim(), description: draft.description.trim() }, 'Request updated')
  editing.value = null
}

function saveNotes(r, value) {
  const notes = value.trim()
  if (notes === (r.adminNotes || '')) return
  change(r, { adminNotes: notes || null }, 'Notes saved')
}
</script>

<style scoped>
.filters { display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-4); }
.pills { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.pill {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;
}
.pill.active { background: var(--color-accent-1); border-color: var(--color-accent-1); color: var(--color-text-on-accent); }
.count { opacity: 0.7; margin-left: var(--space-1); }
.selects { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.selects .form-input { width: auto; background: var(--color-surface); }
.empty { margin: 0; }

.request.archived { opacity: 0.6; }
.request-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); }
.date { margin-left: auto; font-size: var(--font-size-xs); }
.title { font-weight: var(--font-weight-semibold); }
.description { margin: var(--space-2) 0 0; font-size: var(--font-size-sm); white-space: pre-wrap; }
.from { margin-top: var(--space-2); font-size: var(--font-size-xs); }
.edit-title { margin-bottom: var(--space-2); }
.row-actions { display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-2); }

.controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-top: var(--space-3); }
.controls .form-input { width: auto; }
.notes { display: block; margin-top: var(--space-3); }

.checkbox { display: flex; align-items: center; gap: var(--space-2); font-size: var(--font-size-sm); cursor: pointer; }
.checkbox input { width: 18px; height: 18px; accent-color: var(--color-accent-1); }

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
