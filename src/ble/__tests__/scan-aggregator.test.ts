import type { RawScanSample } from '@/ble/pairing-types';
import { createScanAggregator } from '@/ble/scan-aggregator';

function sample(overrides: Partial<RawScanSample> = {}): RawScanSample {
  return {
    id: 'device-1',
    name: 'My Device',
    isConnectable: true,
    rssi: -60,
    seenAt: 0,
    ...overrides,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

describe('createScanAggregator', () => {
  it('drops a non-connectable sample for a previously-untracked id', () => {
    const aggregator = createScanAggregator();

    aggregator.ingest(sample({ isConnectable: false }));

    expect(aggregator.getSettledDevices()).toEqual([]);
  });

  it('tracks the same id once it later arrives connectable', () => {
    const aggregator = createScanAggregator();

    aggregator.ingest(sample({ isConnectable: false }));
    aggregator.ingest(sample({ isConnectable: true }));

    expect(aggregator.getSettledDevices()).toHaveLength(1);
  });

  it('keeps applying updates after a tracked device later arrives non-connectable', () => {
    const aggregator = createScanAggregator();

    aggregator.ingest(sample({ isConnectable: true, rssi: -50 }));
    aggregator.ingest(sample({ isConnectable: false, rssi: -55 }));

    const [device] = aggregator.getSettledDevices();
    expect(device.medianRssi).toBe(median([-50, -55]));
  });

  it('never produces two entries for two ingest() calls of the same id (duplicate advertisement + scan-response)', () => {
    const aggregator = createScanAggregator();

    aggregator.ingest(sample({ seenAt: 0 }));
    aggregator.ingest(sample({ seenAt: 5 }));

    expect(aggregator.getSettledDevices()).toHaveLength(1);
  });

  it('computes a true rolling median (not a mean) over at most RSSI_WINDOW_SIZE samples', () => {
    const aggregator = createScanAggregator();
    // RSSI_WINDOW_SIZE is 5. Feed 7 samples; only the last 5 should count.
    const rssiValues = [-40, -90, -50, -80, -30, -70, -65];
    rssiValues.forEach((rssi, index) => {
      aggregator.ingest(sample({ rssi, seenAt: index }));
    });

    const lastFive = rssiValues.slice(-5);
    const [device] = aggregator.getSettledDevices();
    expect(device.medianRssi).toBe(median(lastFive));

    // Sanity: this fixture's median must differ from its mean, or the test
    // wouldn't actually distinguish "median" from "mean".
    const mean = lastFive.reduce((sum, value) => sum + value, 0) / lastFive.length;
    expect(median(lastFive)).not.toBe(mean);
  });

  it('keeps lastKnownName sticky when a later sample carries a null name, and keeps the device present', () => {
    const aggregator = createScanAggregator();

    aggregator.ingest(sample({ name: 'Sticky Name' }));
    aggregator.ingest(sample({ name: null }));

    const [device] = aggregator.getSettledDevices();
    expect(device.name).toBeNull();
    expect(device.lastKnownName).toBe('Sticky Name');
  });

  it('does not sort — sorting is selectSortedDevices’ job', () => {
    const aggregator = createScanAggregator();

    aggregator.ingest(sample({ id: 'far', rssi: -90 }));
    aggregator.ingest(sample({ id: 'near', rssi: -40 }));

    expect(aggregator.getSettledDevices().map((d) => d.id)).toEqual(['far', 'near']);
  });
});
