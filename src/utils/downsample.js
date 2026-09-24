// Average time-sorted points into at most `max` equal-time buckets, so long ranges
// draw quickly without changing the shape of the line. Short series pass through untouched.
//
// Pass the window bounds (`start`, `end`) when plotting several series together: buckets
// are then fixed to the window and each point sits at its bucket's centre, so every
// series shares the same x positions and one hover shows all of them. `force` buckets even
// short series, so a set of series can be averaged all-or-nothing.
export function downsample(points, max, start = null, end = null, force = false) {
  if (!points.length || (!force && points.length <= max)) return points
  const lo = start ?? points[0].x
  const hi = end ?? points.at(-1).x
  const width = (hi - lo) / max || 1
  const aligned = start != null && end != null
  const buckets = new Map()
  for (const p of points) {
    const i = Math.max(0, Math.min(max - 1, Math.floor((p.x - lo) / width)))
    const b = buckets.get(i) ?? { x: 0, y: 0, n: 0 }
    b.x += p.x; b.y += p.y; b.n++
    buckets.set(i, b)
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([i, b]) => ({ x: aligned ? lo + (i + 0.5) * width : b.x / b.n, y: b.y / b.n }))
}
