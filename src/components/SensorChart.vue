<template>
  <div>
    <div class="chart-wrap">
      <canvas ref="canvas" role="img" :aria-label="ariaLabel" />
    </div>

    <!-- Legend: always shown for 2+ series. Click to hide/show a trace; colour never changes. -->
    <ul v-if="series.length > 1" class="legend">
      <li v-for="s in series" :key="s.key">
        <button type="button" class="legend-item" :class="{ off: hidden[s.key] }"
                :aria-pressed="!hidden[s.key]" @click="toggle(s.key)">
          <span class="swatch" :style="{ background: colorOf(s) }" aria-hidden="true" />
          <span class="legend-label">{{ s.label }}</span>
          <span class="legend-value">{{ latest(s) }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup>
// Thin Chart.js wrapper for time series on one shared y-axis. Linear x-axis of epoch ms
// (formatted by hand) so no date adapter dependency is needed.
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  Chart, LineController, LineElement, PointElement, LinearScale, Tooltip, Filler
} from 'chart.js'
import { useUiStore } from '@/stores/ui'
import { formatValue } from '@/utils/formatters'

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, Filler)

const props = defineProps({
  // [{ key, label, colorSlot (1–8), points: [{ x: epochMs, y }] }]
  series: { type: Array, required: true },
  unit: { type: String, default: '' },
  xMin: { type: Number, default: null },   // epoch ms; axis spans the full window even if data is sparse
  xMax: { type: Number, default: null }
})

const canvas = ref(null)
const ui = useUiStore()
const hidden = reactive({})
let chart = null

const ariaLabel = computed(() => `${props.series.map((s) => s.label).join(', ')} over time`)

function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
const colorOf = (s) => token(`--series-${s.colorSlot}`) || token('--color-accent-1')

function latest(s) {
  const p = s.points.at(-1)
  return p ? formatValue(p.y, props.unit) : '—'
}

function toggle(key) {
  hidden[key] = !hidden[key]
  if (!chart) return
  chart.data.datasets.forEach((d) => { d.hidden = !!hidden[d.key] })
  chart.update()
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
  const muted = token('--color-text-muted')
  const grid = token('--color-border')
  const surface = token('--color-surface')
  const single = props.series.length === 1
  const all = props.series.flatMap((s) => s.points.map((p) => p.x))
  const lo = props.xMin ?? (all.length ? Math.min(...all) : 0)
  const hi = props.xMax ?? (all.length ? Math.max(...all) : 0)
  const span = hi - lo

  chart = new Chart(canvas.value, {
    type: 'line',
    data: {
      datasets: props.series.map((s) => {
        const color = colorOf(s)
        const dense = s.points.length > 60
        return {
          key: s.key,
          label: s.label,
          data: s.points,
          hidden: !!hidden[s.key],
          borderColor: color,
          backgroundColor: single ? `${color}22` : color,
          borderWidth: 2,
          pointRadius: dense ? 0 : 2,
          pointHoverRadius: 4,
          pointHoverBorderWidth: 2,
          pointHoverBorderColor: surface,     // surface ring so overlapping hovers stay distinct
          fill: single,                       // area fill only for a lone series
          tension: 0.25
        }
      })
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      // Series share x positions (same history entries / aligned buckets), so one hover
      // collects every visible series at that time.
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
            label: (item) => single
              ? formatValue(item.parsed.y, props.unit)
              : `${item.dataset.label}: ${formatValue(item.parsed.y, props.unit)}`
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
watch(() => [props.series, props.unit, props.xMin, props.xMax], build)
// Colours come from CSS tokens, so rebuild when the theme flips.
watch(() => ui.theme, () => requestAnimationFrame(build))
</script>

<style scoped>
.chart-wrap { position: relative; height: 240px; }

.legend {
  list-style: none;
  margin: var(--space-3) 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: none;
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;
}
.legend-item.off { opacity: 0.45; }
.legend-item.off .legend-label { text-decoration: line-through; }
.swatch { width: 12px; height: 12px; border-radius: var(--radius-sm); flex: none; }
.legend-value { color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
</style>
