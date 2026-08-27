import { ExerciseType, insertRecords } from 'react-native-health-connect';

import { writeWorkoutSessionToHealthConnect } from '@/health/health-connect-writer';
import type { WorkoutRecord } from '@/workout/workout-record';

jest.mock('react-native-health-connect');

const mockedInsertRecords = insertRecords as jest.MockedFunction<typeof insertRecords>;

function makeRecord(overrides: Partial<WorkoutRecord> = {}): WorkoutRecord {
  return {
    schemaVersion: 2,
    id: 'workout-1',
    startedAt: 1_000,
    samples: [
      { bpm: 120, timestamp: 1_000 },
      { bpm: 130, timestamp: 2_000 },
      { bpm: 140, timestamp: 3_000 },
    ],
    device: { id: 'device-1', name: 'Pulse HRM' },
    pauses: [],
    healthConnect: { status: 'notWritten', recordIds: [] },
    ...overrides,
  };
}

describe('writeWorkoutSessionToHealthConnect', () => {
  beforeEach(() => {
    mockedInsertRecords.mockReset();
  });

  // Health Connect rejects a batch mixing record types ("All records must
  // have the same type") on a real device — confirmed against the actual
  // native error, contrary to the library's docs. So this module issues two
  // insertRecords calls: one exercise-session-only call, then one
  // heart-rate-only call.
  it('calls insertRecords twice — once with the ExerciseSessionRecord, once with a HeartRateRecord whose samples map record.samples verbatim', async () => {
    mockedInsertRecords
      .mockResolvedValueOnce(['exercise-1'])
      .mockResolvedValueOnce(['heartrate-1']);
    const record = makeRecord();

    const result = await writeWorkoutSessionToHealthConnect(record);

    expect(mockedInsertRecords).toHaveBeenCalledTimes(2);

    const [exerciseCallRecords] = mockedInsertRecords.mock.calls[0];
    expect(exerciseCallRecords).toHaveLength(1);
    const [exerciseRecord] = exerciseCallRecords as [
      { recordType: string; exerciseType: number; startTime: string; endTime: string },
    ];
    expect(exerciseRecord.recordType).toBe('ExerciseSession');
    expect(exerciseRecord.exerciseType).toBe(ExerciseType.OTHER_WORKOUT);
    expect(exerciseRecord.startTime).toBe(new Date(1_000).toISOString());
    expect(exerciseRecord.endTime).toBe(new Date(3_000).toISOString());

    const [heartRateCallRecords] = mockedInsertRecords.mock.calls[1];
    expect(heartRateCallRecords).toHaveLength(1);
    const [heartRateRecord] = heartRateCallRecords as [
      { recordType: string; startTime: string; endTime: string; samples: unknown[] },
    ];
    expect(heartRateRecord.recordType).toBe('HeartRate');
    expect(heartRateRecord.startTime).toBe(new Date(1_000).toISOString());
    expect(heartRateRecord.endTime).toBe(new Date(3_000).toISOString());
    expect(heartRateRecord.samples).toEqual([
      { time: new Date(1_000).toISOString(), beatsPerMinute: 120 },
      { time: new Date(2_000).toISOString(), beatsPerMinute: 130 },
      { time: new Date(3_000).toISOString(), beatsPerMinute: 140 },
    ]);

    // Combined ids from both calls, exercise session first.
    expect(result).toEqual(['exercise-1', 'heartrate-1']);
  });

  it('chunks samples at 1000 per HeartRateRecord, combining to record.samples exactly, in the single heart-rate insertRecords call', async () => {
    mockedInsertRecords.mockResolvedValueOnce(['exercise-1']).mockResolvedValueOnce([]);
    const samples = Array.from({ length: 1_500 }, (_, i) => ({
      bpm: 100 + (i % 50),
      timestamp: i,
    }));
    const record = makeRecord({ startedAt: 0, samples });

    await writeWorkoutSessionToHealthConnect(record);

    expect(mockedInsertRecords).toHaveBeenCalledTimes(2);
    const [exerciseCallRecords] = mockedInsertRecords.mock.calls[0];
    expect(exerciseCallRecords).toHaveLength(1);

    const [heartRateCallRecords] = mockedInsertRecords.mock.calls[1];
    // 2 heart-rate chunks (1000 + 500), passed in one call.
    expect(heartRateCallRecords).toHaveLength(2);

    const heartRateRecords = heartRateCallRecords as Array<{ samples: unknown[] }>;
    expect(heartRateRecords[0].samples).toHaveLength(1000);
    expect(heartRateRecords[1].samples).toHaveLength(500);
    const combinedSampleCount = heartRateRecords.reduce((sum, r) => sum + r.samples.length, 0);
    expect(combinedSampleCount).toBe(samples.length);
  });

  it('does not throw and produces a non-zero-length interval for a one-sample session', async () => {
    mockedInsertRecords
      .mockResolvedValueOnce(['exercise-1'])
      .mockResolvedValueOnce(['heartrate-1']);
    const record = makeRecord({ startedAt: 5_000, samples: [{ bpm: 140, timestamp: 5_000 }] });

    await expect(writeWorkoutSessionToHealthConnect(record)).resolves.toEqual([
      'exercise-1',
      'heartrate-1',
    ]);

    const [exerciseCallRecords] = mockedInsertRecords.mock.calls[0];
    const [heartRateCallRecords] = mockedInsertRecords.mock.calls[1];
    const [exerciseRecord] = exerciseCallRecords as unknown as [
      { startTime: string; endTime: string },
    ];
    const [heartRateRecord] = heartRateCallRecords as unknown as [
      { startTime: string; endTime: string },
    ];
    expect(exerciseRecord.startTime).not.toBe(exerciseRecord.endTime);
    expect(heartRateRecord.startTime).not.toBe(heartRateRecord.endTime);
  });

  it('propagates a rejection from the exercise-session insertRecords call, without calling the heart-rate insertRecords call', async () => {
    mockedInsertRecords.mockRejectedValueOnce(new Error('write failed'));
    const record = makeRecord();

    await expect(writeWorkoutSessionToHealthConnect(record)).rejects.toThrow('write failed');
    expect(mockedInsertRecords).toHaveBeenCalledTimes(1);
  });

  it('propagates a rejection from the heart-rate insertRecords call after the exercise-session call already succeeded', async () => {
    mockedInsertRecords
      .mockResolvedValueOnce(['exercise-1'])
      .mockRejectedValueOnce(new Error('heart rate write failed'));
    const record = makeRecord();

    await expect(writeWorkoutSessionToHealthConnect(record)).rejects.toThrow(
      'heart rate write failed',
    );
    expect(mockedInsertRecords).toHaveBeenCalledTimes(2);
  });
});
