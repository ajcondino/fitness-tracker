// Jest manual mock for `expo-local-authentication` — jest-expo ships no mock
// for it. Mirrors `__mocks__/react-native-ble-plx.ts`'s shape: a real enum,
// `getEnrolledLevelAsync` a bare `jest.fn()` for tests to configure per case.

export enum SecurityLevel {
  NONE = 0,
  SECRET = 1,
  BIOMETRIC_WEAK = 2,
  BIOMETRIC_STRONG = 3,
}

export const getEnrolledLevelAsync = jest.fn();
