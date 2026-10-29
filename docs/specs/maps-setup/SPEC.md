# Feature: Maps Setup (react-native-maps + Google Maps API key)

## Intent

A real-device EAS preview build renders a Google map with no "for development
purposes only" watermark, using a restricted Google Maps API key that never
enters source control, and the key's handling is documented in the README
alongside the Firebase SHA-1 notes. This ticket is credentials and native
wiring only: no map UI ships.

## Context

- **Problem statement:** Nothing map-related exists. `package.json` has
  neither `react-native-maps` nor `expo-maps`; neither is in
  `node_modules`; `app.json`'s plugins list has no maps plugin; no
  `app.config.*` exists, so config is fully static and cannot read an env
  var. Issue #73 (Milestone 3: Optional Stretch) carves this out as its own
  ticket because it is credentials work, "same shape as the `eas credentials`
  SHA-1 work done for Firebase."
- **Current code:**
  - `app.json` — static config; `runtimeVersion: { policy: "fingerprint" }`;
    `android.package` is `com.a.condino.fitnesstracker`; plugins already
    include `@react-native-firebase/*` and `expo-build-properties`.
  - `.gitignore` — ignores `.env*.local`, `google-services.json`, `/android`,
    `/ios`. `.env.example` is the only env file tracked. There is no
    `.easignore`.
  - `eas.json` — single `preview` profile (Android, apk, internal,
    channel `preview`); no `environment` field.
  - `.eas/workflows/deploy-preview.yml` — only the `fingerprint` job declares
    `environment: preview`; the `build_android` job does not.
  - `README.md` — "Environment variables" and "Firebase / Google Sign-In
    setup" sections hold the machine-specific credential notes (debug SHA-1
    `5E:8F:16:…:F6:25`, `google-services.json` as an EAS file variable). The
    issue's "reformat checklist" is this material (see
    `docs/specs/firebase-auth-google-sign-in/SPEC.md`, "survives a machine
    reformat").
- **User impact:** None for end users. Maintainers gain a documented, repeatable
  way to provision the key locally and in EAS, and a later route-tracking
  feature can render maps without credential work.
- **Dependencies:**
  - `react-native-maps` **1.27.2** — the version Expo bundles for SDK 57,
    confirmed in `node_modules/expo/bundledNativeModules.json`. `expo-maps`
    `~57.0.1` is also bundled.
  - **Key source: a Google Maps Demo Key (no billing account / credit
    card).** This is a training project and the maintainer will not link a
    card. Per Google's pages (search results only; the live pages disagree
    with each other, so treat as unconfirmed): demo keys need no billing,
    have per-API daily caps that pause usage with no charge, are labelled
    test/prototype-only, and appear to be Google-managed rather than
    restrictable by the owner. **Whether a demo key covers Maps SDK for
    Android is unconfirmed** (the main demo-key page lists only Web Service
    APIs; the AI Studio page says Android is covered). No expiry policy was
    found. Step 1 settles coverage with a device test.
  - If a billing-enabled key is ever used instead: a Google Cloud project
    with **Maps SDK for Android** enabled, restricted to the package name
    plus both signing SHA-1s (the debug one already in README, and the EAS
    `preview` keystore SHA-1 from `eas credentials`). Documented in the
    README as the upgrade path, not performed in this ticket.
  - `expo-dev-client` is already installed; local verification uses a dev
    build, not Expo Go.
- **Library choice (provisional — see Constraints):** `react-native-maps`.
  Supporting facts: the issue scopes it; it is Expo's pinned version for SDK
  57; later route tracking needs polylines/markers and its maturity there is
  established, whereas `expo-maps` parity is **unconfirmed**. Switching later
  is cheap at this stage (only the key's location differs).

### Verification status

Confirmed locally: bundled versions above; `app.json`, `eas.json`, workflow,
`.gitignore` contents. Confirmed only from the current (`latest`) Expo docs
via search, **not** the v57 pages: plugin option `androidGoogleMapsApiKey`
reading `process.env`; `expo-maps` using `android.config.googleMaps.apiKey`
(build-time only); `.easignore` must not exclude `.env`; EAS CLI does not
load `.env` files when resolving app config; `secret`-visibility EAS
variables are unavailable during config resolution. **Unverified** and
resolved in Implementation Step 1: the four items listed under Constraints.

## Data Model

N/A — no types, persistence, or schema changes. The only new "data" is one
configuration value:

- `GOOGLE_MAPS_API_KEY` (string, optional at config-resolution time). Read
  from `process.env` in `app.config.ts`. Deliberately **not** `EXPO_PUBLIC_`
  prefixed: it is needed only by the native build, never the JS bundle.

## Interfaces / API

`app.config.ts` default export, an Expo `ExpoConfig` function:

```
export default ({ config }: ConfigContext): ExpoConfig
```

- Input: the already-parsed `app.json` config.
- Output: the same config with one plugin appended:
  `['react-native-maps', { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY }]`
  (option name to be re-confirmed against the v57 page in Step 1).
- Existing `plugins`, `android`, `runtimeVersion`, and `updates` entries pass
  through unchanged; `app.json` is not edited.
- **Unset env var:** the config must still resolve (no throw), so `pnpm lint`,
  `pnpm typecheck`, `pnpm test`, and CI (which has no key) keep working. The
  plugin entry is omitted or receives `undefined`, per whichever the v57
  plugin tolerates — decided in Step 1. A build produced without the key is
  expected to show a blank/watermarked map, not fail.
- No runtime JS API is added; no component imports `react-native-maps` in the
  committed code.

## Files Created

| File                            | Purpose                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `app.config.ts`                 | Dynamic config wrapping `app.json`; injects the maps plugin with the key from the environment. |
| `docs/specs/maps-setup/SPEC.md` | This spec.                                                                                     |

## Files Modified

| File                             | Change                                                                                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`, `pnpm-lock.yaml` | Add `react-native-maps` at the SDK-57-pinned version via `pnpm exec expo install react-native-maps`.                                                                         |
| `.env.example`                   | Add a `GOOGLE_MAPS_API_KEY=` placeholder line (no real value).                                                                                                               |
| `eas.json`                       | **Conditional (Step 1):** add `"environment": "preview"` to the `preview` build profile if the `build_android` job does not otherwise receive the `preview` EAS Environment. |
| `README.md`                      | New "Google Maps API key" subsection in the machine-specific-credentials area (see Step 6); extend the "Environment variables" table with `GOOGLE_MAPS_API_KEY`.             |

## Implementation Steps

1. **Verify against the v57 docs before writing code.** Read
   `https://docs.expo.dev/versions/v57.0.0/sdk/map-view/` and
   `.../sdk/maps/` and record: expo-maps status and polyline/marker support;
   exact `react-native-maps` plugin option names; behavior with an undefined
   key. Read the EAS environment-variable usage and FAQ pages and record:
   whether the `build` job gets the `preview` Environment without
   `eas.json` `environment`; variable-visibility rules at config resolution.
   Check whether a key change alters the fingerprint
   (`pnpm dlx @expo/fingerprint` before/after). Update this spec's
   "Library choice" and Constraints with the results. **If any finding
   contradicts this spec, stop and report before continuing.**
2. **Manual (maintainer):** use the Maps Demo Key already obtained. Do not
   link a billing account. Smoke-test coverage first: a dev build with the
   key and a throwaway `MapView`; if tiles don't render because the demo key
   doesn't cover Maps SDK for Android, **stop and report** — there is no
   no-card workaround to improvise. (Real-key path, documented only:
   restrict to package `com.a.condino.fitnesstracker` and both SHA-1s.)
3. **Install:** `pnpm exec expo install react-native-maps`.
4. **Config:** add `app.config.ts` per Interfaces / API. Confirm
   `pnpm exec expo config --type introspect` shows the plugin and key when
   `GOOGLE_MAPS_API_KEY` is set in `.env.local`, and still resolves when
   unset.
5. **Env + EAS:** add the `.env.example` placeholder; maintainer runs
   `eas env:create --environment preview --name GOOGLE_MAPS_API_KEY`
   (visibility **plain text or sensitive**, not secret) and sets the value in
   local `.env.local`. Apply the conditional `eas.json` change if Step 1
   requires it.
6. **Docs:** update `README.md`: key creation and restrictions; which SHA-1s
   and where each comes from; the local (`.env.local`) vs EAS Environment
   split and why a gitignored `.env.local` never reaches EAS; the `.easignore`
   warning (if one is ever added it must not exclude `.env*`); the
   `expo prebuild --clean` requirement because `android/` is generated; a
   note that a key change forces a new native build rather than an OTA update
   (if confirmed in Step 1); and an added line to the credentials checklist
   next to the Firebase SHA-1 text.
7. **Device verification (not committed):** with the maintainer's chosen
   throwaway `MapView` (see Constraints), push to `develop`, let the EAS
   workflow produce a preview build, install on a physical device, confirm
   tiles render with no watermark. Remove the throwaway before the PR.
8. **Restriction check: N/A for the demo key** (Google-managed, not
   configurable by the owner). Record this deviation from the issue on #73.
   Perform the check only if the key is later swapped for a restricted,
   billing-enabled one.
9. **Validate:** `pnpm lint`, `pnpm typecheck`, `pnpm test`,
   `pnpm format:check`; `git grep` the key value and confirm `git status`
   shows it in no tracked file.

## Style & Conventions

- `AGENTS.md` / `CLAUDE.md`: read versioned Expo SDK 57 docs before touching
  Expo APIs (Step 1); spec before code; additive diffs — `app.json` is left
  untouched and wrapped rather than migrated.
- **Deliberate deviation / structural flag:** `app.config.ts` is the repo's
  first dynamic config. CLAUDE.md says cross-cutting structure is decided by
  hand, so this is called out for explicit approval rather than assumed.
  Alternative (rejected): putting the key in `app.json` directly, which would
  commit it.
- Package manager is pnpm, never npm/yarn.
- `android/` is generated and gitignored (CNG); no native files are
  hand-edited.
- No theme, i18n, navigation, or component changes, so the theming and i18n
  rules are not triggered.
- Env naming follows the existing `.env.example` / `.env.local` convention.

## Acceptance Criteria

- [ ] A map renders on a physical-device EAS `preview` build with tiles loaded
      and no "for development purposes only" watermark.
- [ ] **Deviation from issue #73:** the key is a Maps Demo Key, so the
      issue's "restricted to package + SHA-1" criterion is recorded as N/A
      (Google-managed restrictions), with the real-key restriction steps
      documented in the README. The deviation is noted on the issue.
- [ ] `git grep` for the key value returns nothing, and no tracked file
      contains it; `.env.example` holds only an empty placeholder.
- [ ] `pnpm exec expo config --type introspect` resolves both with
      `GOOGLE_MAPS_API_KEY` set and unset.
- [ ] `GOOGLE_MAPS_API_KEY` exists in the `preview` EAS Environment and the
      CI build job demonstrably receives it (the preview build's map works).
- [ ] README documents key creation, restrictions, both SHA-1 sources,
      local-vs-EAS handling, the `.easignore` trap, and `prebuild --clean`;
      the credentials checklist references the key.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm format:check`
      pass with no key present.
- [ ] No throwaway `MapView` or route remains in the diff.

## Constraints

- **Non-goals:** any shipped map UI, routes/tabs, location permissions,
  `expo-location`, route tracking, iOS maps/key, production profile or
  release keystore (README already marks release as not yet registered).
- **Unverified for SDK 57 (resolve in Step 1, record results here):**
  1. `expo-maps` status (alpha/beta/stable) and polyline/marker support —
     governs whether `react-native-maps` stays the pick.
  2. Exact plugin option names on the v57 `react-native-maps` page.
  3. Whether the EAS workflow `build` job receives the `preview`
     Environment without `eas.json` `environment`.
  4. Whether a key change alters the native fingerprint (expected: yes, so
     a new build, not an OTA update).
- **Needs maintainer decision:** the device-verification `MapView` requires
  a screen. Default: a temporary, uncommitted `MapView` on an existing screen
  for the verification build only (keeps the PR pure config). Alternative: a
  dev-only route the maintainer names. Adding a route/tab is navigation
  structure, which is decided by hand.
- **Manual-only steps:** obtaining the key, `eas env:create`, and device
  install cannot be done by the agent (`eas credentials` only for the
  real-key path).
- The key is embedded in the APK manifest by design, and a demo key cannot
  be restricted, so it must stay out of git and out of any logs/PR text.
  Daily caps and a possible expiry mean the map may stop working; swapping
  keys is a value change plus rebuild.
- Do not create an `.easignore`. If one is later added it must mirror
  `.gitignore` but not exclude `.env*`.
