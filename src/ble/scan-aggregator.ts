import type { DiscoveredDevice, RawScanSample } from '@/ble/pairing-types';
import { RSSI_WINDOW_SIZE } from '@/ble/pairing-types';

type TrackedDevice = {
  id: string;
  name: string | null;
  lastKnownName: string | null;
  isConnectable: boolean;
  rssiWindow: number[];
  firstSeenAt: number;
  lastSeenAt: number;
};

export type ScanAggregator = {
  ingest(sample: RawScanSample): void;
  getSettledDevices(): DiscoveredDevice[];
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Plain, stateful, I/O-free dedupe + rolling-median + connectable-filter
 * layer that sits between raw scan callbacks (~8/sec/device) and the store.
 * Never imports `bleManager` or `usePairingStore`.
 */
export function createScanAggregator(): ScanAggregator {
  const tracked = new Map<string, TrackedDevice>();

  return {
    ingest(sample: RawScanSample): void {
      const existing = tracked.get(sample.id);

      if (!existing && !sample.isConnectable) {
        // Never tracked, and this sample isn't connectable — drop it.
        return;
      }

      if (!existing) {
        tracked.set(sample.id, {
          id: sample.id,
          name: sample.name,
          lastKnownName: sample.name,
          isConnectable: sample.isConnectable,
          rssiWindow: [sample.rssi],
          firstSeenAt: sample.seenAt,
          lastSeenAt: sample.seenAt,
        });
        return;
      }

      const rssiWindow = [...existing.rssiWindow, sample.rssi];
      if (rssiWindow.length > RSSI_WINDOW_SIZE) {
        rssiWindow.shift();
      }

      tracked.set(sample.id, {
        ...existing,
        name: sample.name,
        lastKnownName: sample.name ?? existing.lastKnownName,
        isConnectable: sample.isConnectable,
        rssiWindow,
        lastSeenAt: sample.seenAt,
      });
    },

    getSettledDevices(): DiscoveredDevice[] {
      return Array.from(tracked.values()).map((device) => ({
        id: device.id,
        name: device.name,
        lastKnownName: device.lastKnownName,
        isConnectable: device.isConnectable,
        medianRssi: median(device.rssiWindow),
        firstSeenAt: device.firstSeenAt,
        lastSeenAt: device.lastSeenAt,
      }));
    },
  };
}
