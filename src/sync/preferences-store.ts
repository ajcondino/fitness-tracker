import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type FieldValue,
} from '@react-native-firebase/firestore';

import { getFirebaseFirestore } from '@/sync/firestore-client';
import type { UnitsPreference } from '@/units/units-store';

// The Firestore analog of src/units/units-store.ts — same "one module owns
// this path's reads and writes" shape, but deliberately does NOT swallow
// errors internally, unlike every AsyncStorage-backed store in this repo.
// use-preferences-sync.ts needs to tell "no document exists yet" (null, a
// normal case — seed it) apart from "the read failed" (an exception — skip
// this sync attempt entirely) and needs a genuine rejection on a failed
// write so its own .catch() is the single, visible place that decision is
// made. See SPEC.md's Interfaces/API.
//
// Types: `FieldValue` is this installed version's (v26, modular-only)
// export — there is no `FirebaseFirestoreTypes` namespace, mirroring
// firestore-client.ts's identical correction.

export type PreferencesDocument = {
  units: UnitsPreference;
  updatedAt: FieldValue;
};

function preferencesDocRef(uid: string) {
  return doc(getFirebaseFirestore(), 'users', uid, 'preferences', 'settings');
}

export async function fetchRemotePreferences(uid: string): Promise<PreferencesDocument | null> {
  // Rejects if the read itself throws (e.g. no cache and no network) — does
  // not catch. Returns null when the document doesn't exist (a
  // never-synced account — not an error).
  const snapshot = await getDoc(preferencesDocRef(uid));
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.data() as PreferencesDocument;
}

export async function writeRemotePreferences(uid: string, units: UnitsPreference): Promise<void> {
  // Rejects if the write throws — does not catch. `merge: true` so a future
  // sibling field (e.g. language) written by a different call never gets
  // clobbered by this one.
  await setDoc(preferencesDocRef(uid), { units, updatedAt: serverTimestamp() }, { merge: true });
}
