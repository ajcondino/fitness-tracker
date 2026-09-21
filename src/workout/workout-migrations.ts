/**
 * Framework-free (no BLE/Zustand/React/AsyncStorage import): the versioned
 * migration runner, mirroring `workout-record.ts`'s own "pure derivations
 * only" layer. See SPEC.md's Data Model.
 */

// A record shape from any past schemaVersion, before migration — every
// field the runner itself touches is typed; anything else passes through
// via the index signature untouched.
export type LegacyWorkoutRecord = Record<string, unknown> & { schemaVersion: number };

type MigrationStep = (record: Record<string, unknown>) => Record<string, unknown>;

// Keyed by the version a record is upgrading FROM. Each step both adds the
// field(s) introduced at the NEXT version (defaulted, for a record that
// predates them) and advances schemaVersion to that next version. Adding a
// field in a future ticket means: bump WORKOUT_RECORD_SCHEMA_VERSION and add
// one new entry here, keyed by the version that was CURRENT immediately
// before this one — migrateWorkoutRecord's own loop below never changes.
const MIGRATIONS: Record<number, MigrationStep> = {
  // 1 -> 2: health-connect-workout-sync added `healthConnect`. Formalizes
  // the lenient default `parseHealthConnectWriteInfo` already applied ad
  // hoc in workout-store.ts prior to this ticket.
  1: (record) => ({
    ...record,
    healthConnect: record.healthConnect ?? { status: 'notWritten', recordIds: [] },
    schemaVersion: 2,
  }),
  // 2 -> 3: this ticket adds `source`. Every session saved before this
  // ticket existed was, definitionally, locally recorded — the import epic
  // this field anticipates doesn't exist yet, so 'recorded' is not a guess,
  // it's the only value that could ever be true of a pre-existing record.
  2: (record) => ({
    ...record,
    source: record.source ?? 'recorded',
    schemaVersion: 3,
  }),
};

export function migrateWorkoutRecord(record: LegacyWorkoutRecord): Record<string, unknown> {
  let current: Record<string, unknown> = record;
  while (typeof current.schemaVersion === 'number' && MIGRATIONS[current.schemaVersion]) {
    current = MIGRATIONS[current.schemaVersion](current);
  }
  return current;
}
