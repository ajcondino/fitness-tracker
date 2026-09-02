import { getApp } from '@react-native-firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  type Auth,
  type User,
} from '@react-native-firebase/auth';

// Provider-agnostic Firebase Auth wrapper — the layer a future second
// provider (e.g. Apple) would sit beside, not inside. See SPEC.md's Style &
// Conventions.
//
// Types: `Auth`/`User` are this installed version's (v26, modular-only)
// exports — the older namespaced API's `FirebaseAuthTypes.Module`/
// `FirebaseAuthTypes.User` types SPEC.md was written against don't exist in
// this package anymore (verified against the installed
// @react-native-firebase/auth@26.3.2 — see SPEC.md's own "verify at
// implementation time" note on this exact import shape).

export function getFirebaseAuth(): Auth {
  // A thin passthrough: getAuth(getApp()). No initializeApp/initializeAuth
  // call exists anywhere in this ticket's own code —
  // @react-native-firebase/app initializes the native Firebase app
  // automatically from google-services.json at native app startup, before
  // any JS runs. This function exists so every other module in src/auth/
  // has one shared call site, not because there's any lazy setup left to
  // memoize here.
  return getAuth(getApp());
}

export function onAuthStateChangedListener(callback: (user: User | null) => void): () => void {
  // Returns the unsubscribe function directly — the only consumer
  // (use-auth.ts) returns it straight from its own useEffect.
  return onAuthStateChanged(getFirebaseAuth(), callback);
}

export async function signOutOfFirebase(): Promise<void> {
  // Swallows a thrown error (matches health-connect-store.ts's "a failed
  // write/action is not a user-facing failure" contract) — sign-out's own
  // optimistic local status flip (see use-auth.ts) already reflects the
  // intended end state regardless of whether the network round-trip to
  // invalidate the token server-side completes.
  try {
    await signOut(getFirebaseAuth());
  } catch {
    // Intentionally swallowed — see above.
  }
}
