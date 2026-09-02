import { GoogleAuthProvider, signInWithCredential } from '@react-native-firebase/auth';
import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';

import { getFirebaseAuth } from '@/auth/auth-client';
import type { SignInResult } from '@/auth/auth-types';

// The one provider-specific module — a future src/auth/apple-sign-in.ts
// would be this file's sibling, not a change to it. See SPEC.md's Style &
// Conventions.

let configured = false;

// The "Web application" OAuth client ID from this Firebase project's
// google-services.json (the client_type: 3 entry, the same value the
// Google Sign-In web flow and Firebase's GoogleAuthProvider both need to
// mint an idToken). Not a secret — Google's own guidance is that OAuth
// client IDs are safe to ship inside a compiled app, same reasoning
// SPEC.md already applies to google-services.json itself.
//
// CORRECTION to this ticket's original SPEC.md, which assumed
// `webClientId: 'autoDetect'` resolves this value from google-services.json
// at build time: verified against the actually-installed
// @react-native-google-signin/google-signin@16.1.4's full source (JS,
// native Android, and its Expo config plugin) — there is no handling of the
// string 'autoDetect' anywhere in this version. `configure()`'s native
// implementation (RNGoogleSigninModule#configure) passes whatever string is
// given straight to `GoogleSignInOptions.Builder#requestIdToken()`, so
// 'autoDetect' was being used verbatim as an OAuth client ID — an
// always-invalid value that reliably produces DEVELOPER_ERROR. Hardcoding
// the real ID here is the only mechanism this installed version supports;
// if it's ever regenerated in the Firebase/Google Cloud console, update it
// here (see README.md's Firebase / Google Sign-In setup note).
const WEB_CLIENT_ID = '137085192482-rrorb8qb6524kvo7g9oda6gkh4cuqmk2.apps.googleusercontent.com';

// Lazily configures GoogleSignin exactly once (module-scope guard, same
// shape as this repo's other ensureInitialized()-style setup calls).
function ensureConfigured() {
  if (!configured) {
    GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
    configured = true;
  }
}

/**
 * Never rejects — every internal failure resolves a SignInResult, mirroring
 * health-connect-sync.ts's "never throws" contract.
 *
 * Verified against the installed
 * @react-native-google-signin/google-signin@16.1.4, which has changed
 * materially from SPEC.md's assumed shape (written against an older
 * release):
 * - `GoogleSignin.signIn()` no longer throws on cancellation — it resolves
 *   `{ type: 'cancelled' }` directly, checked here via `isCancelledResponse`
 *   rather than catching `statusCodes.SIGN_IN_CANCELLED`.
 * - The signed-in `idToken` lives at `response.data.idToken`, not a
 *   top-level `{ idToken }`.
 * - `statusCodes` no longer exports a `NETWORK_ERROR` member (confirmed
 *   against the installed package's own type/constant definitions and its
 *   published docs: "errors... contain a value from statusCodes or some
 *   other string for the less-usual errors"). A GoogleSignin-side failure
 *   (Play Services unavailable, a sign-in already in progress, or an
 *   actual network failure inside the native sign-in flow) therefore has no
 *   reliable symbolic code to check here and resolves 'unknown' — only
 *   Firebase's own `signInWithCredential` rejection
 *   (`auth/network-request-failed`, confirmed against the installed
 *   @react-native-firebase/auth@26.3.2's own native error-code mapping) is
 *   classified as 'network'.
 */
export async function signInWithGoogle(): Promise<SignInResult> {
  ensureConfigured();

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) {
      return { status: 'cancelled' };
    }
    if (!isSuccessResponse(response)) {
      return { status: 'error', reason: 'unknown' };
    }

    const idToken = response.data.idToken;
    if (!idToken) {
      // The library's documented possible-but-rare outcome — resolved
      // rather than passed to Firebase.
      return { status: 'error', reason: 'unknown' };
    }

    const credential = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(getFirebaseAuth(), credential);
    // This function does NOT set any signed-in state itself — this
    // success is what changes the native Firebase app's own auth state,
    // which use-auth.ts's onAuthStateChangedListener subscription observes
    // and translates into 'signedIn'.
    return { status: 'success' };
  } catch (error) {
    if (isErrorWithCode(error) && error.code === 'auth/network-request-failed') {
      return { status: 'error', reason: 'network' };
    }
    return { status: 'error', reason: 'unknown' };
  }
}
