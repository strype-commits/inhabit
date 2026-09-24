# inHabit firmware

Sketches for the inHabit sensor devices. They write to Firebase as defined in
[../docs/device-contract.md](../docs/device-contract.md).

| Folder | Board | Status |
|---|---|---|
| `libraries/InhabitDevice` | ESP32 | Shared library: WiFi, NTP, Firebase writes, auto-registration, OTA + rollback |
| `legacy/OilLevelVolumeESP32Firebase` | ESP32-WROOM-DA | Reference copy of the firmware currently on the oil tank board (Oct 2025) |
| `legacy/TempDeviceV3` | ESP32-WROOM-DA | Reference copy of the loft sensor firmware (V3.0.1, Nov 2025) |
| `oil-tank/` | ESP32-WROOM-DA | Firmware 1.0.3 — in service, updates over WiFi |
| `loft-sensor/` | ESP32-WROOM-DA | Firmware 1.0.0 — compiled, awaiting first USB flash |
| `hot-tank/` | TBC | Concept |

## Secrets

Each sketch has a `secrets.h` with WiFi networks and Firebase credentials. It is **gitignored**;
copy `secrets.h.example` in the same folder and fill it in. Never commit real values.

## Build, flash and publish

```powershell
npm run fw:build   -- oil-tank                    # compile only
node scripts/firmware.mjs flash oil-tank COM5     # compile + USB upload (first flash of each board)
npm run fw:publish -- oil-tank                    # compile + publish for OTA (bump FW_VERSION first)
```

Serial output: `arduino-cli monitor -p COM5 -c baudrate=115200`. Find the port with `arduino-cli board list`.
Builds use FQBN `esp32:esp32:esp32da:PartitionScheme=no_fs` (2 MB app × 2, needed for OTA).

- Close any other serial monitor first; it locks the COM port.
- If upload stalls on "Connecting…", hold the board's BOOT button until it starts.

Libraries (installed in `Documents/Arduino/libraries`): Firebase Arduino Client Library for
ESP8266 and ESP32 (Mobizt) 4.4.17, OneWire 2.3.8, DallasTemperature 4.0.5. Core: esp32 3.3.2.
