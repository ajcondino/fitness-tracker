// Jest manual mock for `@react-native-community/netinfo`'s modular API.
// Only `useNetInfo` is consumed anywhere in this repo (see
// use-network-status.ts) — tests set its return value per case via
// `mockedUseNetInfo.mockReturnValue(...)`.

export const useNetInfo = jest.fn();
