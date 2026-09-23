// Generates PWA icons + favicon from the vector logo.
// Run with `npm run gen:icons`; outputs are committed so a plain build doesn't need sharp.
import sharp from 'sharp'
import { readFileSync } from 'fs'

const SOURCE = 'Image Files/inHabit Logo vector.svg'
const BRAND_BG = '#1F2937' // matches --color-surface-strong / manifest theme_color
const OUT = 'public'

const svg = readFileSync(SOURCE)

// Render the logo to fit inside a `size` square, transparent padding around it.
async function fitted(size, scale = 1) {
  const inner = Math.round(size * scale)
  const logo = await sharp(svg, { density: 600 })
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  return { logo, offset: Math.round((size - inner) / 2) }
}

async function icon(name, size, { scale = 0.9, background = BRAND_BG } = {}) {
  const { logo, offset } = await fitted(size, scale)
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: logo, top: offset, left: offset }])
    .png()
    .toFile(`${OUT}/${name}`)
  console.log(`  ${OUT}/${name}`)
}

console.log('Generating icons from', SOURCE)
await icon('pwa-192x192.png', 192)
await icon('pwa-512x512.png', 512)
await icon('maskable-512x512.png', 512, { scale: 0.7 }) // keep inside the ~80% safe zone
await icon('favicon.png', 64, { scale: 1, background: { r: 0, g: 0, b: 0, alpha: 0 } })
