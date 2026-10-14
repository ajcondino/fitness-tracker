import {
  checkBodyWeightPermission,
  getHealthConnectAvailability,
  hasScreenLock,
  requestBodyWeightPermission,
} from '@/health/health-connect-client';
import {
  loadDeclineCount,
  loadWriteBackEnabled,
  recordDeclinedAttempt,
} from '@/health/health-connect-store';
import { writeWeightToHealthConnect } from '@/health/health-connect-writer';
import {
  addWeightEntry,
  loadWeightEntries,
  updateWeightEntryHealthConnect,
} from '@/weight/weight-store';
import type { WeightEntry } from '@/weight/weight-store';

/**
 * Framework-free (no React import). See
 * docs/specs/weight-capture-health-connect/SPEC.md's Interfaces/API.
 */

// Mirrors DECLINE_COUNT_EXHAUSTED_THRESHOLD in use-health-connect-settings.ts.
const DECLINE_COUNT_EXHAUSTED_THRESHOLD = 2;

export type WeightSyncOutcome =
  | { status: 'written' }
  | {
      status: 'skipped';
      reason:
        | 'writeBackOff'
        | 'unavailable'
        | 'noScreenLock'
        | 'permissionExhausted'
        | 'denied'
        | 'error';
    };

const skipped = (reason: Extract<WeightSyncOutcome, { status: 'skipped' }>['reason']) =>
  ({ status: 'skipped', reason }) as const;

// Resolves the gate chain to either `null` (clear to write) or a skip.
async function gate(): Promise<WeightSyncOutcome | null> {
  if (!(await loadWriteBackEnabled())) return skipped('writeBackOff');
  if ((await getHealthConnectAvailability()) === 'unavailable') return skipped('unavailable');
  if (!(await hasScreenLock())) return skipped('noScreenLock');

  if (await checkBodyWeightPermission()) return null;
  // Never prompts when locked out.
  if ((await loadDeclineCount()) >= DECLINE_COUNT_EXHAUSTED_THRESHOLD) {
    return skipped('permissionExhausted');
  }
  // The person just deliberately saved a weight, so one request is fair.
  if (await requestBodyWeightPermission()) return null;
  // Shared counter — the lockout is app-level, not per record type.
  await recordDeclinedAttempt();
  return skipped('denied');
}

/**
 * Saves locally first (unconditional), then writes to Health Connect when
 * gates allow, backfilling earlier non-written entries oldest first.
 * Never throws — every failure becomes an outcome.
 */
export async function saveWeightAndSync(
  kg: number,
): Promise<{ entry: WeightEntry; outcome: WeightSyncOutcome }> {
  const entry = await addWeightEntry(kg);

  let outcome: WeightSyncOutcome;
  try {
    const blocked = await gate();
    if (blocked) {
      outcome = blocked;
    } else {
      outcome = await writePending(entry);
    }
  } catch {
    outcome = skipped('error');
  }
  return { entry, outcome };
}

async function writePending(newEntry: WeightEntry): Promise<WeightSyncOutcome> {
  const stored = await loadWeightEntries();
  // The store may have failed to persist the new entry; still try it.
  const pending = (
    stored.some((e) => e.id === newEntry.id) ? stored : [...stored, newEntry]
  ).filter((e) => e.healthConnect.status !== 'written');

  let outcome: WeightSyncOutcome = { status: 'written' };
  for (const item of pending) {
    try {
      const recordId = await writeWeightToHealthConnect(item);
      await updateWeightEntryHealthConnect(item.id, { status: 'written', recordId });
    } catch {
      await updateWeightEntryHealthConnect(item.id, { status: 'failed', recordId: null });
      if (item.id === newEntry.id) outcome = skipped('error');
    }
  }
  return outcome;
}
