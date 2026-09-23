<template>
  <div>
    <h1>My Dashboard</h1>
  </div>
  <section>
    <div class="dashboard-grid">
      <SensorCard v-for="(s, id) in sensors" :key="id" :id="id" :sensor="s" />
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import SensorCard from '../components/SensorCard.vue';
import { ref as dbRef, onValue } from 'firebase/database';
import { db } from '../services/firebase.js';

const sensors = ref({});

let unsub = null;
onMounted(()=>{
  const sensorsRef = dbRef(db, 'sensors');
  unsub = onValue(sensorsRef, (snap) => {
    sensors.value = snap.val() || {};
  });
});
onUnmounted(()=>{ if(unsub) unsub(); });
</script>

<style src="../styles/page-dashboard.css"></style>
