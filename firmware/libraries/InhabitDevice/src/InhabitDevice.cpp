#include "InhabitDevice.h"

#include <WiFi.h>
#include <WiFiMulti.h>
#include <HTTPClient.h>
#include <NetworkClientSecure.h>
#include <Update.h>
#include <esp_ota_ops.h>
#include <time.h>
#include "addons/TokenHelper.h"

// Root CA bundle compiled into the ESP32 core — lets OTA downloads verify HTTPS certificates.
extern const uint8_t x509_crt_bundle_start[] asm("_binary_x509_crt_bundle_start");
extern const uint8_t x509_crt_bundle_end[] asm("_binary_x509_crt_bundle_end");

// Keep a freshly OTA-installed build in "pending verify" until it proves it can report.
// If it crashes or reboots first, the bootloader rolls back to the previous build.
extern "C" bool verifyRollbackLater() { return true; }

namespace {

constexpr uint32_t kMinValidEpoch = 1700000000;              // before this, the clock isn't synced
constexpr unsigned long kWifiRetryMs = 30UL * 1000UL;
constexpr unsigned long kRegisterRetryMs = 60UL * 1000UL;
constexpr unsigned long kOtaCheckIntervalMs = 24UL * 3600UL * 1000UL;
constexpr unsigned long kVerifyDeadlineMs = 15UL * 60UL * 1000UL;  // unproven OTA build gets 15 min

WiFiMulti wifiMulti;

// "1.2.10" > "1.2.9"
bool isNewerVersion(const String& candidate, const char* current) {
  int a[3] = {0, 0, 0}, b[3] = {0, 0, 0};
  sscanf(candidate.c_str(), "%d.%d.%d", &a[0], &a[1], &a[2]);
  sscanf(current, "%d.%d.%d", &b[0], &b[1], &b[2]);
  for (int i = 0; i < 3; i++) {
    if (a[i] != b[i]) return a[i] > b[i];
  }
  return false;
}

String jsonString(FirebaseJson& json, const char* key) {
  FirebaseJsonData d;
  json.get(d, key);
  return d.success ? d.stringValue : String();
}

}  // namespace

InhabitDevice::InhabitDevice(const InhabitConfig& config) : cfg_(config) {}

String InhabitDevice::sensorPath() const {
  return String("/sensors/") + cfg_.sensorId;
}

bool InhabitDevice::wifiConnected() const { return WiFi.status() == WL_CONNECTED; }

bool InhabitDevice::timeSynced() const { return time(nullptr) >= kMinValidEpoch; }

uint32_t InhabitDevice::now() const {
  time_t t = time(nullptr);
  return t >= kMinValidEpoch ? (uint32_t)t : 0;
}

bool InhabitDevice::ready() {
  return wifiConnected() && timeSynced() && Firebase.ready();
}

void InhabitDevice::connectWifi(uint32_t timeoutMs) {
  lastWifiAttemptMs_ = millis();
  Serial.println("[wifi] connecting...");
  if (wifiMulti.run(timeoutMs) == WL_CONNECTED) {
    Serial.printf("[wifi] connected to %s, IP %s, RSSI %d dBm\n",
                  WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println("[wifi] no network available, will retry");
  }
}

void InhabitDevice::begin() {
  Serial.printf("\n[inhabit] %s %s - sensor %s\n", cfg_.firmwareName, cfg_.firmwareVersion, cfg_.sensorId);

  // Was this build just installed by OTA and not yet confirmed?
  esp_ota_img_states_t state;
  if (esp_ota_get_state_partition(esp_ota_get_running_partition(), &state) == ESP_OK &&
      state == ESP_OTA_IMG_PENDING_VERIFY) {
    pendingVerify_ = true;
    Serial.println("[ota] new build pending verification");
  }

  WiFi.mode(WIFI_STA);
  for (int i = 0; i < cfg_.wifiCount; i++) wifiMulti.addAP(cfg_.wifiSsids[i], cfg_.wifiPasswords[i]);
  connectWifi(15000);

  configTime(0, 0, "pool.ntp.org", "time.google.com");
  Serial.print("[time] syncing");
  for (int i = 0; i < 60 && !timeSynced(); i++) { delay(500); Serial.print('.'); }
  Serial.println(timeSynced() ? " ok" : " not yet (will keep trying)");
  bootEpoch_ = now();

  fbConfig_.database_url = cfg_.databaseUrl;
  if (cfg_.deviceEmail && cfg_.deviceEmail[0]) {
    fbConfig_.api_key = cfg_.apiKey;
    auth_.user.email = cfg_.deviceEmail;
    auth_.user.password = cfg_.devicePassword;
    fbConfig_.token_status_callback = tokenStatusCallback;
    Serial.println("[firebase] signing in with device account");
  } else {
    fbConfig_.signer.tokens.legacy_token = cfg_.legacyToken;
    Serial.println("[firebase] using legacy database secret");
  }
  Firebase.reconnectWiFi(false);  // WiFiMulti handles reconnects
  Firebase.begin(&fbConfig_, &auth_);
}

void InhabitDevice::loop() {
  if (!wifiConnected() && millis() - lastWifiAttemptMs_ > kWifiRetryMs) connectWifi(8000);

  if (bootEpoch_ == 0 && timeSynced()) bootEpoch_ = now();

  if (ready() && !registered_ &&
      (lastRegisterAttemptMs_ == 0 || millis() - lastRegisterAttemptMs_ > kRegisterRetryMs)) {
    registerIfNeeded();
  }

  // An unproven OTA build that can't report in time rolls back.
  if (pendingVerify_ && millis() > kVerifyDeadlineMs) {
    Serial.println("[ota] build never reported successfully - rolling back");
    esp_ota_mark_app_invalid_rollback_and_reboot();
  }

  if (!pendingVerify_ && firstPublishDone_ && millis() - lastOtaCheckMs_ > kOtaCheckIntervalMs) {
    checkForUpdate();
  }
}

void InhabitDevice::registerIfNeeded() {
  // Only register when we can positively see the sensor is missing; a failed read
  // must never overwrite fields the app owns.
  lastRegisterAttemptMs_ = millis();
  if (!Firebase.RTDB.get(&fbdo_, sensorPath().c_str())) {
    Serial.printf("[register] check failed (retrying in 60 s): %s\n", fbdo_.errorReason().c_str());
    return;
  }

  // Fill in only the registration fields that are missing; never overwrite app-edited values.
  FirebaseJson existing;
  if (fbdo_.dataType() == "json") existing = fbdo_.jsonObject();
  FirebaseJsonData probe;
  auto missing = [&](const char* key) {
    existing.get(probe, key);
    return !probe.success;
  };

  const InhabitRegistration& r = cfg_.registration;
  const char* keys[] = { "name", "location", "owner", "type", "units", "primaryVariable" };
  const char* values[] = { r.name, r.location, r.owner, r.type, r.units, r.primaryVariable };
  FirebaseJson json;
  int count = 0;
  for (int i = 0; i < 6; i++) {
    if (values[i] && missing(keys[i])) { json.set(keys[i], values[i]); count++; }
  }

  if (count == 0) {
    registered_ = true;
    Serial.println("[register] sensor already registered");
    return;
  }
  if (Firebase.RTDB.updateNode(&fbdo_, sensorPath().c_str(), &json)) {
    registered_ = true;
    Serial.printf("[register] filled in %d missing field(s)\n", count);
  } else {
    Serial.printf("[register] failed: %s\n", fbdo_.errorReason().c_str());
  }
}

void InhabitDevice::addDeviceFields(FirebaseJson& json) {
  json.set("firmware", String(cfg_.firmwareName) + " " + cfg_.firmwareVersion);
  json.set("rssi", (int)WiFi.RSSI());
  if (!firstPublishDone_ && bootEpoch_) json.set("bootedAt", (int)bootEpoch_);
}

bool InhabitDevice::publish(FirebaseJson& variables, uint32_t nextUpdateEpoch, const char* status) {
  uint32_t epoch = now();
  if (!epoch || !ready()) return false;

  FirebaseJson live;
  live.set("variables", variables);
  live.set("epoch", (int)epoch);
  live.set("nextUpdate", (int)nextUpdateEpoch);
  live.set("status", status);
  addDeviceFields(live);

  if (!Firebase.RTDB.updateNode(&fbdo_, sensorPath().c_str(), &live)) {
    Serial.printf("[publish] live write failed: %s\n", fbdo_.errorReason().c_str());
    return false;
  }

  String historyPath = String("/sensorDataHistory/") + cfg_.sensorId + "/" + epoch;
  if (!Firebase.RTDB.setJSON(&fbdo_, historyPath.c_str(), &variables)) {
    Serial.printf("[publish] history write failed: %s\n", fbdo_.errorReason().c_str());
    return false;
  }

  Serial.printf("[publish] ok at %u, next update %u\n", epoch, nextUpdateEpoch);
  markHealthy();
  if (consumeCommand("checkUpdate")) checkForUpdate();
  return true;
}

bool InhabitDevice::publishError(const char* status, uint32_t nextUpdateEpoch) {
  uint32_t epoch = now();
  if (!epoch || !ready()) return false;

  FirebaseJson live;
  live.set("status", status);
  live.set("epoch", (int)epoch);
  live.set("nextUpdate", (int)nextUpdateEpoch);
  addDeviceFields(live);

  bool ok = Firebase.RTDB.updateNode(&fbdo_, sensorPath().c_str(), &live);
  Serial.printf("[publish] status '%s' %s\n", status, ok ? "sent" : fbdo_.errorReason().c_str());
  // Reaching Firebase proves the build works even if a probe is faulty.
  if (ok) markHealthy();
  return ok;
}

void InhabitDevice::markHealthy() {
  firstPublishDone_ = true;
  if (pendingVerify_) {
    esp_ota_mark_app_valid_cancel_rollback();
    pendingVerify_ = false;
    Serial.println("[ota] new build confirmed good");
    lastOtaCheckMs_ = millis();  // don't immediately re-check after an update
  } else if (lastOtaCheckMs_ == 0) {
    checkForUpdate();  // first check after boot
  }
}

bool InhabitDevice::consumeCommand(const char* name) {
  String path = String("/commands/") + cfg_.sensorId + "/" + name;
  if (!Firebase.RTDB.get(&fbdo_, path.c_str())) return false;
  if (fbdo_.dataType() != "boolean" || !fbdo_.boolData()) return false;
  Firebase.RTDB.deleteNode(&fbdo_, path.c_str());
  Serial.printf("[command] %s\n", name);
  return true;
}

bool InhabitDevice::checkForUpdate() {
  lastOtaCheckMs_ = millis();
  if (!cfg_.otaBaseUrl || !wifiConnected()) return false;

  String base = String(cfg_.otaBaseUrl) + "/" + cfg_.firmwareName + "/";
  NetworkClientSecure client;
  client.setCACertBundle(x509_crt_bundle_start, x509_crt_bundle_end - x509_crt_bundle_start);
  HTTPClient http;
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);

  // 1. Manifest: { "version": "1.0.1", "file": "oil-tank-1.0.1.bin", "md5": "...", "size": 123 }
  if (!http.begin(client, base + "manifest.json")) return false;
  int code = http.GET();
  if (code != HTTP_CODE_OK) {
    Serial.printf("[ota] manifest HTTP %d\n", code);
    http.end();
    return false;
  }
  FirebaseJson manifest;
  manifest.setJsonData(http.getString());
  http.end();

  String version = jsonString(manifest, "version");
  String file = jsonString(manifest, "file");
  String md5 = jsonString(manifest, "md5");
  if (!isNewerVersion(version, cfg_.firmwareVersion)) {
    Serial.printf("[ota] up to date (%s, latest %s)\n", cfg_.firmwareVersion, version.c_str());
    return false;
  }
  if (file.isEmpty() || md5.length() != 32) {
    Serial.println("[ota] manifest incomplete, skipping");
    return false;
  }

  Serial.printf("[ota] installing %s -> %s\n", cfg_.firmwareVersion, version.c_str());
  FirebaseJson status;
  status.set("status", "updating");
  status.set("updatingTo", version);
  Firebase.RTDB.updateNode(&fbdo_, sensorPath().c_str(), &status);

  // 2. Firmware image, verified against the manifest's MD5 before it can boot.
  if (!http.begin(client, base + file)) return false;
  code = http.GET();
  int size = http.getSize();
  bool ok = code == HTTP_CODE_OK && size > 0 && Update.begin(size);
  if (ok) {
    Update.setMD5(md5.c_str());
    ok = Update.writeStream(*http.getStreamPtr()) == (size_t)size && Update.end(true);
  }
  http.end();

  if (!ok) {
    Serial.printf("[ota] failed: HTTP %d, %s\n", code, Update.errorString());
    Update.abort();
    FirebaseJson failed;
    failed.set("status", "update-failed");
    Firebase.RTDB.updateNode(&fbdo_, sensorPath().c_str(), &failed);
    return false;
  }

  Serial.println("[ota] installed, restarting");
  delay(500);
  ESP.restart();
  return true;
}
