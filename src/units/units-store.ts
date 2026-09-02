import AsyncStorage from '@react-native-async-storage/async-storage';

import type { UnitSystem } from '@/units/units';

/**
 * Framework-free storage module: no React import — mirrors
 * `src/health/health-connect-store.ts`'s exact shape. Two independent keys
 * rather than one JSON blob, matching the two toggles' independence. See
 * SPEC.md's Data Model.
 */

export type UnitsPreference = {
  distance: UnitSystem;
  weight: UnitSystem;
};

const DISTANCE_UNIT_KEY = 'units.distance';
const WEIGHT_UNIT_KEY = 'units.weight';

const DEFAULT_UNIT_SYSTEM: UnitSystem = 'metric';

// All reads/writes are best-effort — any failure (storage unavailable,
// corrupt/legacy value) is caught and treated as the safe 'metric' default,
// never thrown, matching health-connect-store.ts's contract.

async function loadUnitSystem(key: string): Promise<UnitSystem> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw === 'imperial' ? 'imperial' : DEFAULT_UNIT_SYSTEM;
  } catch {
    return DEFAULT_UNIT_SYSTEM;
  }
}

async function saveUnitSystem(key: string, system: UnitSystem): Promise<void> {
  try {
    await AsyncStorage.setItem(key, system);
  } catch {
    // A failed write is not a user-facing failure — matches
    // saveWriteBackEnabled's contract.
  }
}

export async function loadUnitsPreference(): Promise<UnitsPreference> {
  const [distance, weight] = await Promise.all([
    loadUnitSystem(DISTANCE_UNIT_KEY),
    loadUnitSystem(WEIGHT_UNIT_KEY),
  ]);
  return { distance, weight };
}

export async function saveDistanceUnit(system: UnitSystem): Promise<void> {
  await saveUnitSystem(DISTANCE_UNIT_KEY, system);
}

export async function saveWeightUnit(system: UnitSystem): Promise<void> {
  await saveUnitSystem(WEIGHT_UNIT_KEY, system);
}
