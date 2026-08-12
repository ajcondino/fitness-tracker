import { usePairingStore } from '@/ble/pairing-store';

describe('usePairingStore', () => {
  beforeEach(() => {
    usePairingStore.getState().reset();
  });

  describe('adapterStateChanged', () => {
    it('sets adapter to poweredOn', () => {
      usePairingStore.getState().adapterStateChanged('poweredOn');
      expect(usePairingStore.getState().adapter).toBe('poweredOn');
    });

    it('transitions scan from scanning to idle when the adapter leaves poweredOn', () => {
      usePairingStore.getState().scanStarted(0);
      usePairingStore.getState().adapterStateChanged('poweredOff');

      expect(usePairingStore.getState().adapter).toBe('poweredOff');
      expect(usePairingStore.getState().scan.kind).toBe('idle');
    });

    it('does not touch an idle scan when the adapter leaves poweredOn', () => {
      usePairingStore.getState().adapterStateChanged('poweredOff');
      expect(usePairingStore.getState().scan).toEqual({ kind: 'idle' });
    });

    it('transitions connection from connecting to connectionFailed(adapterOff) when the adapter leaves poweredOn', () => {
      usePairingStore.getState().connectRequested('device-1', 0);
      usePairingStore.getState().adapterStateChanged('poweredOff');

      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connectionFailed',
        deviceId: 'device-1',
        reason: 'adapterOff',
      });
    });

    it('leaves a disconnected connection alone when the adapter leaves poweredOn', () => {
      usePairingStore.getState().adapterStateChanged('poweredOff');
      expect(usePairingStore.getState().connection).toEqual({ kind: 'disconnected' });
    });
  });

  describe('scan actions', () => {
    it('scanStarted sets scanning with the given startedAt', () => {
      usePairingStore.getState().scanStarted(123);
      expect(usePairingStore.getState().scan).toEqual({ kind: 'scanning', startedAt: 123 });
    });

    it('scanStopped sets idle', () => {
      usePairingStore.getState().scanStarted(0);
      usePairingStore.getState().scanStopped();
      expect(usePairingStore.getState().scan).toEqual({ kind: 'idle' });
    });

    it('scanTimedOut sets idle', () => {
      usePairingStore.getState().scanStarted(0);
      usePairingStore.getState().scanTimedOut();
      expect(usePairingStore.getState().scan).toEqual({ kind: 'idle' });
    });

    it('scanErrored sets scanError with the given reason', () => {
      usePairingStore.getState().scanErrored('startFailed');
      expect(usePairingStore.getState().scan).toEqual({ kind: 'scanError', reason: 'startFailed' });
    });
  });

  describe('setDevices', () => {
    it('replaces the devices array wholesale', () => {
      const devices = [
        {
          id: 'd1',
          name: 'A',
          lastKnownName: 'A',
          isConnectable: true,
          medianRssi: -50,
          firstSeenAt: 0,
          lastSeenAt: 0,
        },
      ];
      usePairingStore.getState().setDevices(devices);
      expect(usePairingStore.getState().devices).toBe(devices);
    });
  });

  describe('connect actions', () => {
    it('connectRequested sets connecting with deviceId and startedAt', () => {
      usePairingStore.getState().connectRequested('device-1', 42);
      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connecting',
        deviceId: 'device-1',
        startedAt: 42,
      });
    });

    it('connectSucceeded transitions connecting to connected for the matching deviceId', () => {
      usePairingStore.getState().connectRequested('device-1', 0);
      usePairingStore.getState().connectSucceeded('device-1');
      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connected',
        deviceId: 'device-1',
      });
    });

    it('connectSucceeded is a no-op for a stale deviceId', () => {
      usePairingStore.getState().connectRequested('device-1', 0);
      usePairingStore.getState().connectSucceeded('device-2');
      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connecting',
        deviceId: 'device-1',
        startedAt: 0,
      });
    });

    it('connectSucceeded is a no-op when not currently connecting', () => {
      usePairingStore.getState().connectSucceeded('device-1');
      expect(usePairingStore.getState().connection).toEqual({ kind: 'disconnected' });
    });

    it('connectSucceeded is a no-op for the same deviceId once that attempt already failed (e.g. timed out)', () => {
      usePairingStore.getState().connectRequested('device-1', 0);
      usePairingStore.getState().connectFailed('device-1', 'timeout');

      // The native promise resolves successfully after the timeout already
      // moved this attempt to connectionFailed — deviceId still matches, but
      // the attempt is no longer in flight, so this must not flip it back.
      usePairingStore.getState().connectSucceeded('device-1');

      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connectionFailed',
        deviceId: 'device-1',
        reason: 'timeout',
      });
    });

    it('connectSucceeded is a no-op for the same deviceId once already connected', () => {
      usePairingStore.getState().connectRequested('device-1', 0);
      usePairingStore.getState().connectSucceeded('device-1');

      // A second, redundant success signal for the same device.
      usePairingStore.getState().connectSucceeded('device-1');

      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connected',
        deviceId: 'device-1',
      });
    });

    it('connectFailed transitions connecting to connectionFailed with the given reason for the matching deviceId', () => {
      usePairingStore.getState().connectRequested('device-1', 0);
      usePairingStore.getState().connectFailed('device-1', 'timeout');
      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connectionFailed',
        deviceId: 'device-1',
        reason: 'timeout',
      });
    });

    it('connectFailed is a no-op for a stale deviceId', () => {
      usePairingStore.getState().connectRequested('device-1', 0);
      usePairingStore.getState().connectFailed('device-2', 'timeout');
      expect(usePairingStore.getState().connection.kind).toBe('connecting');
    });

    it('connectFailed is a no-op for the same deviceId once already connected', () => {
      usePairingStore.getState().connectRequested('device-1', 0);
      usePairingStore.getState().connectSucceeded('device-1');

      // A late rejection for an attempt that already succeeded.
      usePairingStore.getState().connectFailed('device-1', 'unknown');

      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connected',
        deviceId: 'device-1',
      });
    });

    it('connectCancelled transitions connecting to disconnected for the matching deviceId', () => {
      usePairingStore.getState().connectRequested('device-1', 0);
      usePairingStore.getState().connectCancelled('device-1');
      expect(usePairingStore.getState().connection).toEqual({ kind: 'disconnected' });
    });

    it('connectCancelled is a no-op for a stale deviceId', () => {
      usePairingStore.getState().connectRequested('device-1', 0);
      usePairingStore.getState().connectCancelled('device-2');
      expect(usePairingStore.getState().connection.kind).toBe('connecting');
    });

    it('connectCancelled is a no-op for the same deviceId once already connected', () => {
      usePairingStore.getState().connectRequested('device-1', 0);
      usePairingStore.getState().connectSucceeded('device-1');

      usePairingStore.getState().connectCancelled('device-1');

      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connected',
        deviceId: 'device-1',
      });
    });
  });

  describe('reset', () => {
    it('restores every field to its initial value', () => {
      usePairingStore.getState().adapterStateChanged('poweredOn');
      usePairingStore.getState().scanStarted(0);
      usePairingStore.getState().setDevices([
        {
          id: 'd1',
          name: 'A',
          lastKnownName: 'A',
          isConnectable: true,
          medianRssi: -50,
          firstSeenAt: 0,
          lastSeenAt: 0,
        },
      ]);
      usePairingStore.getState().connectRequested('d1', 0);

      usePairingStore.getState().reset();

      expect(usePairingStore.getState()).toMatchObject({
        adapter: 'unknown',
        scan: { kind: 'idle' },
        devices: [],
        connection: { kind: 'disconnected' },
      });
    });
  });
});
