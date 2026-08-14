import { useEffect, useRef, useState } from 'react';
import type { Subscription } from 'react-native-ble-plx';

import { bleManager } from '@/ble/manager';
import {
  HEART_RATE_MEASUREMENT_UUID,
  HEART_RATE_SERVICE_UUID,
  HR_STALE_CHECK_INTERVAL_MS,
  HR_STALE_THRESHOLD_MS,
  parseHeartRateMeasurement,
} from '@/ble/heart-rate';

export type LiveHeartRateStatus = 'awaitingFirstReading' | 'live' | 'stale';

/**
 * The only I/O layer this ticket adds: discovers + monitors the Heart Rate
 * Measurement characteristic for a given device id, tracks time since the
 * last valid reading, and derives a staleness status from elapsed time
 * alone — never from `usePairingStore`'s `connection.kind` or a disconnect
 * event (see SPEC.md's Style & Conventions). Deliberately takes a plain
 * `deviceId` rather than reading the store itself, mirroring
 * `pairing-store.ts`'s "BLE side effects stay out of the store" separation.
 *
 * Always called unconditionally (rules of hooks) — `deviceId` is the gate.
 * When `deviceId` is `null`, this is a no-op for the life of that render.
 *
 * `isConnected` gates the same effect: a drop that flips it to `false` tears
 * the subscription down (guard makes the re-run a no-op), and a later
 * reconnect flipping it back to `true` re-runs discovery + monitor against
 * the new native connection — this is what resumes BPM after
 * auto-reconnect-after-drop without a remount.
 */
export function useLiveHeartRate(
  deviceId: string | null,
  isConnected: boolean,
): {
  bpm: number | null;
  status: LiveHeartRateStatus;
} {
  const [bpm, setBpm] = useState<number | null>(null);
  const [isStale, setIsStale] = useState(false);
  const lastReadingAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (deviceId == null || !isConnected) return;

    let cancelled = false;
    let subscription: Subscription | null = null;

    bleManager.discoverAllServicesAndCharacteristicsForDevice(deviceId).then(
      () => {
        if (cancelled) return;
        subscription = bleManager.monitorCharacteristicForDevice(
          deviceId,
          HEART_RATE_SERVICE_UUID,
          HEART_RATE_MEASUREMENT_UUID,
          (error, characteristic) => {
            if (error != null) {
              // Swallowed — the same "expected native race, not a bug to
              // surface" treatment use-device-pairing.ts gives
              // BleErrorCode.BluetoothPoweredOff.
              return;
            }
            const value = parseHeartRateMeasurement(characteristic?.value);
            if (value != null) {
              lastReadingAtRef.current = Date.now();
              setIsStale(false);
              setBpm(value);
            }
          },
        );
      },
      () => {
        // Discovery rejected (e.g. the device dropped before it finished) —
        // swallowed, no retry. The screen simply stays at
        // 'awaitingFirstReading' with no HR pipeline established.
      },
    );

    const intervalId = setInterval(() => {
      if (lastReadingAtRef.current == null) return;
      if (Date.now() - lastReadingAtRef.current > HR_STALE_THRESHOLD_MS) {
        setIsStale(true);
      }
    }, HR_STALE_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      subscription?.remove();
    };
  }, [deviceId, isConnected]);

  const status: LiveHeartRateStatus =
    bpm === null ? 'awaitingFirstReading' : isStale ? 'stale' : 'live';

  return { bpm, status };
}
