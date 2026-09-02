// Framework-free (no firebase/React import) — see SPEC.md's Data Model.

export type AuthUser = {
  uid: string;
  displayName: string | null;
  email: string | null;
};
// A deliberately minimal projection of @react-native-firebase/auth's `User`
// type — only the three fields any UI in this ticket reads. No photoURL:
// `Avatar` (components/ui/avatar.tsx) renders a single initial, never an
// image, and adding image support is exactly the kind of "profile
// editing/avatars" work the ticket lists as out of scope. Google accounts
// always populate `displayName`, but this type keeps it nullable to match
// the underlying type's own (unnarrowed) shape rather than asserting a
// guarantee this app can't verify.

export type AccountSectionStatus =
  | 'checking' // initial auth-restore in flight — mirrors
  // HealthConnectSectionStatus's identical 'checking' state and its
  // "renders nothing while loading" convention (see account-section.tsx).
  | 'signedOut'
  | 'signingIn'
  | 'signedIn'
  | 'error'; // a real signInWithGoogle() failure (network/unknown) —
// deliberately excludes user-cancelled, which resolves straight back to
// 'signedOut' with no error surfaced (see use-auth.ts).

export type SignInFailureReason = 'network' | 'unknown';

export type SignInResult =
  | { status: 'success' }
  | { status: 'cancelled' }
  | { status: 'error'; reason: SignInFailureReason };
