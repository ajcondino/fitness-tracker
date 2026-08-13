import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Framework-free storage module: no BLE, Zustand, or React import — mirrors
 * `pairing-types.ts`'s "framework-free" boundary but for storage instead of
 * BLE types. Called only from `use-device-pairing.ts`; storage stays out of
 * `usePairingStore` (see SPEC.md's Style & Conventions).
 */

const STORAGE_KEY = 'ble.savedDevice';

export type SavedDevice = {
  id: string;
  // The resolved display name at the moment this device was last connected,
  // or null if neither the native Device nor its localName had one at that
  // moment. Never a translated placeholder string — "Unknown device" is UI
  // copy, not data, and copy must not get baked into a persisted value that
  // outlives the locale it was written under. Screens re-derive the
  // fallback label at render time (mirrors `selectDeviceDisplayName`).
  name: string | null;
};

// All reads/writes are best-effort — any failure (storage unavailable,
// corrupt/legacy JSON) is caught and treated as "nothing saved," never
// thrown, per the ticket's "a stale saved device must never block or
// confuse the normal path."

export async function loadSavedDevice(): Promise<SavedDevice | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw == null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const { id, name } = parsed as Record<string, unknown>;
    if (typeof id !== 'string') {
      return null;
    }
    return { id, name: typeof name === 'string' ? name : null };
  } catch {
    return null;
  }
}

export async function saveDevice(device: SavedDevice): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(device));
  } catch {
    // A failed write just means no auto-reconnect next launch — not a
    // user-facing failure.
  }
}

export async function clearSavedDevice(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same best-effort contract as saveDevice.
  }
}
