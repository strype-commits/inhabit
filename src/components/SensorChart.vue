<template>
  <div class="chart-wrap">
    <canvas ref="canvas" role="img" :aria-label="`${label} over time`" />
  </div>
</template>

<script setup>
// Thin Chart.js wrapper: a single time-series line. Linear x-axis of epoch ms
// (formatted by hand) so no date adapter dependency is needed.
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  Chart, LineController, LineElement, PointElement, LinearScale, Tooltip, Filler
} from 'chart.js'
import { useUiStore } from '@/stores/ui'
import { formatValue } from '@/utils/formatters'

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, Filler)

const props = defineProps({
  points: { type: Array, required: true }, // [{ x: epochMs, y: number }]
  label: { type: String, default: 'Value' },
  unit: { type: String, default: '' },
  xMin: { type: Number, default: null },   // epoch ms; axis spans the full window even if data is sparse
  xMax: { type: Number, default: null }
})

const canvas = ref(null)
const ui = useUiStore()
let chart = null

function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function tickLabel(ms, spanMs) {
  const d = new Date(ms)
  return spanMs > 2 * 86400000
    ? d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
    : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function build() {
  chart?.destroy()
  if (!canvas.value) return
  const accent = token('--color-accent-1')
  const muted = token('--color-text-muted')
  const grid = token('--color-border')
  const xs = props.points.map((p) => p.x)
  const lo = props.xMin ?? (xs.length ? Math.min(...xs) : 0)
  const hi = props.xMax ?? (xs.length ? Math.max(...xs) : 0)
  const span = hi - lo

  chart = new Chart(canvas.value, {
    type: 'line',
    data: {
      datasets: [{
        label: props.label,
        data: props.points,
        borderColor: accent,
        backgroundColor: `${accent}22`,
        borderWidth: 2,
        pointRadius: props.points.length > 60 ? 0 : 2,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.25
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      scales: {
        x: {
          type: 'linear',
          min: props.xMin ?? undefined,
          max: props.xMax ?? undefined,
          ticks: { color: muted, maxTicksLimit: 6, callback: (v) => tickLabel(v, span) },
          grid: { color: grid }
        },
        y: {
          ticks: { color: muted, callback: (v) => formatValue(v, props.unit) },
          grid: { color: grid }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => new Date(items[0].parsed.x).toLocaleString(),
            label: (item) => formatValue(item.parsed.y, props.unit)
          }
        }
      }
    }
  })
}

onMounted(build)
onBeforeUnmount(() => chart?.destroy())
// Rebuild rather than update: tick format depends on the span of the data,
// and readings arrive every few minutes at most.
watch(() => [props.points, props.unit, props.label, props.xMin, props.xMax], build)
// Colours come from CSS tokens, so rebuild when the theme flips.
watch(() => ui.theme, () => requestAnimationFrame(build))
</script>

<style scoped>
.chart-wrap { position: relative; height: 240px; }
</style>
