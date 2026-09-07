import { getApp } from '@react-native-firebase/app';
import { getFirestore, type Firestore } from '@react-native-firebase/firestore';

// Mirrors src/auth/auth-client.ts's shape exactly — a thin, single shared
// call site, not a place for business logic. See SPEC.md's Interfaces/API.
//
// Types: `Firestore` is this installed version's (v26, modular-only) export
// — there is no `FirebaseFirestoreTypes` namespace in this package, the
// same correction auth-client.ts already had to make for `Auth`/`User`
// (verified against the installed @react-native-firebase/firestore@26.3.3 —
// see SPEC.md's own "verify at implementation time" note on this exact
// import shape).

export function getFirebaseFirestore(): Firestore {
  // A thin passthrough: getFirestore(getApp()). No settings()/
  // enablePersistence() call — the native SDK has offline persistence
  // enabled by default (verified against the installed package's modular
  // API), so there's nothing to configure here. See SPEC.md's Offline
  // behaviour section.
  return getFirestore(getApp());
}
