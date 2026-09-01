# Fitness Tracker

A React Native fitness-tracking app built with [Expo](https://expo.dev) and Expo Router. The project is currently freshly scaffolded — no tracking features exist yet, just the base app shell, tooling, CI, and OTA update pipeline.

## Prerequisites

- [Node.js](https://nodejs.org) >= 22.13.0
- [pnpm](https://pnpm.io) (this repo pins `pnpm@11.8.0` via `packageManager` in `package.json` — `corepack enable` will pick it up automatically)
- Android Studio with an emulator configured, or a physical Android device with [Expo Go](https://expo.dev/go)/a dev client installed
  - iOS is not currently built or distributed (see [OTA Updates](#ota-updates)) — a simulator isn't required for the workflows this repo automates, though `pnpm ios` still works for local exploration if you have Xcode installed
- [EAS CLI](https://docs.expo.dev/eas/) (`pnpm dlx eas-cli`) — only needed if you're manually triggering builds/updates rather than relying on the automated workflow

## Environment variables

Copy [.env.example](.env.example) to `.env.local` (already git-ignored) and fill in real values:

| Variable                 | Description                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry DSN used by `Sentry.init` in [src/app/_layout.tsx](src/app/_layout.tsx). Leave unset to disable Sentry locally. |

`EXPO_PUBLIC_`-prefixed variables are inlined into the JS bundle at build time and are client-visible — see [Expo's environment variables guide](https://docs.expo.dev/guides/environment-variables/). Don't put secrets that must stay server-only behind this prefix.

For EAS builds/updates, set the same variable in the `preview` EAS Environment (`eas env:create/update --environment preview`) so it's available during CI builds too.

## Firebase / Google Sign-In setup

Sign-in (`src/auth/`) needs a native `google-services.json` at the project root — it's **not** committed (gitignored alongside `.env*.local`, same as the rest of this repo's per-environment config), so every developer and the `preview` EAS Environment each need their own copy:

1. In the [Firebase console](https://console.firebase.google.com), open (or create) the project, enable the **Google** sign-in provider under Authentication, and add an Android app with package name `com.a.condino.fitnesstracker` if one isn't registered yet.
2. Under that Android app's settings, register the SHA-1 of **both** keystores used to sign a build:
   - **Debug**: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` — **not** your machine's `~/.android/debug.keystore`. `expo prebuild` always bundles its own project-local `android/app/debug.keystore` (Expo's shared default template debug key, the same across every default-template Expo project), and that's what actually signs local dev builds. Get it via `keytool -list -v -keystore android/app/debug.keystore -alias androiddebugkey -storepass android -keypass android` (or `cd android && ./gradlew signingReport`) after `android/` has been generated. Because it's Expo's fixed template keystore rather than a per-machine one, this one fingerprint covers every developer's local build — it doesn't need re-registering per machine.
   - **Release**: not yet registered — add the release keystore's SHA-1 the same way once one exists, and update this line.
3. Download that Android app's `google-services.json` and place it at the project root.
4. Copy the **Web application** OAuth client ID (the `client_type: 3` entry in that file — Firebase creates it automatically once the Google provider is enabled) into `WEB_CLIENT_ID` in [src/auth/google-sign-in.ts](src/auth/google-sign-in.ts). `@react-native-google-signin/google-signin` has no build-time mechanism to read this out of `google-services.json` itself, so it's hardcoded there — update it by hand if the OAuth client is ever regenerated.
5. For EAS builds, add `google-services.json` as a **file-type** environment variable so CI has it too: `eas env:create --environment preview --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json` (mirrors this project's existing `EXPO_PUBLIC_SENTRY_DSN` entry in the same Environment, but for a file).

Without step 4, a CI-triggered build will build successfully but Google Sign-In/Firebase Auth will silently fail at runtime — it only works locally where `google-services.json` was placed by hand.

## Setup

```bash
git clone <repo-url>
cd fitness-tracker
pnpm install
pnpm start
```

From the Metro output you can open the app in:

- an Android emulator or connected device
- [Expo Go](https://expo.dev/go), for quick sandboxed testing
- a [development build](https://docs.expo.dev/develop/development-builds/introduction/), once one exists

## Other useful commands

| Command             | Description                                                     |
| ------------------- | --------------------------------------------------------------- |
| `pnpm android`      | Build and run on Android (`expo run:android`)                   |
| `pnpm web`          | Start the web build (`expo start --web`)                        |
| `pnpm lint`         | Lint with [oxlint](https://oxc.rs/docs/guide/usage/linter.html) |
| `pnpm format`       | Format the codebase with Prettier                               |
| `pnpm format:check` | Check formatting without writing changes                        |
| `pnpm typecheck`    | Type-check with `tsc --noEmit`                                  |
| `pnpm test`         | Run the Jest test suite                                         |

Linting also runs automatically on staged files via a `husky` pre-commit hook (`lint-staged`).

## Tech stack

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) / React Native 0.86 / React 19
- [Expo Router](https://docs.expo.dev/router/introduction/) — file-based routing with typed routes
- TypeScript
- [EAS Build & EAS Update](https://docs.expo.dev/eas/) — Android builds and OTA updates (see below)
- [Jest](https://jestjs.io/) + `jest-expo` + [`@testing-library/react-native`](https://callstack.github.io/react-native-testing-library/) for testing
- `oxlint` + Prettier for linting/formatting, enforced via `husky` + `lint-staged`
- pnpm as the package manager
- GitHub Actions for CI (lint, typecheck, test on push/PR to `main`)

## Folder structure

```
.
├── .eas/workflows/       # EAS Workflows — automated preview builds/OTA updates
├── .github/workflows/    # GitHub Actions CI (lint, typecheck, test)
├── assets/               # Images and app icons
├── src/
│   └── app/              # expo-router routes (file-based routing)
│       ├── _layout.tsx   # Root layout
│       ├── index.tsx     # Home route
│       └── __tests__/    # Tests colocated with the code under test
├── app.json              # Expo app config (updates, runtimeVersion, plugins, etc.)
├── eas.json               # EAS Build profiles and Update channels
└── package.json
```

## OTA updates

This project ships over-the-air updates via [EAS Update](https://docs.expo.dev/eas-update/introduction/), **Android only** — iOS builds/updates aren't set up. There's a single `preview` channel for now; this is a training project with no production plans, so both `main` and `develop` feed the same channel rather than being split into preview/production.

- `.eas/workflows/deploy-preview.yml` runs on every push to `main` or `develop`: it fingerprints the native layer, checks whether an Android build already exists for that fingerprint, and either builds a new Android binary (`preview` profile) or publishes an OTA update to the `preview` channel — whichever the fingerprint match calls for.
- `app.json` uses `runtimeVersion: { policy: "fingerprint" }` so builds and updates can be matched by native fingerprint rather than app version.
- To publish or build manually instead of waiting on a push:

  ```bash
  pnpm dlx eas-cli update --branch preview --platform android
  pnpm dlx eas-cli build --profile preview --platform android
  ```

One-time setup on EAS (already done for this project, documented here for reference): `eas env:create --environment preview` and `eas channel:create preview`.

## Contributing

Branch strategy: `develop` is the staging branch and the base for day-to-day work; `main` tracks production and stays release-ready.

1. Branch off `develop`.
2. Make your changes — the pre-commit hook will lint-fix and format staged files automatically.
3. Before opening a PR, make sure `pnpm lint`, `pnpm typecheck`, and `pnpm test` all pass.
4. Open a PR into `develop` with a clear description of the change. `develop` gets promoted to `main` periodically — both GitHub Actions CI and the OTA update workflow run on pushes/PRs to either branch.
