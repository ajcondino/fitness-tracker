import AsyncStorage from '@react-native-async-storage/async-storage';

import { ACTIVITY_TYPES } from '@/workout/workout-record';
import type { ActivityType } from '@/workout/workout-record';

/**
 * Framework-free storage module for the picker's last-used selection —
 * mirrors `units-store.ts`'s "one key per concern, not a JSON blob" choice
 * and `workout-store.ts`'s own `workout.*` key namespace. Unrelated to
 * `WorkoutRecord.activityType`: this only seeds a new session's picker, and
 * is never read or written by workout-store.ts or the migration runner.
 */

const LAST_ACTIVITY_TYPE_KEY = 'workout.lastActivityType';

const DEFAULT_ACTIVITY_TYPE: ActivityType = ACTIVITY_TYPES[0];

function isActivityType(value: unknown): value is ActivityType {
  return (ACTIVITY_TYPES as string[]).includes(value as string);
}

export async function loadLastActivityType(): Promise<ActivityType> {
  try {
    const raw = await AsyncStorage.getItem(LAST_ACTIVITY_TYPE_KEY);
    return isActivityType(raw) ? raw : DEFAULT_ACTIVITY_TYPE;
  } catch {
    return DEFAULT_ACTIVITY_TYPE;
  }
}

export async function saveLastActivityType(type: ActivityType): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_ACTIVITY_TYPE_KEY, type);
  } catch {
    // A failed write is not a user-facing failure — the next session just
    // falls back to the default picker selection.
  }
}
