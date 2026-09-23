<template>
  <div class="spinner" role="status">
    <span class="sr-only">Loading…</span>
  </div>
</template>

<style scoped>
.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--color-surface-raised);
  border-top-color: var(--color-accent-1);
  border-radius: var(--radius-full);
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }
</style>
