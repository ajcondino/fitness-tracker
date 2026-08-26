// Jest manual mock for `react-native-health-connect` — mirrors
// `__mocks__/react-native-ble-plx.ts`'s shape: real constant values, every
// function a bare `jest.fn()` for tests to configure per case.

export const SdkAvailabilityStatus = {
  SDK_UNAVAILABLE: 1,
  SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED: 2,
  SDK_AVAILABLE: 3,
} as const;

export const getSdkStatus = jest.fn();
export const initialize = jest.fn();
export const getGrantedPermissions = jest.fn();
export const requestPermission = jest.fn();
export const openHealthConnectSettings = jest.fn();
