# inHabit — Staleness Detection, History Graphs & Data Retention

## Context

inHabit is a Vue 3/Vite single-page web application for monitoring a collection of connected sensors around a home or property. It uses Firebase Authentication for email/password user accounts, Firebase Realtime Database for sensor and user data, and Firebase Hosting for deployment.

The app is designed around the idea that a physical sensor/device can provide multiple variables — for example temperature, oil level and other measurements — while metadata describes how those variables should be interpreted. Each sensor has properties such as a name, location, unit and type. The type identifies the primary variable to display; for example, a sensor with `type: "volume"` displays its `variables.volume` value even if it also measures temperature.

The main interface consists of a Dashboard, individual Sensor Detail pages, a fixed header, a sliding side drawer, and a small versioned footer. Authentication is already implemented (Firebase Auth + `/users/{uid}` in the Realtime Database), including a master/admin account intended to eventually have access to all sensors, with normal users restricted to authorised sensors.

The core infrastructure — routing, Firebase Auth, Realtime Database connectivity, sensor subscriptions, dashboard/sensor pages, navigation, and deployment — is already working. This brief covers the next stage.

**Guiding principle:** Hardware supplies measurements → Firebase supplies data and metadata → Vue interprets that information into an appropriate user interface. Sensor behaviour (staleness, retention, whether history is shown) should be driven by per-sensor metadata, not hardcoded per sensor.

---

## 1. "Last updated" + staleness on Dashboard cards

- Each sensor card on the Dashboard should show a "last updated at" timestamp (relative, e.g. "3 min ago", with absolute time available on hover/tap).
- Staleness is **per-sensor and configurable**, not a global constant. The exact staleness rules will be tuned after the initial build — for now, build the mechanism to be flexible (e.g. driven by an expected-frequency value and a tolerance/grace setting per sensor, read from metadata) rather than hardcoding a rule.
- Stale sensors should get a visual status indicator on their card, using the existing accent-colour status system, distinct from a normal "OK" state and from any existing warning states.

## 2. Sensor Detail page: graph + recent readings list

Replace the current raw/long string data display with:

- A **time-series graph** of the sensor's primary variable (per `type`) over its retained history window.
- A **list/table of the last ~12 readings** (value + timestamp), so intervals between readings can be checked at a glance.

Needs a charting library — none currently in the project. Suggest **Chart.js**, kept lightweight (a thin wrapper rather than pulling in the full vue-chartjs dependency), unless you have a preference otherwise.

Per the data-driven principle: sensor types where history isn't meaningful (e.g. an on/off light) should be able to opt out of the graph via metadata, rather than this being hardcoded per sensor.

## 3. "Sensor parameters" card on the Sensor Detail page

Add a new card/section on each Sensor Detail page, titled **"Sensor parameters"**, containing the per-sensor configuration fields:

- Expected/required reading frequency (drives staleness detection in section 1).
- Historic data retention — how many days of history to keep for this sensor (drives pruning in section 4).

These fields should be editable in the app (admin-only to start, in line with the existing master/admin access model), not just set directly in the Firebase console.

## 4. Historic data retention / pruning

- Old data beyond each sensor's configured retention window needs to be removed from Firebase.
- Two approaches to weigh:
  - **Scheduled Cloud Function** (e.g. daily) that iterates sensors and prunes readings older than each one's configured `retentionDays`.
  - **Dynamic pruning on write** — trim old entries whenever a new reading comes in.
- Given retention is per-sensor and config-driven, a scheduled function is likely the cleaner fit versus pruning on every write — but confirm against the project's Firebase plan (Spark vs Blaze) before committing, since scheduled functions require Blaze.

## 5. Data model implications

Sensor metadata will likely need new fields, e.g.:

```json
{
  "type": "temperature",
  "expectedFrequencyMinutes": 5,
  "staleAfterMultiplier": 2,
  "retentionDays": 30,
  "showHistory": true
}
```

Naming/shape should be finalised against the existing schema once the current sensor object structure is reviewed.

---

## Open questions for Claude Code to confirm before building

- Chart.js vs an alternative charting library.
- Scheduled vs on-write pruning, and current Firebase plan tier (Spark/Blaze).
- Whether the "Sensor parameters" card is visible/read-only to normal users or admin-only end to end.
