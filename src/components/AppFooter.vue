<template>
  <footer class="app-footer">
    <span><b>inHabit</b></span>
    <span aria-hidden="true">·</span>
    <RouterLink to="/changelog">What's new</RouterLink>
    <span aria-hidden="true">·</span>
    <span>v{{ version }}</span>
  </footer>
</template>

<script setup>
/* global __APP_VERSION__, __IS_PROD_BUILD__ */
const version = __IS_PROD_BUILD__ ? __APP_VERSION__ : `${__APP_VERSION__}-beta`
</script>

<style scoped>
.app-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: var(--footer-height);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  background: var(--color-surface);
  color: var(--color-accent-1);
  font-size: var(--font-size-sm);
  z-index: var(--z-footer);
}

.app-footer a { color: inherit; }

/* Soft shadow fading up from the footer. */
.app-footer::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: calc(var(--space-4) * -1);
  height: var(--space-4);
  background: linear-gradient(to top, var(--shadow-edge), transparent);
  pointer-events: none;
}
</style>
