// Generates plausible dummy data for a 4-probe hot water cylinder, for trying out the app
// before the real hot-tank firmware exists. Writes two JSON files for the Firebase CLI:
//   node scripts/dummy-hot-water.mjs <outDir>
//   firebase database:set    /sensors/hot-water-dummy            <outDir>/sensor.json
//   firebase database:set    /sensorDataHistory/hot-water-dummy  <outDir>/history.json
// Delete both nodes to remove the dummy sensor.
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const outDir = process.argv[2] || '.'
const TANK_L = 150
const LAYERS = 4                        // top, upper, lower, bottom probes
const LAYER_L = TANK_L / LAYERS
const COLD_C = 12                       // mains inlet
const AMBIENT_C = 18
const SHOWER = { litres: 64, atC: 40 }  // 8 min × 8 L/min
const BATH = { litres: 100, atC: 40 }
const USABLE_C = 42                     // water cooler than this doesn't count as "hot"
const STEP_S = 30 * 60
const DAYS = 3

// Boiler on (hour ranges, local), and draws: [hour, litres at 40 °C]
const HEATING = [[5.5, 7], [16.5, 18.5]]
const DRAWS = { 7: SHOWER.litres, 7.5: SHOWER.litres, 19.5: SHOWER.litres, 21: BATH.litres }
const BATH_EVENING = new Set([1])       // day index with a bath

const t = [55, 50, 40, 25]              // start: top → bottom, °C

function hotLitresFor(mixedLitres, mixC, hotC) {
  return mixedLitres * (mixC - COLD_C) / (hotC - COLD_C)
}

// Draw `litres` of mixed water: hot leaves from the top, cold enters the bottom.
function draw(mixedLitres) {
  let need = hotLitresFor(mixedLitres, 40, Math.max(t[0], 41))
  while (need > 0) {
    const take = Math.min(need, LAYER_L)
    const f = take / LAYER_L
    for (let i = 0; i < LAYERS - 1; i++) t[i] = t[i] * (1 - f) + t[i + 1] * f
    t[LAYERS - 1] = t[LAYERS - 1] * (1 - f) + COLD_C * f
    need -= take
  }
}

function heat() {   // coil in the lower half; heat rises, top reaches temperature first
  const rates = [11, 12, 13, 10]   // °C per 30 min — a boiler coil reheats the cylinder in under an hour
  for (let i = 0; i < LAYERS; i++) t[i] = Math.min(62 - i * 1.5, t[i] + rates[i])
}

function cool() {
  for (let i = 0; i < LAYERS; i++) t[i] -= (t[i] - AMBIENT_C) * 0.006
  for (let i = 0; i < LAYERS - 1; i++) if (t[i] < t[i + 1]) [t[i], t[i + 1]] = [t[i + 1], t[i]] // stay stratified
}

function uses(amount) {
  let hot = 0
  for (const c of t) if (c >= USABLE_C) hot += LAYER_L * (c - COLD_C)   // "litre-degrees" above cold
  return Math.floor(hot / (amount.litres * (amount.atC - COLD_C)))
}

const round1 = (x) => Math.round(x * 10) / 10
const nowS = Math.floor(Date.now() / 1000)
const startS = nowS - DAYS * 86400
const history = {}
let last = null

for (let ts = startS - (startS % STEP_S); ts <= nowS; ts += STEP_S) {
  const d = new Date(ts * 1000)
  const hour = d.getHours() + d.getMinutes() / 60
  const day = Math.floor((ts - startS) / 86400)
  if (HEATING.some(([a, b]) => hour >= a && hour < b)) heat()
  const litres = DRAWS[hour]
  if (litres && (litres !== BATH.litres || BATH_EVENING.has(day))) draw(litres)
  cool()
  last = {
    showers: uses(SHOWER),
    baths: uses(BATH),
    topTemp: round1(t[0]),
    upperTemp: round1(t[1]),
    lowerTemp: round1(t[2]),
    bottomTemp: round1(t[3])
  }
  history[ts] = last
  last.epoch = ts
}

const epoch = last.epoch
delete last.epoch
for (const v of Object.values(history)) delete v.epoch

const sensor = {
  name: 'Hot Water (dummy)',
  location: 'Ford Rise',
  owner: 'sam.k',
  type: 'hot-water',
  units: 'showers',
  primaryVariable: 'showers',
  variableUnits: { topTemp: '°C', upperTemp: '°C', lowerTemp: '°C', bottomTemp: '°C' },
  graphVariables: ['topTemp', 'upperTemp', 'lowerTemp', 'bottomTemp'],
  variables: last,
  epoch,
  nextUpdate: epoch + STEP_S,
  status: 'ok',
  firmware: 'dummy data',
  alertOffline: false            // it won't report again; don't raise "gone quiet"
}

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'sensor.json'), JSON.stringify(sensor, null, 2))
writeFileSync(join(outDir, 'history.json'), JSON.stringify(history))
console.log(`${Object.keys(history).length} readings; latest:`, last)
