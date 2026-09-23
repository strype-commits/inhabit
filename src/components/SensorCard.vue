<template>
  <router-link :to="`/sensor/${id}`" class="sensor-card">
    <div>
      <div class="title">{{ sensor.name || id }}</div>
      <div class="value">{{ mainValueDisplay }}</div> <!-- {{ mainValueDisplay }} -->
      <div class="meta">{{ sensor.location }} • {{ sensor.status }}</div>
    </div>
  </router-link>
</template>

<script setup>
import { computed } from 'vue';
const props = defineProps({
  id: { type: String, required: true },
  sensor: { type: Object, required: true } // matches your structure
});

// pick a primary variable to show (temperature if present, else first)
const mainValueDisplay = computed(() => {
  if(!props.sensor || !props.sensor.variables) return '—';
  const v = props.sensor.variables;
  if('temperature' in v) return `${v.temperature}°C`;
  if('litres' in v) return `${v.litres} ltrs`;
  if('showers' in v) return `${v.showers} shwrs`;
  if('undefined' in v) return `${v.undefined}`;     // all other types
    // pick first variable:
  const firstKey = Object.keys(v)[0];
  return `${v[firstKey]} ${firstKey}`;
});
</script>
