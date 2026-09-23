// inHabit oil tank sensor — ESP32-WROOM-DA + ultrasonic depth sensor (HC-SR04 style).
// Writes to Firebase per docs/device-contract.md via the InhabitDevice library.
#include <InhabitDevice.h>
#include "secrets.h"

#define FW_VERSION "1.0.3"

// ===== Pins =====
#define TRIG_PIN 27
#define ECHO_PIN 26
#define BUTTON_PIN 32   // manual "report now" (active high, internal pull-down)
#define LED_GREEN 14
#define LED_RED 4

// ===== Tank calibration =====
// The tank isn't a true cylinder (ribs, non-planar ends), so volume uses a horizontal-cylinder
// fill curve scaled between the measured empty level and nominal capacity.
const float SENSOR_HEIGHT_CM = 97.5;     // sensor face to the run-out level, measured on an empty tank (Sep 2026)
const float TANK_CAPACITY_L = 2000.0;    // nominal volume with oil up to the sensor
const float MIN_RELIABLE_CM = 10.0;      // ultrasonic readings closer than this are unreliable
const float MAX_RANGE_CM = 200.0;        // generous, so an empty tank still reports its true distance

// ===== Reporting (contract §5) =====
const uint32_t REPORT_INTERVAL_S = 4UL * 3600UL;               // scheduled report every 4 h
const unsigned long MEASURE_INTERVAL_MS = 5UL * 60UL * 1000UL; // check level every 5 min
const float CHANGE_THRESHOLD_L = 100.0;                         // report early on a change this big:
                                                                // above thermal expansion, catches deliveries
const unsigned long RETRY_MIN_MS = 30UL * 1000UL;
const unsigned long RETRY_MAX_MS = 15UL * 60UL * 1000UL;

InhabitConfig config = {
  "0158-oil-volume",       // sensorId
  "oil-tank",              // firmwareName (OTA channel)
  FW_VERSION,
  { "Heating Oil", "Ford Rise", "sam.k", "oil-tank", "litres", "litres" },
  wifi_ssids, wifi_passwords, wifi_count,
  DATABASE_URL,
  FIREBASE_API_KEY, DEVICE_EMAIL, DEVICE_PASSWORD,
  FIREBASE_LEGACY_TOKEN,
  OTA_BASE_URL
};
InhabitDevice device(config);

// ===== State =====
unsigned long lastMeasureMs = 0;
uint32_t lastReportEpoch = 0;
float lastReportedLitres = NAN;
bool reportPending = true;              // report once at boot
unsigned long retryDelayMs = RETRY_MIN_MS;
unsigned long nextRetryMs = 0;
unsigned long lastButtonMs = 0;

// ===== LEDs =====
unsigned long ledLastMs = 0;
bool ledOn = false;

void blink(int pin, int times, int ms) {
  for (int i = 0; i < times; i++) {
    digitalWrite(pin, HIGH); delay(ms);
    digitalWrite(pin, LOW);  delay(ms);
  }
}

// Slow green pulse when online, fast red when WiFi is down.
void updateStatusLed() {
  bool online = device.wifiConnected();
  unsigned long interval = online ? 2000 : 250;
  if (millis() - ledLastMs >= interval) {
    ledOn = !ledOn;
    digitalWrite(LED_GREEN, online ? ledOn : LOW);
    digitalWrite(LED_RED, online ? LOW : ledOn);
    ledLastMs = millis();
  }
}

// ===== Measurement =====

// One ultrasonic ping. Returns distance in cm, or NAN on timeout / out of range.
float pingDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long us = pulseIn(ECHO_PIN, HIGH, 30000);
  if (us == 0) return NAN;                       // timeout - NOT "0 cm away"
  float cm = us * 0.0343 / 2.0;
  if (cm < MIN_RELIABLE_CM || cm > MAX_RANGE_CM) return NAN;
  return cm;
}

// Median of 5 pings for stability. Returns distance to the surface in cm, or NAN if the sensor failed.
float measureDistanceCm() {
  float d[5];
  int n = 0;
  for (int i = 0; i < 5; i++) {
    float cm = pingDistanceCm();
    if (!isnan(cm)) d[n++] = cm;
    delay(60);
  }
  if (n < 3) return NAN;
  for (int i = 1; i < n; i++) {                   // insertion sort
    float v = d[i]; int j = i - 1;
    while (j >= 0 && d[j] > v) { d[j + 1] = d[j]; j--; }
    d[j + 1] = v;
  }
  return d[n / 2];
}

float depthFromDistance(float distanceCm) {
  return constrain(SENSOR_HEIGHT_CM - distanceCm, 0.0, SENSOR_HEIGHT_CM);
}

// Litres at depthCm: the filled fraction of a circular cross-section, (θ − sin θ) / 2π,
// scaled so 0 cm = empty and SENSOR_HEIGHT_CM = TANK_CAPACITY_L.
float litresFromDepth(float depthCm) {
  float f = constrain(depthCm / SENSOR_HEIGHT_CM, 0.0, 1.0);
  float theta = 2.0 * acos(1.0 - 2.0 * f);
  return TANK_CAPACITY_L * (theta - sin(theta)) / (2.0 * PI);
}

// ===== Reporting =====

void report() {
  uint32_t nowEpoch = device.now();
  if (!nowEpoch || !device.ready()) return scheduleRetry();

  uint32_t nextUpdate = nowEpoch + REPORT_INTERVAL_S;
  float distance = measureDistanceCm();
  bool ok;

  if (isnan(distance)) {
    Serial.println("[oil] depth sensor failed, or surface closer than 10 cm");
    ok = device.publishError("sensor-error", nextUpdate);
  } else {
    float depth = depthFromDistance(distance);
    float litres = litresFromDepth(depth);
    Serial.printf("[oil] distance %.1f cm, depth %.1f cm, %.0f L\n", distance, depth, litres);
    FirebaseJson vars;
    vars.set("litres", (int)roundf(litres));
    vars.set("depthCm", roundf(depth * 10) / 10.0);
    vars.set("distanceCm", roundf(distance * 10) / 10.0);
    ok = device.publish(vars, nextUpdate);
    if (ok) lastReportedLitres = litres;
  }

  if (!ok) return scheduleRetry();
  blink(LED_GREEN, 5, 60);
  lastReportEpoch = nowEpoch;
  reportPending = false;
  retryDelayMs = RETRY_MIN_MS;
}

void scheduleRetry() {
  blink(LED_RED, 3, 100);
  nextRetryMs = millis() + retryDelayMs;
  Serial.printf("[oil] report failed, retrying in %lu s\n", retryDelayMs / 1000);
  retryDelayMs = min(retryDelayMs * 2, RETRY_MAX_MS);
}

// Every few minutes: report early if the scheduled time has come or the level moved a lot.
void periodicCheck() {
  uint32_t nowEpoch = device.now();
  if (nowEpoch && lastReportEpoch && nowEpoch - lastReportEpoch >= REPORT_INTERVAL_S) {
    reportPending = true;
    return;
  }
  if (isnan(lastReportedLitres)) return;
  float distance = measureDistanceCm();
  if (isnan(distance)) return;
  float change = litresFromDepth(depthFromDistance(distance)) - lastReportedLitres;
  if (fabs(change) < CHANGE_THRESHOLD_L) return;

  // Confirm with a second measurement so a stray echo can't trigger a report.
  delay(2000);
  float again = measureDistanceCm();
  if (isnan(again)) return;
  float change2 = litresFromDepth(depthFromDistance(again)) - lastReportedLitres;
  if (fabs(change2) >= CHANGE_THRESHOLD_L && (change > 0) == (change2 > 0)) {
    Serial.printf("[oil] level changed by %.0f L (confirmed)\n", change2);
    reportPending = true;
  }
}

// ===== Arduino entry points =====

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(BUTTON_PIN, INPUT_PULLDOWN);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  blink(LED_RED, 2, 300);

  device.begin();
  lastMeasureMs = millis();
}

void loop() {
  device.loop();
  updateStatusLed();

  if (digitalRead(BUTTON_PIN) == HIGH && millis() - lastButtonMs > 2000) {
    lastButtonMs = millis();
    Serial.println("[oil] button: report now");
    reportPending = true;
    nextRetryMs = 0;
  }

  if (millis() - lastMeasureMs >= MEASURE_INTERVAL_MS) {
    lastMeasureMs = millis();
    if (!reportPending) periodicCheck();
  }

  if (reportPending && millis() >= nextRetryMs) report();

  delay(50);
}
