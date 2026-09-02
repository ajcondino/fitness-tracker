// Jest manual mock for `@react-native-google-signin/google-signin` —
// mirrors `__mocks__/react-native-health-connect.ts`'s established shape:
// real constant values and real (pure) predicate logic, every function that
// calls into native code a bare `jest.fn()` for tests to configure per
// case.
//
// `statusCodes`, `isErrorWithCode`, `isCancelledResponse`, and
// `isSuccessResponse` are reproduced verbatim from the installed
// @react-native-google-signin/google-signin@16.1.4 — see
// src/auth/google-sign-in.ts's own comment for why this version's shape
// (no `statusCodes.NETWORK_ERROR`, cancellation resolved rather than
// thrown) differs from SPEC.md's original assumption.

export const GoogleSignin = {
  configure: jest.fn(),
  hasPlayServices: jest.fn(),
  signIn: jest.fn(),
};

export const statusCodes = Object.freeze({
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  IN_PROGRESS: 'IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
  NULL_PRESENTER: 'NULL_PRESENTER',
});

export function isErrorWithCode(error: unknown): error is { code: string } {
  return (
    (error instanceof Error || (typeof error === 'object' && error != null)) && 'code' in error
  );
}

export function isCancelledResponse(response: { type: string }): boolean {
  return response.type === 'cancelled';
}

export function isSuccessResponse(response: { type: string }): boolean {
  return response.type === 'success';
}
