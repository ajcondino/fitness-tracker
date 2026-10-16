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
import { saveWeightAndSync } from '@/health/weight-sync';
import {
  addWeightEntry,
  loadWeightEntries,
  updateWeightEntryHealthConnect,
} from '@/weight/weight-store';
import type { WeightEntry } from '@/weight/weight-store';

jest.mock('@/health/health-connect-client');
jest.mock('@/health/health-connect-store');
jest.mock('@/health/health-connect-writer');
jest.mock('@/weight/weight-store');

const m = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as unknown as jest.MockedFunction<T>;

const mAdd = m(addWeightEntry);
const mLoadEntries = m(loadWeightEntries);
const mUpdate = m(updateWeightEntryHealthConnect);
const mWriteBack = m(loadWriteBackEnabled);
const mAvailability = m(getHealthConnectAvailability);
const mScreenLock = m(hasScreenLock);
const mCheck = m(checkBodyWeightPermission);
const mRequest = m(requestBodyWeightPermission);
const mDeclineCount = m(loadDeclineCount);
const mRecordDecline = m(recordDeclinedAttempt);
const mWrite = m(writeWeightToHealthConnect);

const makeEntry = (
  id: string,
  recordedAt: number,
  status: WeightEntry['healthConnect']['status'] = 'notWritten',
): WeightEntry => ({
  id,
  recordedAt,
  kg: 70,
  healthConnect: { status, recordId: null },
});

describe('saveWeightAndSync', () => {
  const fresh = makeEntry('new', 3000);

  beforeEach(() => {
    jest.resetAllMocks();
    mAdd.mockResolvedValue(fresh);
    mLoadEntries.mockResolvedValue([fresh]);
    mUpdate.mockResolvedValue();
    mWriteBack.mockResolvedValue(true);
    mAvailability.mockResolvedValue('available');
    mScreenLock.mockResolvedValue(true);
    mCheck.mockResolvedValue(true);
    mDeclineCount.mockResolvedValue(0);
    mRecordDecline.mockResolvedValue(1);
    mWrite.mockResolvedValue('hc-1');
  });

  it('saves locally and writes when everything is permitted', async () => {
    const result = await saveWeightAndSync(70);

    expect(mAdd).toHaveBeenCalledWith(70);
    expect(result).toEqual({ entry: fresh, outcome: { status: 'written' } });
    expect(mUpdate).toHaveBeenCalledWith('new', { status: 'written', recordId: 'hc-1' });
    expect(mRequest).not.toHaveBeenCalled();
  });

  it('skips with writeBackOff before touching Health Connect', async () => {
    mWriteBack.mockResolvedValue(false);
    const { outcome } = await saveWeightAndSync(70);
    expect(outcome).toEqual({ status: 'skipped', reason: 'writeBackOff' });
    expect(mAdd).toHaveBeenCalled();
    expect(mWrite).not.toHaveBeenCalled();
    expect(mAvailability).not.toHaveBeenCalled();
  });

  it('skips with unavailable', async () => {
    mAvailability.mockResolvedValue('unavailable');
    expect((await saveWeightAndSync(70)).outcome).toEqual({
      status: 'skipped',
      reason: 'unavailable',
    });
    expect(mWrite).not.toHaveBeenCalled();
  });

  it('skips with noScreenLock and never requests', async () => {
    mScreenLock.mockResolvedValue(false);
    expect((await saveWeightAndSync(70)).outcome).toEqual({
      status: 'skipped',
      reason: 'noScreenLock',
    });
    expect(mRequest).not.toHaveBeenCalled();
  });

  it('never requests permission when the decline count is >= 2', async () => {
    mCheck.mockResolvedValue(false);
    mDeclineCount.mockResolvedValue(2);
    expect((await saveWeightAndSync(70)).outcome).toEqual({
      status: 'skipped',
      reason: 'permissionExhausted',
    });
    expect(mRequest).not.toHaveBeenCalled();
    expect(mRecordDecline).not.toHaveBeenCalled();
  });

  it('requests once when missing, then writes on grant', async () => {
    mCheck.mockResolvedValue(false);
    mRequest.mockResolvedValue(true);
    expect((await saveWeightAndSync(70)).outcome).toEqual({ status: 'written' });
    expect(mRequest).toHaveBeenCalledTimes(1);
    expect(mRecordDecline).not.toHaveBeenCalled();
  });

  it('records a shared decline and skips with denied', async () => {
    mCheck.mockResolvedValue(false);
    mRequest.mockResolvedValue(false);
    expect((await saveWeightAndSync(70)).outcome).toEqual({ status: 'skipped', reason: 'denied' });
    expect(mRequest).toHaveBeenCalledTimes(1);
    expect(mRecordDecline).toHaveBeenCalledTimes(1);
    expect(mWrite).not.toHaveBeenCalled();
  });

  it('backfills earlier non-written entries oldest first', async () => {
    const old1 = makeEntry('old1', 1000, 'failed');
    const old2 = makeEntry('old2', 2000, 'notWritten');
    const done = makeEntry('done', 500, 'written');
    mLoadEntries.mockResolvedValue([done, old1, old2, fresh]);

    await saveWeightAndSync(70);

    expect(mWrite.mock.calls.map(([e]) => e.id)).toEqual(['old1', 'old2', 'new']);
  });

  it('marks a failed new entry failed and reports error', async () => {
    mWrite.mockRejectedValue(new Error('boom'));
    const { outcome } = await saveWeightAndSync(70);
    expect(outcome).toEqual({ status: 'skipped', reason: 'error' });
    expect(mUpdate).toHaveBeenCalledWith('new', { status: 'failed', recordId: null });
  });

  it('a failed backfill does not turn a successful new write into an error', async () => {
    const old = makeEntry('old', 1000, 'failed');
    mLoadEntries.mockResolvedValue([old, fresh]);
    mWrite.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('hc-2');

    const { outcome } = await saveWeightAndSync(70);

    expect(outcome).toEqual({ status: 'written' });
    expect(mUpdate).toHaveBeenCalledWith('old', { status: 'failed', recordId: null });
    expect(mUpdate).toHaveBeenCalledWith('new', { status: 'written', recordId: 'hc-2' });
  });

  it('never throws when a Health Connect call rejects; the local save still happened', async () => {
    mCheck.mockRejectedValue(new Error('native'));
    const result = await saveWeightAndSync(70);
    expect(result.entry).toBe(fresh);
    expect(result.outcome).toEqual({ status: 'skipped', reason: 'error' });
  });
});
