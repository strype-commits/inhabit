<template>
  <header>
    <AppHeader @toggle-drawer="drawerOpen = !drawerOpen"/>
    <!--<button @click="drawerOpen = !drawerOpen">☰</button>
    <h1>inHabit</h1> -->
  </header>

  <SideDrawer :isOpen="drawerOpen" @close="drawerOpen = false">
    <p>Navigation links go here</p>
  </SideDrawer>

  <div id="app">
    <!-- <AppHeader @toggle-drawer="drawerOpen = !drawerOpen"/> -->
    <SideDrawer :open="drawerOpen" @close="drawerOpen=false" />
    <main class="page-content">
      <router-view />
    </main>
    <Footer />
  </div>
</template>

<script setup>
import { ref } from 'vue';
import AppHeader from '@/components/AppHeader.vue';
import SideDrawer from '@/components/SideDrawer.vue';
import Footer from "@/components/Footer.vue";
const drawerOpen = ref(false);
</script>

<style src="@/styles/main.css">

header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1100; /* header stays on top*/
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #06B6D4;
  color: white;
  padding: 0.5rem 1rem;
}
</style>
