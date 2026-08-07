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
