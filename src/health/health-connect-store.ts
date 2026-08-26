import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Framework-free storage module: no React/health-connect import — mirrors
 * `src/ble/saved-device.ts`'s exact shape. Two independent keys rather than
 * one JSON blob, so `declineCount` (an internal heuristic) stays
 * legible/inspectable separately from `writeBackEnabled` (the actual
 * user-facing setting a follow-up ticket will read). See SPEC.md's Data
 * Model.
 */

const WRITE_BACK_ENABLED_KEY = 'healthConnect.writeBackEnabled';
const DECLINE_COUNT_KEY = 'healthConnect.declineCount';

// All reads/writes are best-effort — any failure (storage unavailable,
// corrupt/legacy value) is caught and treated as the safe default, never
// thrown, matching saved-device.ts's "a stale/missing value must never
// block or confuse the normal path" rule.

export async function loadWriteBackEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(WRITE_BACK_ENABLED_KEY);
    // Missing key, or anything other than the two persisted string forms,
    // defaults to `true` — granting access is itself the opt-in (see
    // SPEC.md's Data Model).
    if (raw === 'false') {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

export async function saveWriteBackEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(WRITE_BACK_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {
    // A failed write is not a user-facing failure — matches saveDevice's
    // contract.
  }
}

export async function loadDeclineCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(DECLINE_COUNT_KEY);
    if (raw == null) {
      return 0;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return parsed;
  } catch {
    return 0;
  }
}

export async function recordDeclinedAttempt(): Promise<number> {
  const current = await loadDeclineCount();
  const next = current + 1;
  try {
    await AsyncStorage.setItem(DECLINE_COUNT_KEY, String(next));
  } catch {
    // Same best-effort contract as saveWriteBackEnabled — the caller's
    // in-memory state still advances for this session even if the
    // persisted count didn't (see SPEC.md's Constraints).
  }
  return next;
}

export async function clearDeclineCount(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DECLINE_COUNT_KEY);
  } catch {
    // Same best-effort contract as saveWriteBackEnabled.
  }
}
