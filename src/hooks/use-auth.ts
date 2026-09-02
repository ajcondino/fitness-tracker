import { useEffect, useState } from 'react';

import { onAuthStateChangedListener, signOutOfFirebase } from '@/auth/auth-client';
import type { AccountSectionStatus, AuthUser, SignInFailureReason } from '@/auth/auth-types';
import { signInWithGoogle as signInWithGoogleProvider } from '@/auth/google-sign-in';

export function useAuth(): {
  status: AccountSectionStatus;
  user: AuthUser | null;
  signInError: SignInFailureReason | null;
  signInWithGoogle: () => void;
  signOut: () => void;
} {
  const [status, setStatus] = useState<AccountSectionStatus>('checking');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [signInError, setSignInError] = useState<SignInFailureReason | null>(null);

  useEffect(() => {
    // Only ever *observes* auth state — the sole path that can show the
    // Google account picker is the user-tap-triggered signInWithGoogle()
    // below. Firebase guarantees this fires at least once, synchronously
    // after checking persisted state, which is what makes a cold-start
    // restore land on 'signedIn' without ever passing through
    // 'signedOut' first.
    return onAuthStateChangedListener((firebaseUser) => {
      if (firebaseUser == null) {
        setStatus('signedOut');
        setUser(null);
        setSignInError(null);
        return;
      }
      setStatus('signedIn');
      setUser({
        uid: firebaseUser.uid,
        displayName: firebaseUser.displayName,
        email: firebaseUser.email,
      });
      setSignInError(null);
    });
  }, []);

  function signInWithGoogle() {
    if (status === 'signingIn') {
      // Never issue a second concurrent attempt — mirrors
      // use-device-pairing.ts's connect() guard.
      return;
    }
    setStatus('signingIn');
    setSignInError(null);
    signInWithGoogleProvider().then((result) => {
      switch (result.status) {
        case 'success':
          // No local state change — the listener above will (already
          // has, in practice) land on 'signedIn'.
          return;
        case 'cancelled':
          setStatus('signedOut');
          return;
        case 'error':
          setStatus('error');
          setSignInError(result.reason);
          return;
      }
    });
  }

  function signOut() {
    // Optimistic, fire-and-forget — matches
    // use-health-connect-settings.ts's setWriteBackEnabled precedent. The
    // listener will independently confirm the same end state once the
    // native SDK's own auth state updates.
    setStatus('signedOut');
    setUser(null);
    signOutOfFirebase();
  }

  return { status, user, signInError, signInWithGoogle, signOut };
}
