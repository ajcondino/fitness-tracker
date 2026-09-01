// Jest manual mock for `@react-native-firebase/auth`'s modular API.

export const getAuth = jest.fn();
export const onAuthStateChanged = jest.fn();
export const signOut = jest.fn();
export const signInWithCredential = jest.fn();

export const GoogleAuthProvider = {
  credential: jest.fn(),
};
