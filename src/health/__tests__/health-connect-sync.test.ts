import {
  autoSyncWorkoutSessionToHealthConnect,
  syncWorkoutSessionToHealthConnect,
} from '@/health/health-connect-sync';
import { checkHealthConnectPermission } from '@/health/health-connect-client';
import { loadWriteBackEnabled } from '@/health/health-connect-store';
import { writeWorkoutSessionToHealthConnect } from '@/health/health-connect-writer';
import type { WorkoutRecord } from '@/workout/workout-record';
import { saveWorkoutSession } from '@/workout/workout-store';

jest.mock('@/health/health-connect-client');
jest.mock('@/health/health-connect-store');
jest.mock('@/health/health-connect-writer');
jest.mock('@/workout/workout-store');

const mockedCheckPermission = checkHealthConnectPermission as jest.MockedFunction<
  typeof checkHealthConnectPermission
>;
const mockedLoadWriteBackEnabled = loadWriteBackEnabled as jest.MockedFunction<
  typeof loadWriteBackEnabled
>;
const mockedWriteWorkoutSession = writeWorkoutSessionToHealthConnect as jest.MockedFunction<
  typeof writeWorkoutSessionToHealthConnect
>;
const mockedSaveWorkoutSession = saveWorkoutSession as jest.MockedFunction<
  typeof saveWorkoutSession
>;

function makeRecord(overrides: Partial<WorkoutRecord> = {}): WorkoutRecord {
  return {
    schemaVersion: 2,
    id: 'workout-1',
    startedAt: 1_000,
    samples: [{ bpm: 120, timestamp: 1_000 }],
    device: { id: 'device-1', name: 'Pulse HRM' },
    pauses: [],
    healthConnect: { status: 'notWritten', recordIds: [] },
    ...overrides,
  };
}

describe('syncWorkoutSessionToHealthConnect', () => {
  beforeEach(() => {
    mockedCheckPermission.mockReset();
    mockedWriteWorkoutSession.mockReset();
    mockedSaveWorkoutSession.mockReset().mockResolvedValue(undefined);
  });

  it('is a no-op that resolves the same record unchanged when already written', async () => {
    const record = makeRecord({ healthConnect: { status: 'written', recordIds: ['a'] } });

    const result = await syncWorkoutSessionToHealthConnect(record);

    expect(result).toEqual(record);
    expect(mockedCheckPermission).not.toHaveBeenCalled();
    expect(mockedWriteWorkoutSession).not.toHaveBeenCalled();
    expect(mockedSaveWorkoutSession).not.toHaveBeenCalled();
  });

  it('resolves failed and persists it, without writing, when permission is not granted', async () => {
    mockedCheckPermission.mockResolvedValue(false);
    const record = makeRecord();

    const result = await syncWorkoutSessionToHealthConnect(record);

    expect(result).toEqual({ ...record, healthConnect: { status: 'failed', recordIds: [] } });
    expect(mockedWriteWorkoutSession).not.toHaveBeenCalled();
    expect(mockedSaveWorkoutSession).toHaveBeenCalledWith(result);
  });

  it('treats a thrown permission check as not-permitted, resolving failed', async () => {
    mockedCheckPermission.mockRejectedValue(new Error('boom'));
    const record = makeRecord();

    const result = await syncWorkoutSessionToHealthConnect(record);

    expect(result.healthConnect).toEqual({ status: 'failed', recordIds: [] });
    expect(mockedWriteWorkoutSession).not.toHaveBeenCalled();
  });

  it('resolves written with the returned ids and persists it, on a successful write', async () => {
    mockedCheckPermission.mockResolvedValue(true);
    mockedWriteWorkoutSession.mockResolvedValue(['exercise-1', 'heartrate-1']);
    const record = makeRecord();

    const result = await syncWorkoutSessionToHealthConnect(record);

    expect(result).toEqual({
      ...record,
      healthConnect: { status: 'written', recordIds: ['exercise-1', 'heartrate-1'] },
    });
    expect(mockedSaveWorkoutSession).toHaveBeenCalledWith(result);
  });

  it('resolves failed and persists it, without rejecting, when the write throws', async () => {
    mockedCheckPermission.mockResolvedValue(true);
    mockedWriteWorkoutSession.mockRejectedValue(new Error('write failed'));
    const record = makeRecord();

    const result = await syncWorkoutSessionToHealthConnect(record);

    expect(result).toEqual({ ...record, healthConnect: { status: 'failed', recordIds: [] } });
    expect(mockedSaveWorkoutSession).toHaveBeenCalledWith(result);
  });
});

describe('autoSyncWorkoutSessionToHealthConnect', () => {
  beforeEach(() => {
    mockedCheckPermission.mockReset();
    mockedLoadWriteBackEnabled.mockReset();
    mockedWriteWorkoutSession.mockReset();
    mockedSaveWorkoutSession.mockReset().mockResolvedValue(undefined);
  });

  it('calls syncWorkoutSessionToHealthConnect (via a successful write) when write-back is enabled and permission is granted', async () => {
    mockedLoadWriteBackEnabled.mockResolvedValue(true);
    mockedCheckPermission.mockResolvedValue(true);
    mockedWriteWorkoutSession.mockResolvedValue(['exercise-1']);
    const record = makeRecord();

    await autoSyncWorkoutSessionToHealthConnect(record);

    expect(mockedWriteWorkoutSession).toHaveBeenCalledWith(record);
    expect(mockedSaveWorkoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ healthConnect: { status: 'written', recordIds: ['exercise-1'] } }),
    );
  });

  it('calls neither the write nor saveWorkoutSession when write-back is disabled', async () => {
    mockedLoadWriteBackEnabled.mockResolvedValue(false);
    mockedCheckPermission.mockResolvedValue(true);
    const record = makeRecord();

    await autoSyncWorkoutSessionToHealthConnect(record);

    expect(mockedWriteWorkoutSession).not.toHaveBeenCalled();
    expect(mockedSaveWorkoutSession).not.toHaveBeenCalled();
  });

  it('calls neither the write nor saveWorkoutSession when permission is not granted', async () => {
    mockedLoadWriteBackEnabled.mockResolvedValue(true);
    mockedCheckPermission.mockResolvedValue(false);
    const record = makeRecord();

    await autoSyncWorkoutSessionToHealthConnect(record);

    expect(mockedWriteWorkoutSession).not.toHaveBeenCalled();
    expect(mockedSaveWorkoutSession).not.toHaveBeenCalled();
  });

  it('never rejects, even when syncWorkoutSessionToHealthConnect itself throws', async () => {
    mockedLoadWriteBackEnabled.mockResolvedValue(true);
    mockedCheckPermission.mockRejectedValue(new Error('unexpected'));
    const record = makeRecord();

    await expect(autoSyncWorkoutSessionToHealthConnect(record)).resolves.toBeUndefined();
  });
});
