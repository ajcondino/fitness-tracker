// Manual mock for `expo-device` — jest-expo ships no mock for it, and the
// real module exports `platformApiLevel` as a plain `number | null` const,
// not a getter, so there's nothing for `jest.spyOn(Device, 'platformApiLevel',
// 'get')` to attach to. This mock defines it as a real accessor property so
// tests can spy on it exactly like the existing `Platform.Version` pattern.
// `exports` is CommonJS-only — there's no `@types/node` in this project, so
// it's declared locally rather than pulling in that dependency for one file.
declare const exports: Record<string, unknown>;

let currentPlatformApiLevel: number | null = null;

Object.defineProperty(exports, 'platformApiLevel', {
  configurable: true,
  enumerable: true,
  get: () => currentPlatformApiLevel,
  set: (value: number | null) => {
    currentPlatformApiLevel = value;
  },
});
