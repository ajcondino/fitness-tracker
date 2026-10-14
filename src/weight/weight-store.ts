import AsyncStorage from '@react-native-async-storage/async-storage';

import type { HealthConnectWriteStatus } from '@/workout/workout-record';

/**
 * Framework-free storage module (no React import) — mirrors
 * `health-connect-store.ts`: best-effort reads/writes, corrupt data falls
 * back to a safe default, never throws. See
 * docs/specs/weight-capture-health-connect/SPEC.md's Data Model.
 */

// A decision, not a platform limit — guards typos like `7` or `700`.
export const MIN_WEIGHT_KG = 20;
export const MAX_WEIGHT_KG = 500;

const ENTRIES_KEY = 'weight.entries';
const PROMPT_DISMISSED_KEY = 'weight.promptDismissed';

export type WeightEntry = {
  id: string;
  /** Epoch ms, set when saved; also the Health Connect `time`. */
  recordedAt: number;
  /** Canonical kilograms at full precision, regardless of display unit. */
  kg: number;
  healthConnect: { status: HealthConnectWriteStatus; recordId: string | null };
};

const STATUSES: readonly string[] = ['notWritten', 'written', 'failed'];

function isValidKg(kg: unknown): kg is number {
  return typeof kg === 'number' && Number.isFinite(kg) && kg > 0;
}

// Per-element: one bad entry is dropped rather than discarding the array.
function parseEntry(raw: unknown): WeightEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { id, recordedAt, kg, healthConnect } = raw as Record<string, unknown>;
  if (typeof id !== 'string' || !isValidKg(kg)) return null;
  if (typeof recordedAt !== 'number' || !Number.isFinite(recordedAt)) return null;
  if (typeof healthConnect !== 'object' || healthConnect === null) return null;
  const { status, recordId } = healthConnect as Record<string, unknown>;
  if (typeof status !== 'string' || !STATUSES.includes(status)) return null;
  return {
    id,
    recordedAt,
    kg,
    healthConnect: {
      status: status as HealthConnectWriteStatus,
      recordId: typeof recordId === 'string' ? recordId : null,
    },
  };
}

async function readEntries(): Promise<WeightEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(ENTRIES_KEY);
    if (raw == null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseEntry).filter((entry): entry is WeightEntry => entry !== null);
  } catch {
    return [];
  }
}

async function writeEntries(entries: WeightEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
  } catch {
    // Best-effort, matching the other stores.
  }
}

/** Sorted ascending by `recordedAt`; ties keep stored (insertion) order. */
export async function loadWeightEntries(): Promise<WeightEntry[]> {
  const entries = await readEntries();
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.recordedAt - b.entry.recordedAt || a.index - b.index)
    .map(({ entry }) => entry);
}

/** The single read path for downstream consumers (calorie calculation). */
export async function getLatestWeightKg(): Promise<number | null> {
  const entries = await loadWeightEntries();
  return entries.length === 0 ? null : entries[entries.length - 1].kg;
}

/**
 * Appends a new entry — never mutates an old one. Throws `RangeError` for an
 * out-of-range/non-finite `kg` (a programmer error; the UI validates first).
 * A failed storage write is swallowed, but the entry is still returned.
 */
export async function addWeightEntry(
  kg: number,
  recordedAt: number = Date.now(),
): Promise<WeightEntry> {
  if (!Number.isFinite(kg) || kg < MIN_WEIGHT_KG || kg > MAX_WEIGHT_KG) {
    throw new RangeError(`Weight must be between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg`);
  }
  const entry: WeightEntry = {
    id: `${recordedAt}-${Math.random().toString(36).slice(2, 10)}`,
    recordedAt,
    kg,
    healthConnect: { status: 'notWritten', recordId: null },
  };
  const entries = await readEntries();
  await writeEntries([...entries, entry]);
  return entry;
}

export async function updateWeightEntryHealthConnect(
  id: string,
  info: WeightEntry['healthConnect'],
): Promise<void> {
  const entries = await readEntries();
  await writeEntries(
    entries.map((entry) => (entry.id === id ? { ...entry, healthConnect: info } : entry)),
  );
}

export async function loadWeightPromptDismissed(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PROMPT_DISMISSED_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function saveWeightPromptDismissed(): Promise<void> {
  try {
    await AsyncStorage.setItem(PROMPT_DISMISSED_KEY, 'true');
  } catch {
    // Best-effort.
  }
}
