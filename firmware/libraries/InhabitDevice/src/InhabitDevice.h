// InhabitDevice — shared plumbing for inHabit sensor firmware (ESP32).
// Implements docs/device-contract.md: WiFi, NTP, Firebase auth, auto-registration,
// live + history writes, status reporting, and HTTPS OTA updates with rollback.
#pragma once

#include <Arduino.h>
#include <Firebase_ESP_Client.h>

// Written to sensors/{id} only if the sensor doesn't exist yet (auto-registration).
// After that these fields belong to the app. Leave any field nullptr to skip it.
struct InhabitRegistration {
  const char* name;
  const char* location;
  const char* owner;
  const char* type;
  const char* units;
  const char* primaryVariable;
};

struct InhabitConfig {
  const char* sensorId;          // e.g. "0158-oil-volume"
  const char* firmwareName;      // OTA channel, e.g. "oil-tank"
  const char* firmwareVersion;   // semver, e.g. "1.0.0"
  InhabitRegistration registration;

  const char* const* wifiSsids;
  const char* const* wifiPasswords;
  int wifiCount;

  const char* databaseUrl;
  // Auth: a device account if deviceEmail is set, otherwise the legacy database secret.
  const char* apiKey;
  const char* deviceEmail;
  const char* devicePassword;
  const char* legacyToken;

  const char* otaBaseUrl;        // e.g. "https://inhabit-firmware.web.app"
};

class InhabitDevice {
 public:
  explicit InhabitDevice(const InhabitConfig& config);

  void begin();   // call once from setup()
  void loop();    // call on every loop() pass

  bool wifiConnected() const;
  bool timeSynced() const;
  bool ready();                    // WiFi + time + Firebase all usable
  uint32_t now() const;            // Unix seconds (UTC), 0 if the clock isn't synced

  // A good reading: updates sensors/{id} (variables, epoch, nextUpdate, status "ok", ...)
  // and adds sensorDataHistory/{id}/{epoch}. Returns true only if both writes succeed.
  // `status` defaults to "ok"; use e.g. "probe-fault" when some (not all) readings are missing.
  bool publish(FirebaseJson& variables, uint32_t nextUpdateEpoch, const char* status = "ok");

  // A failed reading: updates status/epoch/nextUpdate only — no variables, no history.
  bool publishError(const char* status, uint32_t nextUpdateEpoch);

  // Reads commands/{id}/{name}; if true, clears it and returns true.
  bool consumeCommand(const char* name);

  // Checks {otaBaseUrl}/{firmwareName}/manifest.json and installs a newer build.
  // Restarts the board on success; returns false if no update was installed.
  bool checkForUpdate();

 private:
  const InhabitConfig& cfg_;
  FirebaseData fbdo_;
  FirebaseAuth auth_;
  FirebaseConfig fbConfig_;

  bool registered_ = false;
  bool pendingVerify_ = false;     // running a freshly OTA'd build not yet confirmed good
  bool firstPublishDone_ = false;
  uint32_t bootEpoch_ = 0;
  unsigned long lastWifiAttemptMs_ = 0;
  unsigned long lastRegisterAttemptMs_ = 0;
  unsigned long lastOtaCheckMs_ = 0;

  void connectWifi(uint32_t timeoutMs);
  void registerIfNeeded();
  void markHealthy();
  void addDeviceFields(FirebaseJson& json);
  String sensorPath() const;
};
