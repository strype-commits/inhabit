// Firmware build / flash / OTA publish for inHabit devices.
//
//   npm run fw:build   -- <sketch>           compile firmware/<sketch>
//   npm run fw:publish -- <sketch>           compile, stage for OTA, deploy to inhabit-firmware.web.app
//   node scripts/firmware.mjs flash <sketch> <COMx>   compile and upload over USB
//
// The version comes from `#define FW_VERSION "x.y.z"` in the sketch; bump it before publishing.
import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'

const FQBN = 'esp32:esp32:esp32da:PartitionScheme=no_fs'   // 2 MB app ×2, required for OTA
const CLI = process.env.ARDUINO_CLI
  || ['C:\\Program Files\\Arduino PLC IDE Tools\\arduino-cli.exe'].find(existsSync)
  || 'arduino-cli'

const [command, sketch, port] = process.argv.slice(2)
if (!['build', 'publish', 'flash'].includes(command) || !sketch) {
  console.error('usage: firmware.mjs build|publish|flash <sketch> [COMx]')
  process.exit(1)
}

const sketchDir = resolve('firmware', sketch)
const inoPath = join(sketchDir, `${sketch}.ino`)
if (!existsSync(inoPath)) throw new Error(`No sketch at ${inoPath}`)
if (!existsSync(join(sketchDir, 'secrets.h'))) throw new Error(`Missing ${sketch}/secrets.h (see secrets.h.example)`)

const version = readFileSync(inoPath, 'utf8').match(/#define\s+FW_VERSION\s+"([^"]+)"/)?.[1]
if (!version) throw new Error('FW_VERSION not found in sketch')

const buildDir = join(tmpdir(), `inhabit-fw-${sketch}`)
const run = (args) => execFileSync(CLI, args, { stdio: 'inherit' })

console.log(`\n${sketch} ${version} — compiling (${FQBN})`)
run(['compile', '--fqbn', FQBN, '--libraries', resolve('firmware', 'libraries'), '--build-path', buildDir, sketchDir])
const bin = join(buildDir, `${sketch}.ino.bin`)

if (command === 'flash') {
  if (!port) throw new Error('flash needs a COM port, e.g. COM5')
  console.log(`\nUploading to ${port}`)
  run(['upload', '--fqbn', FQBN, '--input-dir', buildDir, '-p', port, sketchDir])
}

if (command === 'publish') {
  const outDir = resolve('firmware', 'public', sketch)
  const manifestPath = join(outDir, 'manifest.json')
  const file = `${sketch}-${version}.bin`
  if (existsSync(manifestPath) && JSON.parse(readFileSync(manifestPath, 'utf8')).version === version) {
    throw new Error(`${version} is already the published version — bump FW_VERSION first`)
  }
  mkdirSync(outDir, { recursive: true })
  copyFileSync(bin, join(outDir, file))
  const data = readFileSync(bin)
  const manifest = {
    version,
    file,
    md5: createHash('md5').update(data).digest('hex'),
    size: data.length,
    publishedAt: new Date().toISOString()
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`\nStaged ${file} (${data.length} bytes, md5 ${manifest.md5})`)
  execFileSync('firebase', ['deploy', '--only', 'hosting:firmware'], { stdio: 'inherit', shell: true })
  console.log(`\nPublished. Devices on "${sketch}" will install ${version} at their next check (≤ 24 h),`)
  console.log(`or immediately after their next report if commands/<sensorId>/checkUpdate is set to true.`)
}
