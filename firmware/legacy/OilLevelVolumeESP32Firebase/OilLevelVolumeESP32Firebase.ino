#include <WiFi.h>
#include <WiFiUdp.h>
#include <NTPClient.h>
#include <Firebase_ESP_Client.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include "secrets.h"

// ===== Pins =====
#define TRIG_PIN 27
#define ECHO_PIN 26
#define BUTTON_PIN 32
#define LED_GREEN 14
#define LED_RED 4
#define ONE_WIRE_BUS 32

// ===== Tank parameters =====
const float TANK_DIAMETER_MM = 1200.0;
const float TANK_LENGTH_MM = 1787.0;

// ===== Update intervals =====
const unsigned long MEASURE_INTERVAL_MS = 240UL * 60UL * 1000UL; // first number is minutes
unsigned long lastMeasure = 0;

// ===== Firebase objects =====
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// ===== NTP client =====
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 0, 60000);

// ===== DS18B20 =====
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

// ===== Variables =====
bool wifiConnected = false;
unsigned long ledLastUpdate = 0;
bool ledState = false;

// ===== Debounce vars =====
unsigned long lastButtonPress = 0;
const unsigned long debounceDelay = 200;  // ms

void connectWiFi();
void blinkLED(int pin, int times, int duration);
float measureOilLevel();
float calculateOilVolume(float oilDepthCM);



// ===== Setup =====
void setup() {
  Serial.begin(115200);

  Serial.println("....................................");
  Serial.println("Using ESP32-WROOM-DA Module as board");
  Serial.println("....................................");

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(BUTTON_PIN, INPUT_PULLDOWN);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);

  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_RED, LOW);

  connectWiFi();
  timeClient.begin();
  timeClient.update();
  sensors.begin();

  // Firebase setup
  blinkLED(LED_RED, 2, 500);  // upload start confirmation
  config.host = FIREBASE_HOST;
  config.signer.tokens.legacy_token = FIREBASE_AUTH;
  Firebase.begin(&config, &auth);

  Serial.println("Firebase setup completed.");
  Serial.println("..........");
  Serial.println("On ESP32-WROOM-DA Module");
  Serial.println("..........");

  measureAndUpload();
}

// ===== Loop =====
void loop() {
  // LED pulsing etc
  handleWiFiLED();

  //Serial.println("BUTTON_PIN value: " + String(digitalRead(BUTTON_PIN)));

  // Update NTP time
  timeClient.update();

  unsigned long now = millis();

  // Interval trigger
  if (now - lastMeasure >= MEASURE_INTERVAL_MS) {
    measureAndUpload();
    lastMeasure = now;
  }

  // Button trigger with debounce
  if (digitalRead(BUTTON_PIN) == HIGH && (now - lastButtonPress > debounceDelay)) {
    lastButtonPress = now;
    measureAndUpload();
    Serial.println("Manual upload requested");
    delay(2000);

  }


  delay(150);
}

// ===== LED pulsing =====
void handleWiFiLED() {
  wifiConnected = (WiFi.status() == WL_CONNECTED);
  unsigned long now = millis();
  unsigned long interval = wifiConnected ? 2000 : 250; // slow for green, fast for red
  //Serial.println(String("LED wifiConnected=") + wifiConnected + " interval=" + interval);


  if (now - ledLastUpdate >= interval) {
    ledState = !ledState;
    digitalWrite(LED_GREEN, wifiConnected ? ledState : LOW);
    digitalWrite(LED_RED, wifiConnected ? LOW : ledState);
    ledLastUpdate = now;
  }
}

// ===== Upload & JSON build =====
void measureAndUpload() {
  blinkLED(LED_GREEN, 3, 200);  // upload start confirmation
  
  float oilDepthCM = measureOilLevel();
  float oilVolumeL = calculateOilVolume(oilDepthCM);

  sensors.requestTemperatures();
  float tankTempC = sensors.getTempCByIndex(0);
  if (tankTempC == DEVICE_DISCONNECTED_C) tankTempC = 0;

  unsigned long epoch = timeClient.getEpochTime();
  Serial.println("Uploading at epoch: " + String(epoch));
  unsigned long nextUpdate = epoch + (MEASURE_INTERVAL_MS / 1000);

  // Build full JSON
  FirebaseJson vars;
  vars.set("litres", round(oilVolumeL));
  vars.set("tankTemp", tankTempC);

  FirebaseJson sensorJson;
  sensorJson.set("epoch", epoch);
  sensorJson.set("units", "litres");
  sensorJson.set("nextUpdate", nextUpdate);
  sensorJson.set("status", "pending update");
  sensorJson.set("type", "oil-tank");
  sensorJson.set("name", "Heating Oil");
  sensorJson.set("location", "Ford Rise");
  sensorJson.set("owner", "sam.k");
  sensorJson.set("variables", vars);   // attach as block

  FirebaseJson logJson;
  logJson.set("litres", round(oilVolumeL));

  // Upload current state
  if (Firebase.RTDB.setJSON(&fbdo, "/sensors/0158-oil-volume", &sensorJson)) {
    Serial.println("✅ Sensor uploaded!");
    blinkLED(LED_GREEN, 10, 50);
  } else {
    Serial.println("❌ Sensor upload failed: " + fbdo.errorReason());
    blinkLED(LED_RED, 5, 200);
  }

  // Upload to history
  String path = "/sensorDataHistory/0158-oil-volume/" + String(epoch);
  if (Firebase.RTDB.setJSON(&fbdo, path.c_str(), &logJson)) {
    Serial.println("✅ History updated!");
  } else {
    Serial.println("❌ History upload failed: " + fbdo.errorReason());
  }

  Serial.println("Depth (cm): " + String(oilDepthCM) +
                 ", Volume (L): " + String(oilVolumeL) +
                 ", Temp (C): " + String(tankTempC));
}

// ===== Blink helper =====
void blinkLED(int ledPin, int times, int duration) {
  for (int i = 0; i < times; i++) {
    digitalWrite(ledPin, HIGH);
    delay(duration);
    digitalWrite(ledPin, LOW);
    delay(duration);
  }
}

// ===== Measure ultrasonic depth =====
float measureOilLevel() {
  Serial.println("Reading depth sensor... ");
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  float distanceCM = duration * 0.0343 / 2.0;
  float oilDepth = 120.0 - distanceCM;

  oilDepth = constrain(oilDepth, 0, 120.0);
  return oilDepth;
}

// ===== Calculate oil volume from depth =====
float calculateOilVolume(float oilDepthCM) {
  float h = oilDepthCM * 10.0; // mm
  float R = TANK_DIAMETER_MM / 2.0;
  float L = TANK_LENGTH_MM;

  h = constrain(h, 0, 2 * R);

  float area = (R*R * acos((R - h)/R)) - ((R - h) * sqrt((2*R*h) - (h*h)));
  float volumeMM3 = area * L;

  return volumeMM3 / 1000000.0; // litres
}

// ===== Connect WiFi =====
void connectWiFi() {
  for (int i = 0; i < wifi_count; i++) {
    Serial.print("Connecting to: "); Serial.println(wifi_ssids[i]);
    WiFi.begin(wifi_ssids[i], wifi_passwords[i]);
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) delay(500);

    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("✅ WiFi connected");
      return;
    }
  }
  Serial.println("❌ WiFi connection failed.");
}
