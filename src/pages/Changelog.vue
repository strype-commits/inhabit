<template>
  <h1>What's new</h1>

  <div v-if="loading" class="centered"><LoadingSpinner /></div>
  <p v-else-if="error" class="card form-error">{{ error }}</p>

  <section v-for="release in releases" v-else :key="release.version" class="card">
    <h2 class="card-title">
      v{{ release.version }}
      <span class="text-muted date">{{ release.date || 'Unreleased' }}</span>
    </h2>
    <ul>
      <li v-for="(c, i) in release.changes" :key="i">
        <span class="badge" :class="`badge-${c.type}`">{{ c.type }}</span>
        {{ c.text }}
      </li>
    </ul>
  </section>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import LoadingSpinner from '@/components/LoadingSpinner.vue'

const releases = ref([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const res = await fetch('/changelog.json', { cache: 'no-cache' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    releases.value = await res.json()
  } catch (err) {
    error.value = `Couldn't load the changelog: ${err.message}`
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.centered { display: flex; justify-content: center; padding: var(--space-8); }
.date { font-size: var(--font-size-sm); font-weight: var(--font-weight-regular); margin-left: var(--space-2); }
ul { margin: 0; padding-left: 0; list-style: none; display: flex; flex-direction: column; gap: var(--space-2); }
.badge {
  display: inline-block;
  min-width: 64px;
  margin-right: var(--space-2);
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  text-align: center;
  text-transform: capitalize;
  background: var(--color-neutral);
  color: var(--color-text-on-accent);
}
.badge-feature { background: var(--color-success); }
.badge-change  { background: var(--color-accent-1); }
.badge-fix     { background: var(--color-warning); }
</style>
