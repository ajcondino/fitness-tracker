import { BleManager } from 'react-native-ble-plx';

/**
 * App-wide BLE manager, constructed once per process — mirrors the singleton
 * pattern in `src/i18n/index.ts`. `BleManager` must be constructed exactly
 * once for the life of the app; re-constructing it leaks the native side.
 *
 * Caveat: Metro Fast Refresh can re-evaluate this module during development
 * and construct a second instance, leaking the first. Not guarded against
 * here — there's no consumer yet to define a teardown lifecycle around.
 */
export const bleManager = new BleManager();
