// TempDeviceV3.0.1
#include <WiFi.h>
#include <WiFiUdp.h>
#include <NTPClient.h>
#include <Firebase_ESP_Client.h>  // Mobizt library
#include <OneWire.h>
#include <DallasTemperature.h>
#include "secrets.h"
#include "time.h"

String connectedSSID = "";
String connectedPASS = "";

WiFiUDP ntpUDP;
// OBSOLETE? -> NTPClient timeClient(ntpUDP, "pool.ntp.org", 0, 60000); // 0 = GMT offset in seconds, 60000 = update interval ms

// ---------- OneWire / DS18B20 ----------
#define ONE_WIRE_BUS 4
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

// ---------- Firebase ----------
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// ---------- NTP ----------
const char* ntpServer = "pool.ntp.org";
const long  gmtOffset_sec = 0;
const int   daylightOffset_sec = 0;

// ---------- Hard-coded Sensors ----------
DeviceAddress sensorA = { 0x28, 0x7A, 0xCF, 0x80, 0xE3, 0xE1, 0x3C, 0x52 };
DeviceAddress sensorB = { 0x28, 0xBE, 0x09, 0x57, 0x04, 0xE1, 0x3C, 0x95 };
DeviceAddress sensorC = { 0x28, 0xAF, 0xE1, 0x57, 0x04, 0xE1, 0x3C, 0x1D };
DeviceAddress sensorD = { 0x28, 0x92, 0xC8, 0x57, 0x04, 0xE1, 0x3C, 0xB1 };

// ---------- Upload Timer ----------
unsigned long lastUpload = 0;
unsigned long uploadInterval = 3600000UL; // 1 hour in ms

// ---------- Function Prototypes ----------
void sendLoftSensorData();
unsigned long getTimestamp();

void setup() {
  Serial.begin(115200);
  delay(1500);  // 👈 Give USB serial time to initialise

  Serial.println("Booting device...");
  Serial.println("TempDeviceV3.0.1");
  Serial.println("Use ESP32-WROOM-DA Module");


  // ✅ Check WiFi connection and reconnect if necessary
  if (WiFi.status() != WL_CONNECTED) {
      Serial.println("⚡ WiFi lost... Reconnecting...");
      connectWiFi();  // Attempt reconnection
  }

  // timeClient.begin();
  // timeClient.update();  // fetch initial time

  // ---- NTP Time Sync ----
  Serial.println("⏱ Setting up NTP...");
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);

  // Wait for NTP sync
  struct tm timeinfo;
  Serial.print("Waiting for NTP time sync");
  while (!getLocalTime(&timeinfo)) {
    Serial.print(".");
    delay(500);
  }
  Serial.println("\nTime synced!");
  Serial.printf("Current time: %02d/%02d/%04d, %02d:%02d:%02d\n", 
                timeinfo.tm_mday, timeinfo.tm_mon + 1, timeinfo.tm_year + 1900, 
                timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
  

  // ---- Firebase ----
  Serial.println("🔥 Initialising Firebase...");
  config.database_url = "https://inhabit-webapp-default-rtdb.europe-west1.firebasedatabase.app";
  config.signer.tokens.legacy_token = FIREBASE_AUTH;

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  // ---- DS18B20 Sensors ----
  sensors.begin();
  Serial.println("🌡 DS18B20 sensors initialised.");

  // ---- Initial Upload ----
  Serial.println("📤 Sending initial sensor upload...");
  sendLoftSensorData();

  Serial.println("Setup complete!");
}


void loop() {
  // ✅ Check WiFi connection and reconnect if necessary
  if (WiFi.status() != WL_CONNECTED) {
      Serial.println("⚡ WiFi lost... Reconnecting...");
      connectWiFi();  // Attempt reconnection
  }

  unsigned long now = millis();

  // Only send data once annexeTempevery hour
  if (now - lastUpload >= uploadInterval) {
    lastUpload = now;
    sendLoftSensorData();
  }

  // Small delay to avoid hammering CPU
  delay(100);
}

float round1(float x) {
    return roundf(x * 10) / 10.0;
}

void sendLoftSensorData() {
  sensors.requestTemperatures();

  float pipeTemp    = sensors.getTempC(sensorA);
  float enclosureTemp = sensors.getTempC(sensorB);
  float loftTemp = sensors.getTempC(sensorC);
  float annexeTemp = sensors.getTempC(sensorD);

  pipeTemp     = round1(pipeTemp);
  enclosureTemp = round1(enclosureTemp);
  loftTemp     = round1(loftTemp);
  annexeTemp   = round1(annexeTemp);

  unsigned long timestamp = getTimestamp();

  Serial.print("Timestamp: ");
  Serial.println(String(timestamp));

  // Update sensor interval  
  float lowestTemp = min(min(pipeTemp, enclosureTemp), min(loftTemp, annexeTemp));

  if (lowestTemp < 5.0) {
      uploadInterval = 15UL * 60UL * 1000UL;   // 15 minutes
  }
  else if (lowestTemp < 15.0) {
      uploadInterval = 60UL * 60UL * 1000UL;   // 1 hour
  }
  else {
      uploadInterval = 180UL * 60UL * 1000UL;  // 3 hours
  }

Serial.print("New upload interval: ");
Serial.println(uploadInterval);


  // ---------- Debug Serial ----------
  Serial.print("Pipe Temp: "); Serial.print(pipeTemp);
  Serial.print(" °C | Enclosure: "); Serial.print(enclosureTemp);
  Serial.print(" °C | Loft Space: "); Serial.print(loftTemp);
  Serial.print(" °C | Annexe: "); Serial.print(annexeTemp);
  Serial.print(" °C | Timestamp: "); Serial.println(timestamp);

  // ---------- Live Data ----------
  FirebaseJson liveData;
  liveData.set("name", "Loft Enclosure");
  liveData.set("type", "temperature");
  liveData.set("location", "Annexe");
  liveData.set("owner", "user123");
  liveData.set("lastUpdated", (double)timestamp);
  liveData.set("variables/temperature", enclosureTemp);
  liveData.set("variables/PipeTemp", pipeTemp);
  //liveData.set("variables/EnclosureTemp", enclosureTemp);
  liveData.set("variables/LoftTemp", loftTemp);
  liveData.set("variables/AnnexeTemp", annexeTemp);
  liveData.set("status", "online");

  String sensorPath = "/sensors/loftSensor";

  if (!Firebase.RTDB.setJSON(&fbdo, sensorPath.c_str(), &liveData)) {
    Serial.print("Firebase live write failed: ");
    Serial.println(fbdo.errorReason());
  }

  // ---------- Historical Data ----------
  FirebaseJson histData;
  histData.set("Pipe", pipeTemp);
  histData.set("Enclosure", enclosureTemp);
  histData.set("Loft", loftTemp);
  histData.set("Annexe", annexeTemp);

  unsigned long timeStamp = getTimestamp();

  String histPath = "/sensorDataHistory/loftSensor/";
  histPath += String(timeStamp);

  if (!Firebase.RTDB.setJSON(&fbdo, histPath.c_str(), &histData)) {
    Serial.print("Firebase history write failed: ");
    Serial.println(fbdo.errorReason());
  }
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return; // Already connected

  for (int i = 0; i < wifi_count; i++) {
    Serial.print("🌐 Attempting to connect to: ");
    Serial.println(wifi_ssids[i]);

    WiFi.begin(wifi_ssids[i], wifi_passwords[i]);

    unsigned long startAttemptTime = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startAttemptTime < 10000) {
        // wait up to 10 seconds for this SSID
        delay(500);
        Serial.print(".");
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
        connectedSSID = wifi_ssids[i];
        connectedPASS = wifi_passwords[i];
        Serial.print("✅ Connected to: ");
        Serial.println(connectedSSID);
        Serial.print("IP Address: ");
        Serial.println(WiFi.localIP());
        return;
    } else {
        Serial.println("❌ Failed to connect, trying next SSID...");
    }
  }

  Serial.println("❌ No WiFi found. Waiting for next WiFi call...");
}

/* Assumed to be obsolete, replaced by code below 
unsigned long getTimestamp() {
    timeClient.update();                   // ensure we have fresh NTP time
    unsigned long epoch = timeClient.getEpochTime();  // seconds since 1970 UTC
    return epoch * 1000UL;                 // convert to milliseconds
}
*/

unsigned long getTimestamp() {
    struct tm timeinfo;
    if (!getLocalTime(&timeinfo)) {
        Serial.println("Failed to obtain NTP time, using millis()");
        return millis() / 1000UL;  // fallback
    }
    time_t now;
    time(&now);
    return (unsigned long) now;  // seconds since epoch
}

