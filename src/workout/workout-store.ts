import AsyncStorage from '@react-native-async-storage/async-storage';

import type { HealthConnectWriteInfo, WorkoutRecord } from '@/workout/workout-record';

/**
 * Framework-free storage module: no BLE, Zustand, or React import — mirrors
 * `saved-device.ts`'s established convention, applied to a list instead of
 * a single value (see SPEC.md's Style & Conventions).
 *
 * One `AsyncStorage` key per session record, plus one small index key
 * holding only ids, not a single ever-growing array of full records — see
 * SPEC.md's Interfaces/API for the full one-key-per-session trade-off.
 */

const SESSION_INDEX_KEY = 'workout.sessionIndex';
const sessionKey = (id: string) => `workout.session.${id}`;

async function readSessionIndex(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_INDEX_KEY);
    if (raw == null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

// Lenient — unlike every other field parseWorkoutRecord validates, a
// missing or malformed healthConnect value never invalidates the whole
// record. See SPEC.md's Design decision: this field is metadata about the
// record, not part of what makes the session real. Never throws, matching
// every other private parse helper in this file.
function parseHealthConnectWriteInfo(raw: unknown): HealthConnectWriteInfo {
  const fallback: HealthConnectWriteInfo = { status: 'notWritten', recordIds: [] };
  if (typeof raw !== 'object' || raw === null) {
    return fallback;
  }
  const { status, recordIds } = raw as Record<string, unknown>;
  const validStatus =
    status === 'notWritten' || status === 'written' || status === 'failed'
      ? status
      : fallback.status;
  const validRecordIds = Array.isArray(recordIds)
    ? recordIds.filter((entry): entry is string => typeof entry === 'string')
    : fallback.recordIds;
  return { status: validStatus, recordIds: validRecordIds };
}

function parseWorkoutRecord(raw: string | null): WorkoutRecord | null {
  if (raw == null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const { schemaVersion, id, startedAt, samples, device, pauses, healthConnect } =
      parsed as Record<string, unknown>;
    if (
      typeof schemaVersion !== 'number' ||
      typeof id !== 'string' ||
      typeof startedAt !== 'number' ||
      !Array.isArray(samples) ||
      !Array.isArray(pauses) ||
      typeof device !== 'object' ||
      device === null ||
      typeof (device as Record<string, unknown>).id !== 'string'
    ) {
      return null;
    }
    return {
      ...parsed,
      healthConnect: parseHealthConnectWriteInfo(healthConnect),
    } as WorkoutRecord;
  } catch {
    return null;
  }
}

// All reads/writes are best-effort — any failure (storage unavailable,
// corrupt/legacy JSON) is caught and treated as "nothing saved"/"skip this
// entry," never thrown, per saved-device.ts's "a stale/failed save must
// never block or confuse the normal path."

export async function saveWorkoutSession(record: WorkoutRecord): Promise<void> {
  try {
    await AsyncStorage.setItem(sessionKey(record.id), JSON.stringify(record));
    const ids = await readSessionIndex();
    const nextIds = [record.id, ...ids.filter((existing) => existing !== record.id)];
    await AsyncStorage.setItem(SESSION_INDEX_KEY, JSON.stringify(nextIds));
  } catch {
    // A failed write just means this session doesn't show up later — not a
    // user-facing failure.
  }
}

export async function loadWorkoutSession(id: string): Promise<WorkoutRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(sessionKey(id));
    return parseWorkoutRecord(raw);
  } catch {
    return null;
  }
}

export async function loadWorkoutSessions(): Promise<WorkoutRecord[]> {
  try {
    const ids = await readSessionIndex();
    if (ids.length === 0) {
      return [];
    }

    const entries = await AsyncStorage.multiGet(ids.map(sessionKey));
    const records: WorkoutRecord[] = [];
    for (const [, value] of entries) {
      const record = parseWorkoutRecord(value);
      if (record != null) {
        records.push(record);
      }
    }
    return records;
  } catch {
    return [];
  }
}
