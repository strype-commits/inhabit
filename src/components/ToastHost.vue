<template>
  <Teleport to="body">
    <div class="toast-host" aria-live="polite">
      <TransitionGroup name="toast">
        <div
          v-for="t in toast.toasts"
          :key="t.id"
          class="toast"
          :class="`toast-${t.type}`"
          role="status"
          @click="toast.dismiss(t.id)"
        >
          {{ t.message }}
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup>
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()
</script>

<style scoped>
.toast-host {
  position: fixed;
  left: 50%;
  bottom: calc(var(--footer-height) + var(--space-4));
  transform: translateX(-50%);
  width: min(420px, calc(100vw - var(--space-8)));
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  z-index: var(--z-toast);
}

.toast {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  border-left: 4px solid var(--color-neutral);
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: var(--shadow-md);
  cursor: pointer;
}
.toast-success { border-left-color: var(--color-success); }
.toast-warning { border-left-color: var(--color-warning); }
.toast-error   { border-left-color: var(--color-critical); }

.toast-enter-active, .toast-leave-active { transition: opacity var(--transition-fast), transform var(--transition-fast); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }
</style>
