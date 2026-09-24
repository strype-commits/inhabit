// Average time-sorted points into at most `max` equal-time buckets, so long ranges
// draw quickly without changing the shape of the line. Short series pass through untouched.
export function downsample(points, max) {
  if (points.length <= max) return points
  const start = points[0].x
  const width = (points.at(-1).x - start) / max || 1
  const buckets = new Map()
  for (const p of points) {
    const i = Math.min(max - 1, Math.floor((p.x - start) / width))
    const b = buckets.get(i) ?? { x: 0, y: 0, n: 0 }
    b.x += p.x; b.y += p.y; b.n++
    buckets.set(i, b)
  }
  return [...buckets.values()].map((b) => ({ x: b.x / b.n, y: b.y / b.n }))
}
