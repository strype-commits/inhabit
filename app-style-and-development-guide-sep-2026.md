# App Style and Development Guide — v2.0 (September 2026)

A reference document capturing the patterns, decisions and hard-won lessons
developed across app builds (Marzipan, Alongside, Onus, Vehicle Companion,
and beyond). Copy this as a starting point for future apps. Pricing tiers
and colour palettes are intentionally left as placeholders — define those
fresh per app.

## Platform Assumption

**Apps are intended solely for Windows Desktop and Android devices**,
unless a specific app states otherwise. Claude Code should note this
assumption explicitly at the start of every new project spec, so
platform-specific decisions (PWA install flow, notification testing,
icon/splash requirements) are made against the right target rather than
assumed to be cross-platform.

Some sections below (installed-PWA push identity on iOS, Safari-specific
splash-image handling, `apple-touch-startup-image`) originate from
cross-platform experience and are kept for reference — mark them
explicitly not-applicable in a spec unless a given app extends to iOS/Mac.

## Document Changelog

- **v2.0 (Sep 2026)** — Merged `app-development-style-guide-v1_1.md` with
  the Vehicle Companion additions/corrections document. Notifications and
  Dark Mode sections substantially rewritten (superseding v1.1). New
  sections: UI patterns worth reusing, Anomaly detection in derived
  figures, Feature-request agent export. Firebase.json now includes the
  corrected headers block. Added Platform Assumption note.
- **v1.1** — Prior baseline (Marzipan/Alongside/Onus era).

---

## 1. Architecture

### Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Vue 3 + Vite | Composition API, `<script setup>` throughout |
| State | Pinia | One store per domain: auth, workspace, toast, ui |
| Routing | Vue Router 4 | `createWebHistory()`, lazy-loaded routes |
| Backend | Firebase (Google Cloud) | Auth, Firestore, Hosting, Cloud Functions |
| Payments | Stripe (where the app has paid tiers) | Webhooks via gen 2 Cloud Function |
| PWA | vite-plugin-pwa | Workbox, `registerType: 'autoUpdate'` |

### Firebase Project Structure

One Firebase project serves both environments. Two hosting sites within the
same project share one Firestore database and one set of Cloud Functions.

```
Firebase Project: your-app-dev
├── Hosting site: your-app-production  → yourdomain.com
├── Hosting site: your-app-dev         → your-app-dev.web.app
├── Firestore database (shared)
├── Cloud Functions (europe-west2, Node 22, all gen 2)
└── Authentication (Google + email/password)
```

**Blaze plan is required** for gen-2 Cloud Functions.

### Dual Environment Setup

**`.env.local`** — Firebase config (identical for both environments):
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-app-dev.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-app-dev
VITE_FIREBASE_STORAGE_BUCKET=your-app-dev.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

**`.env.production`** — live Stripe keys only (if applicable). **`.env.development`** —
sandbox/test keys. Do **not** gate build behaviour on `VITE_APP_ENV` (see
`-beta` tagging below) — it's fine as a display value but fragile as logic.

**`package.json` scripts:**
```json
"build:prod":       "vite build --mode production",
"build:dev":        "vite build --mode development",
"deploy:prod":      "npm run build:prod && firebase deploy --only hosting:production",
"deploy:dev":       "npm run build:dev && firebase deploy --only hosting:dev",
"deploy:functions": "firebase deploy --only functions",
"deploy:rules":     "firebase deploy --only firestore:rules",
"changelog":        "node scripts/add-changelog-entry.cjs",
"gen:icons":        "node scripts/generate-icons.mjs"
```

**`firebase.json`** — dual hosting targets **with the full headers block**
(order matters: Firebase Hosting resolves a given header by *last matching
rule wins*, so the broad immutable rule goes first and the `no-cache`
overrides after it):
```json
{
  "hosting": [
    { "target": "production", "public": "dist",
      "rewrites": [{ "source": "**", "destination": "/index.html" }],
      "headers": [
        { "source": "**/*.@(js|css|woff2|png|svg|ico)",
          "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
        { "source": "/index.html",               "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
        { "source": "/sw.js",                    "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
        { "source": "/registerSW.js",            "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
        { "source": "/manifest.webmanifest",     "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
        { "source": "/changelog.json",           "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
        { "source": "/firebase-messaging-sw.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }
      ] },
    { "target": "dev", "public": "dist",
      "rewrites": [{ "source": "**", "destination": "/index.html" }] }
  ]
}
```
Without the `sw.js` / `registerSW.js` overrides, the year-long immutable
rule **freezes the service worker and blocks every PWA update** — a real
bug hit in production.

**`.firebaserc`:**
```json
{
  "projects": { "default": "your-app-dev" },
  "targets": {
    "your-app-dev": {
      "hosting": {
        "production": ["your-app-production"],
        "dev":        ["your-app-dev"]
      }
    }
  }
}
```
Register hosting targets once with:
```bash
firebase target:apply hosting dev your-app-dev
firebase target:apply hosting production your-app-production
```

### The `-beta` tag: derive it from the build mode, never from an env file

Deriving it from `import.meta.env.MODE === 'development'` **broke in
practice** — a hand-edited or missing `.env.production` silently put
`-beta` on production. Bake it from the build `--mode` via a Vite `define`
instead:

```js
// vite.config.js
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __IS_PROD_BUILD__: JSON.stringify(mode === 'production')
  }
}))
```
```js
// AppFooter.vue
const version = __IS_PROD_BUILD__ ? __APP_VERSION__ : `${__APP_VERSION__}-beta`
```
`deploy:prod` runs `--mode production` → `__IS_PROD_BUILD__` is `true` →
clean. Everything else (`deploy:dev`, `npm run dev`, a bare `npm run build`
— which itself defaults to production, so that's fine too) → `-beta`. This
is correct regardless of env-file state.

Declare the global for TypeScript: `declare const __APP_VERSION__: string`
/ `declare const __IS_PROD_BUILD__: boolean`.

### One backend, two hosting URLs — the implications

- Cloud Functions, Firestore, security rules and Secret Manager are
  **shared** between dev and prod. `firebase deploy --only functions`
  deploys once for both. `deploy:dev` / `deploy:prod` only touch
  **hosting**.
- **Dev testing writes to production data.** Accept it, or use a second
  Firebase project (separate `.env.local` per mode). For a small app,
  shared is fine — just know it going in.
- **Authorized domains aren't automatic for the second hosting site.** Add
  *both* `your-app-dev.web.app` **and** `your-app-dev.firebaseapp.com` to
  Firebase Console → Authentication → Settings → Authorized domains, or
  Google sign-in fails on that origin with a console warning.

### Server-built URLs must be origin-aware

Because functions are shared, anything the server builds a link into
(invite emails, QR codes, push notifications, "click here" emails) has one
`APP_URL` — which is wrong when the artefact was generated on the dev site.

- **Client-triggered** (invites, QR): pass `window.location.origin` into
  the callable; validate it server-side against an **allowlist** of known
  origins; build the link from that, falling back to `APP_URL`.
- **Server-triggered** (scheduled reminders): no client origin exists —
  use `APP_URL` and accept that dev-user reminders link to prod.

### Version / release flow

Keep `package.json` **one version ahead of production**:

1. `npm run deploy:prod` ships version *N* (clean).
2. Immediately `npm version N+1 --no-git-tag-version` locally.
3. Add a `## [N+1] - unreleased` changelog section with a one-line status
   (`_On dev. Not yet in production._`).
4. Every dev build now stamps `vN+1-beta`; the section accumulates until
   the next prod release.

### Deploy-time operational notes

- `firebase deploy --only functions --force` auto-confirms deletion of
  functions removed from `index.js`.
- Wrong active CLI account → confusing `403 / project not found`. Check
  with `firebase login:list`; switch with `firebase login:use <email>`.
- A **CORS error on a callable from the browser almost always means the
  function isn't deployed** (404 → no CORS headers → browser blames CORS).

### Cloud Functions

All functions use **gen 2** (`firebase-functions/v2`). Gen 1 has a
`rawBody` parsing issue that breaks Stripe webhook signature verification.

```
functions/
├── index.js          — lazy Object.defineProperty exports
└── src/
    ├── admin.js      — Firebase Admin singleton (db, auth, FieldValue)
    ├── helpers.js    — TIERS definition, tier limits, requireAuth, HttpsError
    ├── auth.js       — onUserCreated trigger
    ├── workspace.js  — inviteMember, createWorkspace/Team, removeMember
    ├── tier.js       — checkItemLimit / other per-tier limit checks
    ├── beta.js       — applyForBeta (callable), checkBetaExpiry (scheduled)
    ├── stripeWebhook.js   — HTTPS onRequest, signature verification, tier update
    └── stripeCheckout.js  — createCheckoutSession, createPortalSession (callables)
```

Secrets stored in Google Cloud Secret Manager: `STRIPE_SECRET_KEY` (live
secret key), `STRIPE_WEBHOOK_SECRET` (from the registered webhook
endpoint). Register the webhook via PowerShell (not the Stripe CLI, which
defaults to sandbox):
```powershell
Invoke-RestMethod -Uri "https://api.stripe.com/v1/webhook_endpoints" `
  -Method Post `
  -Headers @{Authorization="Bearer sk_live_..."} `
  -Body "url=https://REGION-PROJECT.cloudfunctions.net/stripeWebhook&enabled_events[]=checkout.session.completed&enabled_events[]=customer.subscription.created&enabled_events[]=customer.subscription.updated&enabled_events[]=customer.subscription.deleted&enabled_events[]=invoice.payment_failed"
```

**Robustness patterns:**

- **Wrap callable bodies so real errors surface** — an unhandled throw in
  `onCall` reaches the client as a bare `internal`:
  ```js
  export const foo = onCall(opts, async (req) => {
    try { return await fooImpl(req) }
    catch (err) {
      if (err instanceof HttpsError) throw err
      logger.error('foo crashed', { message: err?.message, stack: err?.stack })
      throw new HttpsError('internal', `Foo failed: ${err?.message || 'unknown'}`)
    }
  })
  ```
- **`ensureUserProfile(uid)` — never assume the profile doc exists.** The
  `onUserCreated` *blocking* identity trigger requires the project on
  **Identity Platform**, not plain Firebase Auth — otherwise its deploy
  fails. Defence in depth: (a) client backstop in the auth store (`setDoc`
  if missing on first auth), (b) every function needing a profile calls a
  helper that creates a default from `adminAuth.getUser(uid)` if absent. A
  brand-new user redeeming an invite races ahead of both.
- **Secrets**: `defineSecret('NAME')` takes the *name*, not the value —
  set the value with `firebase functions:secrets:set NAME`. Every secret
  referenced by a deployed function must *exist* in Secret Manager for the
  deploy to succeed — set placeholders for ones you don't have yet and
  make the code no-op on a placeholder value:
  ```js
  if (!key || /^(placeholder|changeme|todo|x+)$/i.test(key.trim())) return { status: 'skipped' }
  ```
- **Firebase web API keys are public** (they ship in the client bundle) —
  not a secret. Email / Stripe / third-party keys ARE — never in source.
- **Shared helper module for outbound notifications** — one
  `webPushMessage()` builder + one `notifyUser()` / `notifyTeamAdmins()`
  that respects the user's channel prefs and does push + email together.
  Keeps every trigger site consistent.

### Stripe Integration (where the app has paid tiers)

Stripe webhook → `stripeWebhook` Cloud Function (gen 2 onRequest):
- Verifies signature using `req.rawBody` (critical — gen 2 only)
- Maps price IDs to tier names
- Updates `users/{uid}.tier` in Firestore
- On downgrade to the free tier: removes non-owner members from owned
  workspaces/Teams

Customer portal: `createPortalSession` callable → Stripe Billing Portal.
Must be activated in Stripe Dashboard → Settings → Billing → Customer
portal.

---

## 2. Third-Party / Government API Integration

Lessons from working with external data-source APIs (e.g. UK DVLA/DVSA):

- **Apply early, and apply for all needed APIs at once.** Free government
  APIs often require an application/approval step that can take days to
  weeks. If a build depends on several related APIs from different
  bodies, their approval timelines can differ significantly — start the
  slowest one first.
- **Services occasionally close registration temporarily** — build in a
  fallback (e.g. manual entry) so the feature still works if auto-fetch
  access is delayed or unavailable at launch.
- **Keep API keys server-side.** Route external API calls through a Cloud
  Function rather than calling from the client, even for "free, public"
  government data — keeps keys out of the client bundle and lets you
  manage rate limits centrally.
- **Auto-fetched data should be editable/overridable** by the user before
  saving. External data sources can lag real-world state by hours or
  days.
- **Some APIs use OAuth2 client-credentials on top of an API key** (token
  endpoint + bearer token + API key header, tokens short-lived and
  cached). Check the target API's auth model before assuming a simple
  API-key header is enough.

---

## 3. UI/UX

### Design Tokens — `src/assets/styles/variables.css`

All colours, spacing, typography, shadows and z-indices defined as CSS
custom properties. Never hardcode values in components — always use
variables. Define the actual colour palette fresh per app (brand colours,
plus a semantic status set — success/warning/critical/neutral — kept
distinct enough that status colours don't fight the brand accent colour).

```css
/* Spacing scale */
--space-1: 4px;   --space-2: 8px;   --space-3: 12px;
--space-4: 16px;  --space-5: 20px;  --space-6: 24px;
--space-8: 32px;  --space-10: 40px; --space-12: 48px;

/* Typography */
--font-size-xs:   12px;
--font-size-sm:   14px;
--font-size-base: 16px;
--font-size-lg:   18px;
--font-size-xl:   20px;
--font-size-2xl:  24px;
--font-size-3xl:  30px;

--font-weight-light:    300;
--font-weight-regular:  400;
--font-weight-medium:   500;
--font-weight-semibold: 600;
--font-weight-bold:     700;
--font-weight-heavy:    800;

/* Radius */
--radius-sm: 4px;  --radius-md: 8px;
--radius-lg: 12px; --radius-xl: 16px; --radius-full: 9999px;

/* Shadows */
--shadow-sm: 0 1px 3px rgba(0,0,0,0.06);
--shadow-md: 0 4px 12px rgba(0,0,0,0.10);
--shadow-lg: 0 8px 24px rgba(0,0,0,0.14);

/* Z-index layers */
--z-base:   1;
--z-overlay: 100;
--z-drawer:  200;
--z-modal:   300;
--z-toast:   400;
--z-header:  50;
```

### Typography convention

- **Titles:** one consistent display font across all apps (Montserrat).
- **Body:** choose a font optimised for the app's content — for
  data-dense apps (figures, prices, readings), prioritise number
  legibility (e.g. Inter) — per-app choice, but keep it deliberate rather
  than default.

### Layout

```
┌─────────────────────────────────┐
│  AppHeader (fixed top)          │  height: --header-height (56px)
├─────────────────────────────────┤
│  StatusBanner (conditional)     │  e.g. shown for trial/beta tier users
├─────────────────────────────────┤
│                                 │
│  <RouterView>                   │  flex: 1, padding-bottom: footer height
│  .container (max-width: 480px,  │
│   centered, horizontal padding) │
│                                 │
├─────────────────────────────────┤
│  AppFooter (fixed bottom)       │  height: --footer-height (48px)
└─────────────────────────────────┘
```

**AppHeader** — app icon left (links to home/dashboard via `RouterLink
to="/"`), app name centre, hamburger right. Hamburger hidden when user is
not logged in.

**AppFooter** — Feature requests · What's new · Legal · version number.
Version comes from the `-beta` derivation above (`__IS_PROD_BUILD__`), not
from `import.meta.env.MODE`.

**AppDrawer** — slides in from the side on hamburger tap (right-side is
the default convention). Contains:
- Avatar / display name
- Nav links (app-specific), filtered by the user's access tier
- Install button (PWA add to home screen)
- Dark mode toggle (next to Install)
- Group/workspace switcher (custom styled, no native select), if the app
  supports multi-group membership

### Component Patterns

**Cards** — `.card` class from global styles. Border, subtle shadow,
padding. Lists of cards have gap between them. Cards are `RouterLink`
components where they navigate on tap.

**Modals** — teleported to `<body>`, overlay click closes, slide up from
bottom on mobile, centred on desktop. Always use `<Teleport to="body">`.

**Forms** — `.form-group` > `.form-label` + `.form-input` /
`.form-textarea`. Errors shown as `.form-error` below the field. Hints as
`.form-hint`.

**Buttons** — `.btn` base + `.btn-primary` / `.btn-secondary` /
`.btn-ghost` / `.btn-danger`. Sizes: `.btn-sm`, `.btn-lg`. Full width:
`.btn-block`.

**Toasts** — via `useToastStore()`. Methods: `toast.success()`,
`toast.error()`, `toast.warning()`. Queue-based, auto-dismiss after 4
seconds.

### UI patterns worth reusing

**"Type the minor unit, show the major unit" currency input** — enter
`4567`, the field shows `£45.67`, you store `45.67`. Numeric keypad on
mobile; a decimal point is impossible to type reliably there:
```js
function onCostInput(e) {
  const digits = e.target.value.replace(/\D/g, '')
  form.total = digits ? Number(digits) / 100 : ''
  costText.value = digits ? `£${(Number(digits) / 100).toFixed(2)}` : ''
  nextTick(() => { const n = e.target.value.length; e.target.setSelectionRange(n, n) })
}
```
`<input :value="costText" type="text" inputmode="numeric" @input="onCostInput">`

**Location-aware "places I've used" autocomplete** — generalises beyond
fuel stations (job sites, pickup points, venues):
- Store places per-group: `groups/{id}/places/{id}: { name, lat, lng, updatedAt }`.
- On a location-relevant form: if geolocation permission is *already
  granted*, get a fix and **auto-populate the nearest known place within a
  single distance threshold** — no ambiguous middle zone.
- An **always-visible, always-overridable** "update this place's
  coordinates" checkbox, defaulted by situation, so a user filling the
  form in retroactively from elsewhere doesn't overwrite a place's real
  coordinates or create a duplicate.
- Raw device coordinates, no accuracy weighting for v1.
- The nearest-first sort is an **in-memory operation on the
  already-loaded list** — no per-keystroke DB work. Prefer a custom
  dropdown over `<datalist>` (browsers re-rank `<datalist>` by match
  position, so you can't enforce "nearest first").

**Domain-styled value display** — a domain-specific identifier (reg
plate, serial, booking code) often reads better with a distinctive
treatment — a reusable class + tokens (`--font-plate`, `--plate-bg`,
`--plate-ink`) rather than plain text. Ship the `@font-face` with a
graceful fallback stack so it works before the font file is added.

---

## 4. Brand Assets — Icon, Logo, Splash Screen

Every app needs these regardless of size or ambition — required for an
installable PWA to look finished rather than default/broken, and easy to
forget until install/launch testing surfaces the gap.

### App icon

- Required at multiple sizes for PWA manifest + platform install prompts:
  typically 192×192 and 512×512 minimum, plus a maskable variant (icon
  content kept within a safe zone so it isn't clipped when the OS applies
  its own mask shape on Android).
- Referenced in `manifest.json` (`icons` array) — `vite-plugin-pwa` can
  generate multiple sizes from a single source image at build time.
- Favicon (`favicon.ico` / `favicon.svg`) is separate from the PWA icon
  set — needed for browser tab display even before install.
- Keep the source icon as a high-resolution square (e.g. 1024×1024)
  master file so all derived sizes stay consistent across apps.

**Icon generation script** — `scripts/generate-icons.mjs` + `sharp`
(devDep). One 512×512 (or larger) square source → `pwa-192`, `pwa-512`,
`maskable-512` (logo padded into the ~80% safe zone on a solid
brand-colour field), `apple-touch-icon` (180×180, flattened — *iOS-only
concern, see Platform Assumption*). **Commit the outputs** so a plain
`npm run build` doesn't need `sharp`. `npm run gen:icons` regenerates.

### Logo

- Used in `AppHeader` and potentially on the splash/loading screen and
  marketing/landing content.
- Decide early whether the app needs a full wordmark logo, an icon-only
  mark, or both.
- SVG is the preferred format — scales cleanly, can be inlined via `?raw`
  Vite import (as used for print labels), and can inherit CSS colour
  variables for dark mode if designed as a single-colour mark.

### Splash / loading screen

- Distinct from the **App shell pattern** (below), which handles the
  200–500ms Firebase Auth resolution window — a splash screen is the
  *first paint*, before the app shell even mounts:
  - **Android (installed PWA):** derived from the manifest's
    `background_color`, `theme_color`, and icon — no separate splash
    image needed in most cases, the OS composites one automatically.
  - **Windows Desktop (installed PWA):** relies on the manifest icon +
    theme colour in the same way as Android; no bespoke splash asset
    pipeline needed under the current platform assumption.
  - **In-browser (not installed):** the app's own loading spinner (per the
    App shell pattern) is the only "splash" that applies.
  - *iOS (Add to Home Screen), reference only:* generated from
    `apple-touch-startup-image` link tags, or auto-generated by some PWA
    plugins from the icon + a background colour — needs per-device-size
    images if not using a plugin.
- Keep the splash background colour consistent with the brand's primary
  colour token so the transition into the loaded app doesn't flash.
- For the current Windows/Android scope, the manifest-derived default
  splash is normally sufficient — decide deliberately if a given app
  warrants bespoke splash imagery instead.

### Missing-config guard instead of a white screen

If `.env.local` isn't filled in, the app renders blank (Firebase init
throws before Vue mounts). `main.js` checks the required vars *first* and
renders a plain HTML message listing what's missing, only dynamically
importing the app when config is present:
```js
const missing = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID']
  .filter((k) => !import.meta.env[k])
if (missing.length) {
  document.getElementById('app').innerHTML = `…helpful message listing ${missing}…`
} else {
  const [{ createApp }, { default: App }, { default: router }] = await Promise.all([
    import('vue'), import('./App.vue'), import('./router')
  ])
  // …mount
}
```
(Top-level `await` is fine in a module; wrap the dynamic import in an
`async function` if targeting older browsers where TLA is unavailable.)

### Where to decide this

Add icon/logo/splash to the spec's **Visual Design** section alongside
the colour palette and typography choices.

---

## 5. Notifications

*(This section supersedes the original 5-step overview — the happy path
undersold how many sharp edges web push via FCM in a `vite-plugin-pwa` app
actually has.)*

**Base flow:**
1. User grants notification permission in browser.
2. App requests FCM token from Firebase.
3. Token stored in `users/{uid}/fcmTokens/{tokenId}`.
4. Cloud Function sends push via Firebase Admin SDK `messaging.send()`.
5. Service worker (`firebase-messaging-sw.js`) handles background
   messages.

**Setup requirements:** VAPID key pair (Firebase Console → Project
Settings → Cloud Messaging); `VITE_FIREBASE_VAPID_KEY` in env files;
service worker at `public/firebase-messaging-sw.js`; `getToken()` and
`onMessage()` from `firebase/messaging`. Requires HTTPS (not localhost).

### Two service workers, cleanly separated

- The Workbox PWA worker registers at scope `/`. FCM's worker must live
  at its own scope (`/firebase-cloud-messaging-push-scope`) so they don't
  clobber each other — registering `firebase-messaging-sw.js` at `/`
  *replaces* the Workbox worker.
- **Let the Firebase SDK register its own worker**: call `getToken(messaging,
  { vapidKey })` with **no** `serviceWorkerRegistration`. Registering it
  yourself is where bugs creep in.
- `await navigator.serviceWorker.ready` resolves for the **page's
  controlling worker** (Workbox at `/`), *not* the FCM worker — never wait
  on it for FCM.
- In `vite.config.js` Workbox config, exclude the FCM worker from precache
  and navigation fallback:
  ```js
  workbox: {
    navigateFallbackDenylist: [/firebase-messaging-sw\.js$/],
    globIgnores: ['**/firebase-messaging-sw.js']
  }
  ```

### The FCM service worker should be dependency-free

`importScripts()`-ing the Firebase compat SDK and calling
`firebase.messaging()` at the top of the SW can fail silently and stop the
worker activating — which makes `getToken()` fail with no useful error.
Use a **raw handler**:
```js
// public/firebase-messaging-sw.js — no Firebase SDK
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let p = {}
  try { p = event.data ? event.data.json() : {} } catch { /* … */ }
  const n = p.notification || {}, d = p.data || {}
  event.waitUntil(self.registration.showNotification(n.title || d.title || 'App', {
    body: n.body || d.body || '',
    icon: new URL('/maskable-512x512.png', self.location.origin).href,
    badge: new URL('/pwa-192x192.png', self.location.origin).href,
    data: { url: d.url || n.click_action || '/' }
  }))
})
```
Send messages with a **top-level `notification` *and* a `data` fallback**
(title/body/url duplicated into `data`) so the raw handler works whatever
shape FCM delivers.

### Tokens are per-device, not per-account

- An FCM token belongs to one browser instance. A user with a phone and a
  laptop has two.
- Store each device's token under a **stable per-device id** (a
  `localStorage` UUID), **not keyed by the token string**. Re-enabling on
  that device then updates its one doc; token rotation doesn't create
  orphans.
- **Never delete "the user's other tokens" when enabling on one device** —
  that silently turns push off on their other devices.
- **Dead-token cleanup is a server job**: after a send, delete any token
  doc whose response is `messaging/registration-token-not-registered` or
  `invalid-registration-token`. You cannot know a token is dead from the
  client.
- `enablePush()` should call `deleteToken(messaging)` first, so re-running
  always yields a fresh live subscription.

### Deep links from notifications

The notification carries the full target URL in `data.url`:
```js
// notificationclick
const target = new URL(event.notification.data?.url || '/', self.location.origin)
const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true })
const appWin = wins.find((w) => new URL(w.url).origin === target.origin)
if (appWin) {
  await appWin.focus()
  appWin.postMessage({ type: 'app-navigate', url: target.pathname + target.search })
} else {
  await clients.openWindow(target.href)
}
```
App windows are **not controlled by the FCM worker**, so
`WindowClient.navigate()` throws — post a message instead and let the SPA
route itself:
```js
// App.vue onMounted
navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type === 'app-navigate') router.push(e.data.url)
})
```

### Where "it's not working" actually is

- **Toast fires (foreground `onMessage`) but no system notification** —
  the message *is* being delivered; either the tab is focused (foreground
  shows a toast by design) or it's **OS-level notification settings**
  (Windows Settings → Notifications → the browser, Focus Assist; Android
  per-app). Not a code problem.
- **Notification shows a browser icon, not the app icon** — the app is
  running in a browser tab, so the OS attributes the notification to the
  browser. Only an **installed PWA** shows the app's own identity.
- *iOS, reference only:* push only works when installed to the home
  screen, and requires Safari 16.4+.

### You cannot meaningfully test push from inside the app — build an external trigger

A key-gated HTTP endpoint that fires a real push to a user (looked up by
email) with the app closed, and returns the per-token FCM result:
```
/pushTest?key=<SECRET>&email=<addr>&path=/some/page&origin=https://your-app-dev.web.app
```
Returns `{ successCount, failureCount, responses: [{ messageId, error }] }`.
`successCount: 1` with nothing on screen = it's the OS, not you. This paid
for itself many times over.

### On offering multiple delivery channels

Where an app offers both push and email reminders, make the channel(s)
user-selectable rather than fixed, and let reminder *timing* (how many
days/hours before an event) be user-configurable too — put these controls
on the user's own Account/Settings page rather than only at the
group/workspace level, so an individual can tune it without needing admin
rights. A group-level default with a per-user override (where the user
hasn't set one) is a good general pattern.

---

## 6. Groups / Roles

### Two independent axes: plan tier vs group role

Keep these as two separate fields — conflating them causes problems as
soon as an app needs both a paid-plan hierarchy and a per-group permission
hierarchy. A user's plan tier is global; their role can differ from group
to group (owner of one, basic member of another). Design the data model
and security rules around this split from the start.

### Naming the group entity

Every multi-user app needs a name for "the group of people + things a
user shares access with" (household, team, fleet, workspace...). Worth
deliberately choosing a name that:
- Fits the app's domain/theme rather than a generic default like
  "workspace" — a themed name reads better in UI copy ("invite to your
  ___") than a generic noun.
- Isn't already overloaded elsewhere in the app or the user's other tools.
- Reads naturally in an invite sentence — test it in context ("Join my
  ___", "Invite to ___") before locking it in.

### Tier structure (illustrative shape — define real tiers per app)

```
users/{uid}.planTier: 'free' | 'tier1' | 'tier2' | 'trial'
```
Common axes tiers differentiate on: item/record limits, number of
groups/workspaces a user can belong to, number of members per group,
premium features (e.g. labels, extra exports). Tier limits defined in a
single source of truth: `functions/src/helpers.js` `TIERS` object. Both
Cloud Functions and the frontend composable (`useTierGate.js`) read from
this definition.

### Computed getters in auth store (pattern, not literal names)

```js
isFreeTier    = tier === 'free'
isTier1       = tier === 'tier1'
isTier2       = tier === 'tier2'
isTrial       = tier === 'trial'
hasTier2Access = ['tier2', 'trial'].includes(tier)
hasTier1Access = ['tier1', 'tier2', 'trial'].includes(tier)
```

### Trial/Beta Tier

- Applied for via in-app form, or granted automatically as a time-limited
  trial of a higher tier.
- Grant Cloud Function sets `tier` and an expiry timestamp.
- A scheduled function checks expiry daily and downgrades expired users
  to the free tier automatically.
- Banner shown in app with days remaining, shifting toward a more urgent
  colour as expiry nears.

### Stripe Subscription → Tier Mapping (where applicable)

Webhook maps Stripe price IDs to tier names. Cancellation:
`cancel_at_period_end: true` → tier unchanged until period end →
`customer.subscription.deleted` → tier set to free. On downgrade to free
tier: non-owner group/workspace members are automatically removed (decide
and document this behaviour explicitly per app).

### Ownership transfer

Decide explicitly, at spec stage, what happens when a group Owner leaves.
A workable default: present the leaving Owner with a choice between (a)
designating another existing member as the new Owner, or (b) deleting the
group entirely (all members and records). Document which is the default
if the Owner does neither.

### Developer access (a third, independent axis — not a tier or a role)

Support/admin needs (seeing everyone's data for troubleshooting, fixing a
user's tier or role) don't naturally belong on either the plan-tier axis
or the group-role axis. Model it as its own boolean field:
```
users/{uid}.isDeveloper: boolean   // default false
```
Keeping it a separate boolean avoids two real problems: group role is
per-group, so a global admin status doesn't fit cleanly there; and a
single flag lets a Developer keep their real tier/role, using the app as
an ordinary user day-to-day while the flag unlocks extra views/actions on
top.

**Typical Developer capabilities** (a starting point, not a requirement):
sitewide visibility (all users, groups, cross-cutting admin views
regardless of the Developer's own memberships); write access to fix user
data directly (usually the actual day-to-day reason the flag exists);
optionally an `/admin`-style route gated on `isDeveloper`.

**Assignment: manual only** — set directly in Firestore/the database, not
self-serve, not tied to Stripe. **The Developer toggle is operable only
via the Firestore console** — no client path, ever (see the `unchanged()`
rule pattern below).
```js
hasDeveloperAccess = isDeveloper === true
```

### Firestore Security Rules Pattern

```
userOwnsGroup(groupId)   — checks users/{uid}.groups array
isGroupMember(groupId)   — checks groups/{groupId}/members/{uid} exists
isGroupOwner(groupId)    — checks role === 'owner' on member doc
isDeveloper()            — checks users/{uid}.isDeveloper === true
isUser(userId)           — checks request.auth.uid === userId
isAuth()                 — checks request.auth !== null
```

**Practical gotchas** (the mistakes that cost real time):

- **List queries: rules gate the whole query, they do not filter.** If a
  member's read rule is `request.auth.uid in resource.data.drivers`, an
  *unconstrained* `collection(...)` subscription is **rejected wholesale**
  — the client query MUST carry the matching constraint
  (`where('drivers', 'array-contains', uid)`). Match every client query
  to its rule. (Symptom: one role sees the list, another sees nothing,
  error only in console.)
- For "read the group doc" list queries, gate on a **denormalised
  `memberUids` array** on the doc rather than `exists()`/`get()` on a
  sub-doc — zero extra reads per candidate vs one.
- **Order rule clauses cheap-first** — `||` short-circuits, so put the
  array-membership check before any `get()`-based one.
- **Field-level write restriction**:
  `request.resource.data.diff(resource.data).affectedKeys().hasOnly(['role'])`
  — e.g. a Developer may fix *only* the `role` field on a membership doc.
- **Freeze a field from all client writes** with an `unchanged()` helper:
  ```
  function unchanged(f) {
    return request.resource.data.get(f, null) == resource.data.get(f, null);
  }
  ```
  e.g. `isDeveloper` is console-only — no client, not even a Developer,
  may flip it: `allow update: if unchanged('isDeveloper') && (...)`.
- **Indexes**: single-field `orderBy DESC` and `array-contains` are
  auto-indexed — declaring them in `firestore.indexes.json` is *rejected*
  ("this index is not necessary"). A single-field **collection-group**
  query does need an explicit `fieldOverrides` entry.
- Top-level pointer docs (`inviteLinks/{token}` etc.) resolved only
  server-side: `allow read, write: if false;` — the Admin SDK bypasses
  rules, clients must never enumerate them.

### Invite flow (reusable pattern)

1. Owner/Admin enters the invitee's email address on an "Invite" screen.
2. System sends an email containing a unique, expiring link (e.g. 7
   days).
3. Recipient clicks the link:
   - If they already have an account → added to the group immediately,
     redirected into the app.
   - If not → taken to sign-up, then auto-joined to the group on
     completion.
4. Pending invites are listed on the group's admin screen, so an
   Owner/Admin can see who hasn't yet accepted, and can revoke or resend.

This is simpler to build and easier to control access with than
shareable join-codes/links that anyone can use — prefer it unless the app
specifically needs open/self-serve joining.

**QR + join-request variant** — still worth having for face-to-face
onboarding, kept safe:
- **Invite screen generates a QR on load** (no email needed), reusing or
  regenerating one link-invite per admin per group.
- **Token → group resolution via a top-level pointer doc**
  `inviteLinks/{token}` (doc id = token) →
  `{ groupId, inviteId, kind, email, role, expiresAt, active, … }`. One
  direct `get()` — no collection-group query, no index. (Keep a
  collection-group fallback for pre-existing invites, then backfill.)
- **`joinViaToken(token)`**:
  - Email invite **and** signed-in user's email matches → **auto-join**.
  - QR/link, or email doesn't match → file a **join request**
    (`groups/{id}/joinRequests/{uid}`, status pending) + notify admins.
  - Already a member → apply any extras (below) and return.
- Owner/admin sees pending join requests with **Approve/Decline**;
  requester sees a "waiting for approval" state (drive it off a
  `users/{uid}.pendingJoinRequest` field so no extra query is needed);
  both parties get notified on resolution.
- **Invites can pre-assign the joiner** to specific records (e.g. "join
  as a driver of these vehicles"): store `recordIds[]` on the invite,
  apply on auto-join immediately, carry into the approval step for QR
  (approver can adjust the list).
- Origin-aware invite URLs (see Dual Environment, above).

---

## 7. Admin Panel (Developer-gated)

A reusable two-tab admin panel pattern, gated behind `hasDeveloperAccess`.
Route it at `/admin` or similar.

### Users tab

- **Tier summary cards** at the top — one card per plan tier value
  showing a live count of users on that tier.
- **Search box** — filter the user list by name or email.
- **User list** — each row shows name, email, and an inline dropdown to
  change that user's **plan tier** directly (writes straight to
  `users/{uid}.planTier`).
- **Do not fold Developer status into this same tier dropdown.** A
  Developer still has their own real subscription tier, and merging the
  two fields means toggling admin access risks silently overwriting it.
  Give it its own distinct control (e.g. a separate toggle/checkbox
  column).
- The Users tab's tier writes and membership-role fixes are **direct
  Firestore writes from the client**, allowed by a Developer-gated rule —
  no Cloud Function needed. Keep those rules tight
  (`hasOnly(['role'])` etc.).

### Feature Requests tab

- **Status filter** — a row of pill/segment buttons, one per status value
  (e.g. Submitted / Planned / In Progress / Complete / Won't Do — adjust
  per app).
- **Type filter** — dropdown (e.g. "All types" / Bug / Feature / ...).
- **Sort** — dropdown (e.g. Newest first / Oldest first).
- **Request cards**, each showing: type badge + status badge (top left),
  submission date (top right); title, description, "From: {submitter
  name}"; a control row with status dropdown (inline status change), type
  dropdown (inline type change), and an **Edit** button opening the
  original submission for correction; an **Archive** action rather than a
  hard Delete — sets `archived: true`, hiding the entry from default admin
  views without destroying the record (a genuinely permanent delete stays
  a manual Firebase console action, not a UI button); an **admin notes**
  field (internal only, never shown to the submitter) for triage context.
- **Silent `closedAt` timestamp** — set automatically (not user-facing)
  whenever a request's status changes to `Complete` (or another terminal
  status). Useful for identifying genuinely old, resolved requests later
  (e.g. a periodic manual cleanup pass) without inferring age from the
  original submission date.
- Feature-request `create` from ordinary users should be constrained by
  rule: `status == 'submitted' && archived == false` — everything after
  is Developer-only.

### Feature requests → agent-readable export

Closes the loop between "user files a request in the app" and "the coding
agent building the app acts on it", with no human relaying anything:
- A **key-gated, read-only HTTPS endpoint** returns the backlog as JSON,
  PII-stripped (first name only, no emails/UIDs):
  ```
  /featureRequestsExport?key=<SECRET>&status=planned,in-progress
  ```
- The agent (Claude Code) `WebFetch`es it, shortlists the self-contained
  requests, implements them, and the human marks them Complete in
  `/admin` (which stamps the silent `closedAt`).
- The **same secret** can gate other dev/ops endpoints (e.g. the push
  test above).
- Keep the endpoint's URL + key in a project note the agent can recall
  across sessions.

---

## 8. Changelogs

### Files

- `CHANGELOG.md` — developer reference, follows Keep a Changelog format.
- `public/changelog.json` — machine-readable, displayed in-app at
  `/changelog`.
- Both updated together via the changelog script.
- **They diverge in audience** — the `.md` carries implementation detail
  (`onBackgroundMessage`, `array-contains`, function names); the `.json`
  carries plain-language user benefit only. Don't just copy one into the
  other.
- Unreleased work: a `## [next] - unreleased` section with a one-line
  status.

### changelog.json format

```json
[
  {
    "version": "1.1.5",
    "date": "2026-05-28",
    "changes": [
      { "type": "feature", "text": "Description of new feature" },
      { "type": "change",  "text": "Description of changed behaviour" },
      { "type": "fix",     "text": "Description of bug fix" }
    ]
  }
]
```
`changelog.json` needs `Cache-Control: no-cache` — and so do `sw.js`,
`registerSW.js`, `index.html`, `manifest.webmanifest` (see the
`firebase.json` headers block above).

### Changelog script — `scripts/add-changelog-entry.cjs`

Interactive CLI run with `npm run changelog`. Reads current version from
`package.json`, prompts for changes interactively, writes both files.
Must use `.cjs` extension because `package.json` has `"type": "module"`.

### Release process

1. Update `"version"` in `package.json`.
2. Run `npm run changelog` — enter changes interactively.
3. `npm run deploy:prod`.
4. Immediately bump to the next version and open a new `unreleased`
   section (see Version/release flow, above).

**Skipped versions:** fold a skipped version into the next (`## [0.1.2]`
→ merged into `0.1.3`) and note it in the changelog rather than leaving a
gap.

### Spec-first workflow

Every new app begins with a versioned markdown spec/brief document,
handed to Claude Code to build from. Iterate the spec itself in version
bumps (v0.1 → v0.2 → ...) as decisions are made during planning, with its
own changelog section — keeps a clear record of what was decided when,
separate from the built app's own changelog. This guide follows the same
convention (see Document Changelog, above).

---

## 9. Dark Mode

- A **`ui` Pinia store** holds `theme` + `toggleTheme()`, which sets
  `document.documentElement.dataset.theme` **and** persists to
  `localStorage['<app>:theme']`.
- **`main.js` applies the persisted theme before `app.mount()`** — avoids
  a flash of the wrong palette on load.
- Full palette on bare `:root`; the `@media (prefers-color-scheme: dark)`
  / `[data-theme="dark"]` blocks redefine **only** the tokens that change.
- Toggle lives in the drawer, next to Install.

---

## 10. Anomaly Detection in Derived Figures

When a headline number is a rolling-window average of intervals (MPG,
spend rate, throughput…), one missing data point merges two intervals and
skews the figure — usually *optimistically*, which is the dangerous
direction.

- Detect **within the current window only** — don't reach further back.
- Walking the window chronologically, for each interval compute `avg` and
  `prevMax` over the intervals *already validated* earlier in the window;
  flag if `magnitude > avg × 1.75` **or** `magnitude > prevMax × 1.25`.
- Only start flagging once a **minimum baseline** (e.g. 3 validated
  intervals) exists.
- **Auto-exclude** flagged intervals from the figure — no dismiss/confirm
  UI. Show a non-blocking badge on the offending record.
- If the user later backfills the missing data point, normal
  recalculation splits the interval and the flag disappears — no special
  handling.

---

## 11. Additional Patterns

### Auth initialisation

`auth.init()` must be idempotent — cache the promise so multiple callers
(App.vue and router guard) share one `onAuthStateChanged` listener:
```js
let initPromise = null
function init() {
  if (initPromise) return initPromise
  initPromise = new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      // handle user...
      if (!initialised.value) { initialised.value = true; resolve() }
    })
  })
  return initPromise
}
```

### App shell pattern

`App.vue` gates the entire UI behind `authStore.initialised`:
```html
<div v-if="!authStore.initialised" class="app-loading"><spinner /></div>
<template v-else>
  <Header /><RouterView /><Footer /><Drawer />
</template>
```
This prevents flash of wrong content on page load. The spinner covers the
200–500ms Firebase Auth resolution window.

### Display name storage

Member display names stored on member documents at write time — avoids
cross-user reads which are blocked by security rules:
```
groups/{groupId}/members/{uid}:
  role, joinedAt, displayName, email
```

### Group/workspace bootstrap priority

```
1. users/{uid}.defaultGroup (user preference)
2. Last active from session storage
3. First group in users/{uid}.groups array
```

### QR code strategy (where relevant)

- Record QR encodes full URL: `https://yourdomain.com/record/{recordId}`.
- Detail route has no `requiresAuth` — public QR scanning works.
- Scanner strips URL to extract ID via a path regex.
- Records readable by anyone with the link (security through obscurity —
  long random IDs) is an acceptable pattern for low-sensitivity data;
  reconsider for anything sensitive.

### Print labels (where relevant)

Generated client-side using a `qrcode` npm package + `@media print` CSS.
No PDF library, no storage, no backend needed. `window.print()` triggers
the browser print dialog. SVG logo inlined via `?raw` Vite import.

### Environment detection

```js
// Build mode (not runtime)
import.meta.env.MODE === 'development'  // true for deploy:dev
import.meta.env.DEV                     // true for npm run dev (localhost only)
import.meta.env.PROD                    // true for production builds
```

### Version injection

```js
// vite.config.js
import { readFileSync } from 'fs'
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __IS_PROD_BUILD__: JSON.stringify(mode === 'production')
  }
}))
```
```js
// In any component
const version = __IS_PROD_BUILD__ ? __APP_VERSION__ : `${__APP_VERSION__}-beta`
```
Declare globals for TypeScript: `declare const __APP_VERSION__: string`,
`declare const __IS_PROD_BUILD__: boolean`.

---

## 12. Lessons Learned — Planning Process

Points worth applying at the *spec/planning* stage of future apps, before
any code is written:

- **Note the platform assumption explicitly** at the top of every new
  spec (Windows Desktop + Android, unless stated otherwise) — this
  affects PWA install/splash decisions and which notification edge cases
  actually apply.
- **Name overloaded concepts deliberately, early.** Generic terms like
  "workspace" or "home" often collide with other meanings — spend a few
  minutes finding a name that fits the app's theme and test it in actual
  UI sentences before locking it in.
- **Decide list-vs-calculation fields together.** A calculated/derived
  figure (e.g. an average, a rate) often implies an extra input field
  that isn't obvious from the headline feature request — walk through
  what data a stated calculation actually requires before finalising
  field lists.
- **Default + override is a recurring, reusable pattern** — for reminder
  intervals, servicing schedules, tier limits, etc. Decide at spec stage
  *where* the override lives (per-user? per-record? per-group?) since it
  affects the data model, not just the UI.
- **External/government API access is a lead-time item, not a
  configuration step.** Flag it early in planning, and always design a
  manual-entry fallback in case access is delayed or temporarily
  unavailable.
- **Explicitly resolve "what happens when X leaves/expires" scenarios at
  spec stage** (owner leaving a group, a trial expiring, a subscription
  cancelling) — easy to leave implicit and discover as bugs later.
- **Keep an Open Questions section in the spec** and close items out
  explicitly as they're resolved, rather than letting decisions happen in
  conversation and go unrecorded.
- **Brand assets (icon, logo, splash screen) are easy to skip in early
  planning** — raise them explicitly in the Visual Design part of the
  spec, even if the answer for a given app is "use the manifest-derived
  default."
- **Support/admin access doesn't have to live on the plan-tier or
  group-role axis.** Model it as its own field (see Developer access,
  above) so a trusted user can still experience the app as an ordinary
  member/subscriber while also holding that capability.
- **Don't fold an admin/developer flag into the same dropdown as plan
  tier**, even for a compact admin UI — a Developer still has their own
  real subscription tier, and merging the two fields risks silently
  overwriting it. Keep them as visually and structurally separate
  controls even on the same screen.
- **Notifications are a testing problem, not just a build problem.**
  Budget for an external test endpoint and expect to spend real time on
  OS-level display quirks. "Emails work, push doesn't" is almost always
  device/OS, not code.
- **Decide the `-beta` / version-bump discipline at spec stage** — one
  version ahead of prod, changelog `unreleased` section, bake the tag
  from `--mode`.
- **Expose the feature-request backlog to the build agent** from day one
  — a read-only keyed JSON endpoint costs nothing and closes the loop.

---

## Open Questions / Flags for This Merge

See the assistant's accompanying message for discrepancies, questions,
and suggested additions raised during this merge — not folded silently
into the document above.
