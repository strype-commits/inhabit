# Changelog

All notable changes to inHabit. Format follows [Keep a Changelog](https://keepachangelog.com/).
The in-app, plain-language version lives in `public/changelog.json`.

## [1.0.5] - unreleased

_On dev. Not yet in production._

### Added
- Admin panel (`/admin`, admins only): Users tab (role counts, search, user/admin role, per-user
  sensor access) and Sensors tab (status, last report, firmware vs latest published, signal,
  "Update firmware now" → `commands/{id}/checkUpdate`). Rules: admins may list `users`.
- "Displayed value" (`primaryVariable`) selector in Sensor parameters; automatic choice now
  prefers the variable named after `units`.
- Sensor detail shows firmware, WiFi signal and last restart.
- Pruning deployed: `pruneSensorHistoryDaily` with a 365-day default retention.
- Staleness uses the device-declared interval (`nextUpdate − epoch`) when present, else `expectedFrequencyMinutes`;
  "Next expected" (with overdue flag) on Sensor Detail. Reads `units`, `epoch` and optional `primaryVariable`.
- Staleness per sensor from metadata (`expectedFrequencyMinutes` × `staleAfterMultiplier`, default 2):
  `utils/sensorConfig.js`, grey "Stale" indicator on Dashboard cards and Sensor Detail, shared `useNow` clock.
- "Last updated" on cards (relative, absolute on hover): sensor `lastUpdated`/`updatedAt`/`timestamp` field,
  falling back to the newest `sensorDataHistory` key (`limitToLast(1)` per card).
- Sensor Detail history graph (`SensorChart.vue`, thin Chart.js wrapper, linear ms x-axis, no date adapter) over
  `retentionDays` (or 30 days if unset), capped at 5000 points; hidden when `showHistory === false`.
- Recent readings table (last 12) with interval column; gaps beyond the stale threshold highlighted.
- "Sensor parameters" card (`SensorParameters.vue`): editable by admins, read-only for everyone else.
- `functions/` — `pruneSensorHistoryDaily` scheduled function (03:00 Europe/London, europe-west1), prunes history
  older than `retentionDays`; sensors without it are never pruned. **Not deployed — needs Blaze.**
- Dev hosting site `inhabit-webapp-dev` with `production` / `dev` hosting targets and `deploy:dev`.
- Pinia stores: `auth` (idempotent `init()`, `/users/{uid}` profile watch, `ensureUserProfile` backstop,
  `isAdmin` / `hasDeveloperAccess` / `authorisedSensorIds`), `ui` (theme + drawer), `toast`.
- Router guard: `requiresAuth` / `guestOnly` meta, `?redirect=` back to the original page after login. Lazy-loaded routes.
- App shell gated on `auth.initialised` with `LoadingSpinner`.
- Per-user sensor access on the Dashboard and Sensor Detail (admins/`master`/`isDeveloper` see all).
- `database.rules.json` draft (not yet deployed) enforcing the same access model server-side.
- `services/sensors.js` subscribe helpers; history uses `limitToLast` instead of loading the whole node.
- `utils/formatters.js` — primary variable chosen from `sensor.type`, unit from `sensor.unit`.
- Design tokens (`src/assets/styles/variables.css`), global `.card` / `.btn` / `.form-*` classes, Montserrat + Inter.
- Dark mode (`data-theme`, persisted to `localStorage['inhabit:theme']`, applied before mount).
- PWA via `vite-plugin-pwa`; icons generated from the vector logo by `npm run gen:icons`.
- `__APP_VERSION__` / `__IS_PROD_BUILD__` build defines; footer shows `-beta` on non-production builds.
- Missing-config guard in `main.js`; Firebase config moved to `.env.local` (see `.env.example`).
- `firebase.json` cache headers block; `build:prod`, `build:dev`, `deploy:prod`, `deploy:rules` scripts.
- `/changelog` page reading `public/changelog.json`.

### Changed
- `App.vue` rebuilt: removed duplicate header wrapper, duplicate `SideDrawer` and nested `#app` div.
- `SideDrawer` → `AppDrawer`: right-side slide transition, overlay, avatar/name, theme toggle, install button,
  real nav links (removed `/dummy` and `/test`).
- `Footer` → `AppFooter` with build-derived version.
- Registration consolidated into `auth.register()` (sets `displayName` and `/users/{uid}.username`).
- Sensor Detail re-subscribes on route change and unsubscribes on unmount.

### Removed
- `zzz.vue`, `SideDrawer.vue`, `Footer.vue`, `src/styles/*` (moved to `src/assets/styles`).
- Hardcoded Firebase config in `services/firebase.js`.

## [1.0.4]

Last version shown in the footer before this changelog was started.
