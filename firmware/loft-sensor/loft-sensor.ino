// inHabit loft frost sensor — ESP32-WROOM-DA + 4 × DS18B20 on one OneWire bus.
// Measures every minute but only reports when it matters: a slow heartbeat when warm,
// faster as it gets colder, and immediately when it crosses into a colder (or warmer) zone.
// Writes to Firebase per docs/device-contract.md via the InhabitDevice library.
#include <InhabitDevice.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include "secrets.h"

#define FW_VERSION "1.0.1"

// ===== Probes =====
#define ONE_WIRE_BUS 4

struct Probe {
  const char* variable;     // name in Firebase variables / history
  DeviceAddress address;
  float lastC;              // NAN if the last read failed
};

Probe probes[] = {
  { "pipeTemp",      { 0x28, 0x7A, 0xCF, 0x80, 0xE3, 0xE1, 0x3C, 0x52 }, NAN },
  { "enclosureTemp", { 0x28, 0xBE, 0x09, 0x57, 0x04, 0xE1, 0x3C, 0x95 }, NAN },
  { "loftTemp",      { 0x28, 0xAF, 0xE1, 0x57, 0x04, 0xE1, 0x3C, 0x1D }, NAN },
  { "annexeTemp",    { 0x28, 0x92, 0xC8, 0x57, 0x04, 0xE1, 0x3C, 0xB1 }, NAN },
};
const int PROBE_COUNT = sizeof(probes) / sizeof(probes[0]);

// ===== Frost zones (by the lowest probe reading) =====
// Reporting speeds up as it gets colder so a cold snap is captured in detail.
struct Zone {
  const char* name;
  float belowC;                 // zone applies when the lowest reading is below this
  uint32_t reportIntervalS;
};
const Zone ZONES[] = {
  { "danger", 3.0,     15UL * 60UL },    // < 3 °C: every 15 min
  { "watch",  8.0,     60UL * 60UL },    // < 8 °C: hourly
  { "normal", 1000.0,  480UL * 60UL },   // otherwise: every 8 h (day/night trend)
};
const int ZONE_COUNT = sizeof(ZONES) / sizeof(ZONES[0]);
const float HYSTERESIS_C = 0.5;          // must warm this far past a boundary to leave a colder zone

const unsigned long MEASURE_INTERVAL_MS = 60UL * 1000UL;
const unsigned long RETRY_MIN_MS = 30UL * 1000UL;
const unsigned long RETRY_MAX_MS = 15UL * 60UL * 1000UL;

InhabitConfig config = {
  "loftSensor",            // sensorId
  "loft-sensor",           // firmwareName (OTA channel)
  FW_VERSION,
  { "Loft Enclosure", "Annexe", "sam.k", "temperature", "°C", "pipeTemp" },
  wifi_ssids, wifi_passwords, wifi_count,
  DATABASE_URL,
  FIREBASE_API_KEY, DEVICE_EMAIL, DEVICE_PASSWORD,
  FIREBASE_LEGACY_TOKEN,
  OTA_BASE_URL
};
InhabitDevice device(config);

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature dallas(&oneWire);

// ===== State =====
unsigned long lastMeasureMs = 0;
int reportedZone = -1;           // zone at the last successful report
int candidateZone = -1;          // zone seen on the previous measurement (for confirmation)
uint32_t lastReportEpoch = 0;
bool reportPending = true;       // report once at boot
unsigned long retryDelayMs = RETRY_MIN_MS;
unsigned long nextRetryMs = 0;

// ===== Measurement =====

// Reads every probe into lastC. Returns the lowest valid reading, or NAN if all failed.
float measureAll() {
  dallas.requestTemperatures();
  float lowest = NAN;
  for (int i = 0; i < PROBE_COUNT; i++) {
    float c = dallas.getTempC(probes[i].address);
    // -127 = disconnected; exactly 85.0 = power-on default (conversion didn't happen)
    bool valid = c != DEVICE_DISCONNECTED_C && c != 85.0 && c > -55.0 && c < 125.0;
    probes[i].lastC = valid ? roundf(c * 10) / 10.0 : NAN;
    if (valid && (isnan(lowest) || c < lowest)) lowest = c;
  }
  return lowest;
}

// Zone for a temperature, with hysteresis relative to the currently reported zone:
// entering a colder zone is immediate, leaving it needs HYSTERESIS_C of warming.
int zoneFor(float lowestC) {
  for (int z = 0; z < ZONE_COUNT; z++) {
    float limit = ZONES[z].belowC;
    if (reportedZone >= 0 && z >= reportedZone) limit += HYSTERESIS_C;
    if (lowestC < limit) return z;
  }
  return ZONE_COUNT - 1;
}

// ===== Reporting =====

void report() {
  uint32_t nowEpoch = device.now();
  if (!nowEpoch || !device.ready()) return scheduleRetry();

  float lowest = measureAll();
  int zone = isnan(lowest) ? (reportedZone >= 0 ? reportedZone : ZONE_COUNT - 1) : zoneFor(lowest);
  uint32_t nextUpdate = nowEpoch + ZONES[zone].reportIntervalS;
  bool ok;

  if (isnan(lowest)) {
    Serial.println("[loft] all probes failed");
    ok = device.publishError("sensor-error", nextUpdate);
  } else {
    FirebaseJson vars;
    int valid = 0;
    for (int i = 0; i < PROBE_COUNT; i++) {
      if (isnan(probes[i].lastC)) continue;
      vars.set(probes[i].variable, probes[i].lastC);
      valid++;
    }
    Serial.printf("[loft] lowest %.1f C, zone %s, %d/%d probes\n", lowest, ZONES[zone].name, valid, PROBE_COUNT);
    ok = device.publish(vars, nextUpdate, valid == PROBE_COUNT ? "ok" : "probe-fault");
  }

  if (!ok) return scheduleRetry();
  reportedZone = zone;
  candidateZone = zone;
  lastReportEpoch = nowEpoch;
  reportPending = false;
  retryDelayMs = RETRY_MIN_MS;
}

void scheduleRetry() {
  nextRetryMs = millis() + retryDelayMs;
  Serial.printf("[loft] report failed, retrying in %lu s\n", retryDelayMs / 1000);
  retryDelayMs = min(retryDelayMs * 2, RETRY_MAX_MS);
}

// Every minute: report when the zone's interval is up, or when the zone has changed
// on two consecutive measurements (so one odd reading can't trigger a report).
void periodicCheck() {
  uint32_t nowEpoch = device.now();
  if (reportedZone >= 0 && nowEpoch && lastReportEpoch &&
      nowEpoch - lastReportEpoch >= ZONES[reportedZone].reportIntervalS) {
    reportPending = true;
    return;
  }

  float lowest = measureAll();
  if (isnan(lowest) || reportedZone < 0) return;
  int zone = zoneFor(lowest);
  if (zone != reportedZone && zone == candidateZone) {
    Serial.printf("[loft] zone %s -> %s (lowest %.1f C)\n", ZONES[reportedZone].name, ZONES[zone].name, lowest);
    reportPending = true;
  }
  candidateZone = zone;
}

// ===== Arduino entry points =====

void setup() {
  Serial.begin(115200);
  delay(500);
  dallas.begin();
  Serial.printf("[loft] %d OneWire device(s) found\n", dallas.getDeviceCount());
  device.begin();
  lastMeasureMs = millis();
}

void loop() {
  device.loop();

  if (millis() - lastMeasureMs >= MEASURE_INTERVAL_MS) {
    lastMeasureMs = millis();
    if (!reportPending) periodicCheck();
  }

  if (reportPending && millis() >= nextRetryMs) report();

  delay(50);
}
