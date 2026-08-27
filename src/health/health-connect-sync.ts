import { checkHealthConnectPermission } from '@/health/health-connect-client';
import { loadWriteBackEnabled } from '@/health/health-connect-store';
import { writeWorkoutSessionToHealthConnect } from '@/health/health-connect-writer';
import type { WorkoutRecord } from '@/workout/workout-record';
import { saveWorkoutSession } from '@/workout/workout-store';

/**
 * Framework-free (no React import). The single write-and-persist path both
 * the automatic and manual sync call sites share — see SPEC.md's Design
 * decision "one function, two call sites."
 *
 * Never throws — every internal failure is caught and turned into a
 * 'failed' status, not a rejected promise, matching this repo's "never let
 * a Health Connect failure surface as an unhandled rejection" posture.
 */
export async function syncWorkoutSessionToHealthConnect(
  record: WorkoutRecord,
): Promise<WorkoutRecord> {
  if (record.healthConnect.status === 'written') {
    // Terminal, idempotent — no Health Connect call, no persistence. See
    // SPEC.md's Sync model.
    return record;
  }

  let permitted: boolean;
  try {
    permitted = await checkHealthConnectPermission();
  } catch {
    // A thrown check must not skip the "not permitted" branch below.
    permitted = false;
  }

  if (!permitted) {
    const failed: WorkoutRecord = {
      ...record,
      healthConnect: { status: 'failed', recordIds: [] },
    };
    await saveWorkoutSession(failed);
    return failed;
  }

  try {
    const recordIds = await writeWorkoutSessionToHealthConnect(record);
    const written: WorkoutRecord = {
      ...record,
      healthConnect: { status: 'written', recordIds },
    };
    await saveWorkoutSession(written);
    return written;
  } catch {
    const failed: WorkoutRecord = {
      ...record,
      healthConnect: { status: 'failed', recordIds: [] },
    };
    await saveWorkoutSession(failed);
    return failed;
  }
}

/**
 * The automatic path's gate — see SPEC.md's Design decision. Does nothing
 * at all (not even a 'failed' write) unless both write-back is enabled and
 * permission is currently granted, which is what keeps "write-back off"/
 * "permission not currently granted" indistinguishable from "never
 * attempted" (notWritten).
 *
 * Never throws — its only caller invokes it fire-and-forget after a save
 * that has already succeeded.
 */
export async function autoSyncWorkoutSessionToHealthConnect(record: WorkoutRecord): Promise<void> {
  try {
    const [writeBackEnabled, permitted] = await Promise.all([
      loadWriteBackEnabled(),
      checkHealthConnectPermission(),
    ]);
    if (!writeBackEnabled || !permitted) {
      return;
    }
    await syncWorkoutSessionToHealthConnect(record);
  } catch {
    // This function's contract is "never throws," full stop.
  }
}
