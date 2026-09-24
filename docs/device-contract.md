# inHabit device data contract — v0.3 (draft)

How sensor devices write to the Firebase Realtime Database, and what the app expects.
Firmware and app are both built to this document; change it first, then the code.

Platform: ESP32 (ESP32-WROOM-DA) over WiFi, Mobizt `Firebase_ESP_Client` library.
Database: `inhabit-webapp-default-rtdb.europe-west1.firebasedatabase.app`.

## Open decisions

| # | Decision | Proposed |
|---|---|---|
| D1 | Device authentication | **Decided:** one shared account `device@strype.uk` for all devices, replacing the legacy database secret |
| D2 | `status` values | `ok` / `sensor-error` / `updating` / `update-failed` (see §4) |
| D3 | Oil reporting rule | Every 4 h, plus immediately on a change of ≥ 20 L, plus the manual button — **implemented in oil-tank 1.0.0** |
| D4 | Loft variables | **Decided:** `pipeTemp`, `loftTemp`, `annexeTemp`, `enclosureTemp` in both live and history (loft-sensor 1.0.0). Legacy history keys (`Pipe`, `Loft`, …) can be migrated once |

## 1. Who owns which field

Each sensor lives at `sensors/{sensorId}`. Fields are owned by **either** the device **or** the app — never both.

| Field | Owner | Notes |
|---|---|---|
| `variables/{name}` | device | Current value of each measured variable |
| `epoch` | device | Unix time (seconds, UTC) of this reading |
| `nextUpdate` | device | Unix time the device will next report. Drives staleness in the app |
| `status` | device | See §4 |
| `firmware` | device | e.g. `"oil-tank 1.0.0"` — helps spot boards on old code |
| `rssi` | device | WiFi signal strength in dBm |
| `bootedAt` | device | Unix time of the last boot (sent with the first report after boot) |
| `updatingTo` | device | Version being installed by OTA (see §8) |
| `name`, `location`, `owner` | app | Set once when the sensor is created; editable later in the app |
| `type`, `units`, `primaryVariable` | app | How the app interprets `variables` |
| `expectedFrequencyMinutes`, `staleAfterMultiplier`, `retentionDays`, `showHistory` | app | "Sensor parameters" card |

**Auto-registration.** On boot the device reads `sensors/{sensorId}`. If that read succeeds, it
writes any of its registration defaults (`name`, `location`, `owner`, `type`, `units`,
`primaryVariable`) that are **missing** — never overwriting existing values. A new device
therefore appears in the app automatically, and an existing one gains new fields; after that
the app owns them.

**Devices must update, never replace.** Use `Firebase.RTDB.updateNode()` with only the
device-owned fields. `setJSON()` on `sensors/{sensorId}` wipes the app-owned fields
(this is what current firmware does).

## 2. Writes per reading

Each reading is two writes:

1. **Live state** — `updateNode("sensors/{sensorId}", {...})`:
   ```json
   {
     "variables": { "litres": 278, "depthCm": 42.7 },
     "epoch": 1790098433,
     "nextUpdate": 1790112833,
     "status": "ok",
     "firmware": "oil-tank 1.0.0",
     "rssi": -67
   }
   ```
2. **History entry** — `setJSON("sensorDataHistory/{sensorId}/{epoch}", {...})`:
   ```json
   { "litres": 278, "depthCm": 42.7 }
   ```
   - Key is the same `epoch` as the live write (Unix **seconds**).
   - Field names **must match** the `variables` names, so the app can graph them.
   - Only numeric values. Include every variable worth graphing; omit the rest.

## 3. Time

- Timestamps are Unix **seconds**, UTC, from NTP (`configTime(0, 0, "pool.ntp.org")`).
- **Never upload before time is synced.** Treat `time(nullptr) < 1700000000` as "not synced":
  skip the upload and retry shortly. (Current firmware can upload with an unsynced clock,
  which produces junk history keys near 0.)
- `nextUpdate = epoch + seconds until the next scheduled report`. Always send it, including
  when the interval changes (loft board's adaptive interval).

## 4. Status and sensor failures

| `status` | Meaning | Device behaviour |
|---|---|---|
| `ok` | Reading taken and plausible | Normal live + history writes |
| `probe-fault` | Some probes failed; the rest reported | Normal writes with the failed variables omitted |
| `sensor-error` | A probe failed or gave an impossible value | Update `status`, `epoch`, `nextUpdate` only. **Do not** write `variables` or history |
| `updating` | Installing a new firmware build | Set just before download; next status comes from the new build |
| `update-failed` | Download or verification failed | Device keeps running its current build |

Plausibility checks, per sensor:
- **Ultrasonic depth:** `pulseIn()` returning 0 (timeout) is a failure — not "0 cm away",
  which read as a full tank in the legacy firmware. oil-tank 1.0.0 takes the median of 5 pings
  and needs at least 3 valid ones.
- **DS18B20:** `DEVICE_DISCONNECTED_C` (−127) or exactly 85.0 (power-on value) is a failure —
  not 0 °C.

## 5. Reporting frequency

Report on a schedule **and** on meaningful change, never every loop:

| Sensor | Schedule | Also report when |
|---|---|---|
| `0158-oil-volume` (`litres`, `depthCm`) | every 4 h | level changes ≥ 20 L since last report (checked every 5 min); button press |
| `loftSensor` (`pipeTemp`, `loftTemp`, `annexeTemp`, `enclosureTemp`) | by lowest probe: < 3 °C every 15 min, < 8 °C hourly, else 3 h (0.5 °C hysteresis) | measured every minute; immediately on a zone change confirmed by two consecutive measurements |

Write budget: at most ~100 writes/day per device. A 1-minute interval (≈ 2,900 writes/day)
is out of contract.

## 6. Authentication (D1)

**Today:** every device holds the same legacy database secret. It bypasses all security
rules, so any one board (or its source file) gives full read/write/delete access to the
whole database.

**Decided:** one shared Firebase Auth account, `device@strype.uk`, for all devices, signed in
with `auth.user.email` / `auth.user.password`. Its `/users/{uid}` profile is
`{ "role": "device", "email": "device@strype.uk" }`. Security rules let the device role:
- write the device-owned fields of any sensor (§1), and the registration fields only when
  they don't exist yet;
- create (never overwrite or delete) history entries;
- read sensors (for the registration check) and read/clear `commands`.

Trade-off: a shared account can't be limited to one sensor per board, so a compromised
board could write readings for any sensor — but it can no longer read users, change
sensor parameters or delete history. Per-device accounts can be added later without
firmware changes beyond `secrets.h`.

Once all boards are reflashed, the legacy secret is deleted in the Firebase console.
Until then it keeps working, so boards can be migrated one at a time.

## 7. Connectivity

- Try each configured SSID in turn; reconnect in `loop()` if WiFi drops
  (WiFiMulti — strongest known network wins; retried every 30 s).
- If a write fails, retry on the next loop pass with backoff (30 s, 1 min, 2 min … max 15 min).
  No offline buffering in v1: a missed reading is shown as a gap.

## 8. Over-the-air (OTA) updates

No Arduino Cloud needed — devices pull updates from Firebase Hosting (free).

- Firmware images live at `https://inhabit-firmware.web.app/{firmwareName}/`, with a
  `manifest.json`: `{ "version": "1.0.1", "file": "oil-tank-1.0.1.bin", "md5": "…", "size": … }`.
  Published by `npm run fw:publish -- {sketch}` after bumping `FW_VERSION`.
- Devices check the manifest after their first successful report after boot, then every 24 h.
  Setting `commands/{sensorId}/checkUpdate: true` makes the device check right after its
  next report (the device deletes the flag).
- Downloads are HTTPS, verified against the ESP32 core's root CA bundle, and the image is
  checked against the manifest's MD5 before it can boot.
- **Rollback:** a new build boots in "pending verify". It is confirmed only once it has
  reached Firebase. If it crashes, reboots, or can't report within 15 minutes, the board
  returns to the previous build automatically. A bad release cannot strand a remote board.
- Boards need one USB flash to get OTA-capable firmware and the `no_fs` partition layout
  (2 MB app × 2). Every update after that is over the air.

## 9. Commands

`commands/{sensorId}/{command}: true` — read and cleared by the device after each report.

| Command | Effect |
|---|---|
| `checkUpdate` | Check for and install new firmware now |

## Changelog

- **v0.3 (2026-09-24)** — Registration fills missing fields. Loft: frost zones, `probe-fault`
  status, new variable names (D4).
- **v0.2 (2026-09-23)** — Auto-registration kept (write defaults only if the sensor is new).
  OTA via Firebase Hosting with rollback (§8), commands (§9). Oil board: temperature probe
  removed (was on pin 32 with the button), `depthCm` added. Status values revised.
- **v0.1 (2026-09-23)** — First draft from review of `OilLevelVolumeESP32Firebase` (Oct 2025)
  and `TempDeviceV3.0.1` (Nov 2025).
