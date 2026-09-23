<template>
  <div style="padding:16px">
    <h2>{{ sensor?.name || id }}</h2>
    <div v-if="sensor">
      <div>Location: {{ sensor.location }}</div>
      <div>Status: {{ sensor.status }}</div>

      <h3>Current values</h3>
      <ul>
        <p v-for="(val,key) in sensor.variables" :key="key">{{ val }} {{ key }}</p>
      </ul>

      <h3>History (recent)</h3>
      <ul>
        <li v-for="(entry,ts) in history" :key="ts">{{ new Date(+ts * 1000).toLocaleString() }} — {{ JSON.stringify(entry) }}</li>
      </ul>
    </div>
    <div v-else>Loading…</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
/*import { db } from '../services/firebase';*/
import { db, subscribeToSensor } from '../services/firebase.js';
import { ref as dbRef, onValue } from 'firebase/database';

const route = useRoute();
const id = route.params.id;
const sensor = ref(null);
const history = ref({});

onMounted(()=>{
  const sref = dbRef(db, `sensors/${id}`);
  onValue(sref, snap => sensor.value = snap.val());

  const href = dbRef(db, `sensorDataHistory/${id}`);
  onValue(href, snap => history.value = snap.val() || {});
});
</script>
