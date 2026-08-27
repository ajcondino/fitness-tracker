import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';

import LiveWorkout from '@/app/live-workout';
import { bleManager } from '@/ble/manager';
import { usePairingStore } from '@/ble/pairing-store';
import type { DiscoveredDevice } from '@/ble/pairing-types';
import { spacing } from '@/constants/theme';
import { autoSyncWorkoutSessionToHealthConnect } from '@/health/health-connect-sync';
import { useLiveHeartRate } from '@/hooks/use-live-heart-rate';
import { useWorkoutSession } from '@/hooks/use-workout-session';
import type { WorkoutSessionSnapshot } from '@/hooks/use-workout-session';
import * as workoutRecord from '@/workout/workout-record';
import { WORKOUT_RECORD_SCHEMA_VERSION } from '@/workout/workout-record';
import { saveWorkoutSession } from '@/workout/workout-store';

const LIVE_TRACE_BUCKET_COUNT = 36; // mirrors live-workout.tsx's own private constant

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useNavigation: jest.fn(),
}));
// No <SafeAreaProvider> in this test tree — mocked with a representative
// bottom inset (e.g. an iPhone home-indicator gesture bar) rather than the
// zeros a missing provider would otherwise throw for.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));
jest.mock('@/hooks/use-live-heart-rate');
jest.mock('@/hooks/use-workout-session');
jest.mock('@/workout/workout-store');
jest.mock('@/health/health-connect-sync');

const mockedUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockedUseNavigation = useNavigation as jest.MockedFunction<typeof useNavigation>;
const mockedUseLiveHeartRate = useLiveHeartRate as jest.MockedFunction<typeof useLiveHeartRate>;
const mockedUseWorkoutSession = useWorkoutSession as jest.MockedFunction<typeof useWorkoutSession>;
const mockedCancelDeviceConnection = jest.mocked(bleManager.cancelDeviceConnection);
const mockedSaveWorkoutSession = saveWorkoutSession as jest.MockedFunction<
  typeof saveWorkoutSession
>;
const mockedAutoSyncWorkoutSession = autoSyncWorkoutSessionToHealthConnect as jest.MockedFunction<
  typeof autoSyncWorkoutSessionToHealthConnect
>;

// Captures whatever listener LiveWorkout registers for 'beforeRemove', so
// tests can simulate a back gesture/hardware back press by invoking it
// directly — mirroring how React Navigation itself would call it.
type BeforeRemoveEvent = { preventDefault: () => void };
let beforeRemoveListener: ((e: BeforeRemoveEvent) => void) | undefined;

function makeDevice(overrides: Partial<DiscoveredDevice> = {}): DiscoveredDevice {
  return {
    id: 'device-1',
    name: 'Pulse HRM',
    lastKnownName: 'Pulse HRM',
    isConnectable: true,
    medianRssi: -55,
    firstSeenAt: 0,
    lastSeenAt: 0,
    ...overrides,
  };
}

describe('<LiveWorkout />', () => {
  const back = jest.fn();

  beforeEach(() => {
    back.mockClear();
    mockedUseRouter.mockReturnValue({ back } as unknown as ReturnType<typeof useRouter>);
    beforeRemoveListener = undefined;
    mockedUseNavigation.mockReset().mockReturnValue({
      addListener: jest.fn((event: string, listener: (e: BeforeRemoveEvent) => void) => {
        if (event === 'beforeRemove') beforeRemoveListener = listener;
        return jest.fn();
      }),
    } as unknown as ReturnType<typeof useNavigation>);
    mockedCancelDeviceConnection.mockReset().mockResolvedValue({} as never);
    usePairingStore.getState().reset();
    mockedUseLiveHeartRate.mockReset().mockReturnValue({
      bpm: null,
      status: 'awaitingFirstReading',
      lastReadingAt: null,
    });
    mockedUseWorkoutSession.mockReset().mockReturnValue({
      phase: 'idle',
      startedAt: null,
      samples: [],
      pauses: [],
      elapsedMs: 0,
      averageBpm: null,
      maxBpm: null,
      start: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      stop: jest.fn(),
    });
    mockedSaveWorkoutSession.mockReset().mockResolvedValue(undefined);
    mockedAutoSyncWorkoutSession.mockReset().mockResolvedValue(undefined);
  });

  describe('guard branch (no connected device)', () => {
    it('renders the no-device message with no BPM readout, Save, or device chip', async () => {
      await render(<LiveWorkout />);

      expect(screen.getByText('No monitor connected')).toBeOnTheScreen();
      expect(
        screen.getByText('Go back and connect a heart-rate monitor to start a workout.'),
      ).toBeOnTheScreen();
      expect(screen.queryByTestId('live-workout-save')).not.toBeOnTheScreen();
      expect(screen.queryByTestId('live-workout-device-chip')).not.toBeOnTheScreen();
    });

    it("adds the bottom safe-area inset on top of the screen's own padding, so Discard isn't overlapped by the gesture nav bar", async () => {
      await render(<LiveWorkout />);

      const container = screen.getByTestId('live-workout-container');
      expect(StyleSheet.flatten(container.props.style)).toEqual(
        expect.objectContaining({ paddingBottom: spacing.xl + 34 }),
      );
    });

    it('its back action calls router.back()', async () => {
      await render(<LiveWorkout />);

      fireEvent.press(screen.getByTestId('live-workout-discard'));

      expect(back).toHaveBeenCalledTimes(1);
    });
  });

  describe('connected branch', () => {
    beforeEach(() => {
      usePairingStore.setState({
        connection: { kind: 'connected', deviceId: 'device-1' },
        devices: [makeDevice()],
      });
    });

    it('renders the title, device chip, BPM placeholder, and waiting status', async () => {
      await render(<LiveWorkout />);

      // The session heading's eyebrow, not the (now time-derived, so
      // non-deterministic here) session name below it.
      expect(screen.getByText('Session')).toBeOnTheScreen();
      expect(screen.getByText('Pulse HRM')).toBeOnTheScreen();
      // BPM readout, avg BPM, and max BPM all fall back to the same
      // placeholder given the default null bpm/averageBpm/maxBpm mocks.
      expect(screen.getAllByText('--')).toHaveLength(3);
      expect(screen.getByText('WAITING FOR SIGNAL…')).toBeOnTheScreen();
    });

    it("derives the session heading's name from startedAt's time of day, matching session-summary.tsx's own titles", async () => {
      mockedUseWorkoutSession.mockReturnValue({
        phase: 'running',
        startedAt: new Date('2026-08-19T07:30:00').getTime(), // morning
        samples: [],
        pauses: [],
        elapsedMs: 0,
        averageBpm: null,
        maxBpm: null,
        start: jest.fn(),
        pause: jest.fn(),
        resume: jest.fn(),
        stop: jest.fn(),
      });

      await render(<LiveWorkout />);

      expect(screen.getByText('Morning Workout')).toBeOnTheScreen();
    });

    it('falls back to the unknown-device label when the device is not in the store', async () => {
      usePairingStore.setState({ devices: [] });
      await render(<LiveWorkout />);

      expect(screen.getByText('Unknown device')).toBeOnTheScreen();
    });

    it('renders elapsed as mm:ss, rounded average BPM, and max BPM from the session snapshot', async () => {
      mockedUseWorkoutSession.mockReturnValue({
        phase: 'running',
        startedAt: 0,
        samples: [],
        pauses: [],
        elapsedMs: 125_000, // 02:05
        averageBpm: 133.6,
        maxBpm: 150,
        start: jest.fn(),
        pause: jest.fn(),
        resume: jest.fn(),
        stop: jest.fn(),
      });

      await render(<LiveWorkout />);

      expect(screen.getByText('02:05')).toBeOnTheScreen();
      expect(screen.getByText('134')).toBeOnTheScreen();
      expect(screen.getByText('150')).toBeOnTheScreen();
    });

    it('renders "--" for a null average and a null max BPM', async () => {
      mockedUseWorkoutSession.mockReturnValue({
        phase: 'idle',
        startedAt: null,
        samples: [],
        pauses: [],
        elapsedMs: 0,
        averageBpm: null,
        maxBpm: null,
        start: jest.fn(),
        pause: jest.fn(),
        resume: jest.fn(),
        stop: jest.fn(),
      });

      await render(<LiveWorkout />);

      // BPM readout, avg BPM, and max BPM all fall back to the same
      // placeholder — three occurrences given the default null bpm mock.
      expect(screen.getAllByText('--')).toHaveLength(3);
    });

    it('shows the live status and bpm when status is live', async () => {
      mockedUseLiveHeartRate.mockReturnValue({ bpm: 128, status: 'live', lastReadingAt: 1000 });

      await render(<LiveWorkout />);

      expect(screen.getByText('128')).toBeOnTheScreen();
      expect(screen.getByText('LIVE')).toBeOnTheScreen();
    });

    it('shows signal lost while keeping the last bpm when status is stale', async () => {
      mockedUseLiveHeartRate.mockReturnValue({ bpm: 128, status: 'stale', lastReadingAt: 1000 });

      await render(<LiveWorkout />);

      expect(screen.getByText('128')).toBeOnTheScreen();
      expect(screen.getByText('SIGNAL LOST')).toBeOnTheScreen();
    });

    it('Discard calls router.back() and touches neither bleManager nor the pairing store', async () => {
      await render(<LiveWorkout />);

      fireEvent.press(screen.getByTestId('live-workout-discard'));

      expect(back).toHaveBeenCalledTimes(1);
      expect(mockedCancelDeviceConnection).not.toHaveBeenCalled();
      expect(usePairingStore.getState().connection).toEqual({
        kind: 'connected',
        deviceId: 'device-1',
      });
    });

    describe('Save', () => {
      it('is disabled with a visible hint and is a no-op when there are no samples', async () => {
        mockedUseWorkoutSession.mockReturnValue({
          phase: 'ended',
          startedAt: 0,
          samples: [],
          pauses: [],
          elapsedMs: 0,
          averageBpm: null,
          maxBpm: null,
          start: jest.fn(),
          pause: jest.fn(),
          resume: jest.fn(),
          stop: jest.fn(),
        });

        await render(<LiveWorkout />);

        const save = screen.getByTestId('live-workout-save');
        expect(save.props.accessibilityState.disabled).toBe(true);
        expect(screen.getByText('Wait for a reading before saving')).toBeOnTheScreen();

        fireEvent.press(save);

        expect(mockedSaveWorkoutSession).not.toHaveBeenCalled();
        expect(back).not.toHaveBeenCalled();
      });

      it('persists the session with the populated pauses and navigates back when there is at least one sample', async () => {
        const samples = [
          { bpm: 120, timestamp: 1_000 },
          { bpm: 130, timestamp: 2_000 },
        ];
        const pauses = [{ startedAt: 700, endedAt: 900 }];
        mockedUseWorkoutSession.mockReturnValue({
          phase: 'ended',
          startedAt: 500,
          samples,
          pauses,
          elapsedMs: 1_500,
          averageBpm: 125,
          maxBpm: 130,
          start: jest.fn(),
          pause: jest.fn(),
          resume: jest.fn(),
          stop: jest.fn(),
        });

        await render(<LiveWorkout />);

        const save = screen.getByTestId('live-workout-save');
        expect(save.props.accessibilityState.disabled).toBe(false);
        expect(screen.queryByText('Wait for a reading before saving')).not.toBeOnTheScreen();

        fireEvent.press(save);

        expect(mockedSaveWorkoutSession).toHaveBeenCalledTimes(1);
        expect(mockedSaveWorkoutSession).toHaveBeenCalledWith(
          expect.objectContaining({
            schemaVersion: WORKOUT_RECORD_SCHEMA_VERSION,
            startedAt: 500,
            samples,
            device: { id: 'device-1', name: 'Pulse HRM' },
            pauses,
            healthConnect: { status: 'notWritten', recordIds: [] },
          }),
        );
        expect(back).toHaveBeenCalledTimes(1);
      });

      it('calls autoSyncWorkoutSessionToHealthConnect with the same record only after saveWorkoutSession resolves, with router.back() already fired before either settles', async () => {
        const samples = [{ bpm: 120, timestamp: 1_000 }];
        mockedUseWorkoutSession.mockReturnValue({
          phase: 'ended',
          startedAt: 500,
          samples,
          pauses: [],
          elapsedMs: 500,
          averageBpm: 120,
          maxBpm: 120,
          start: jest.fn(),
          pause: jest.fn(),
          resume: jest.fn(),
          stop: jest.fn(),
        });

        await render(<LiveWorkout />);
        fireEvent.press(screen.getByTestId('live-workout-save'));

        // router.back() already fired synchronously, before
        // saveWorkoutSession's promise (and therefore
        // autoSyncWorkoutSessionToHealthConnect) has had any chance to
        // settle — Save's navigation timing is unchanged by this ticket.
        expect(back).toHaveBeenCalledTimes(1);
        expect(mockedAutoSyncWorkoutSession).not.toHaveBeenCalled();

        // Waits for the fire-and-forget saveWorkoutSession(...).then(...)
        // chain to run, without an extra manual act() wrapper (which
        // overlaps with fireEvent.press's own act scope here).
        await waitFor(() => expect(mockedAutoSyncWorkoutSession).toHaveBeenCalledTimes(1));

        const [savedRecord] = mockedSaveWorkoutSession.mock.calls[0];
        expect(mockedAutoSyncWorkoutSession).toHaveBeenCalledWith(savedRecord);
        expect(back.mock.invocationCallOrder[0]).toBeLessThan(
          mockedAutoSyncWorkoutSession.mock.invocationCallOrder[0],
        );
      });
    });

    describe('leaving the review screen before Save/Discard', () => {
      function endedSessionMock() {
        return {
          phase: 'ended' as const,
          startedAt: 500,
          samples: [{ bpm: 120, timestamp: 1_000 }],
          pauses: [],
          elapsedMs: 500,
          averageBpm: 120,
          maxBpm: 120,
          start: jest.fn(),
          pause: jest.fn(),
          resume: jest.fn(),
          stop: jest.fn(),
        };
      }

      it('shows a confirm Alert on back gesture while ended-and-undecided; confirming Discard navigates back without saving', async () => {
        mockedUseWorkoutSession.mockReturnValue(endedSessionMock());
        const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

        await render(<LiveWorkout />);

        expect(beforeRemoveListener).toBeDefined();
        const preventDefault = jest.fn();
        await act(async () => {
          beforeRemoveListener?.({ preventDefault });
        });

        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(alertSpy).toHaveBeenCalledTimes(1);
        expect(alertSpy).toHaveBeenCalledWith(
          'Discard this workout?',
          "This session hasn't been saved yet. Going back will discard it.",
          expect.any(Array),
        );

        const buttons = alertSpy.mock.calls[0][2] as Array<{
          text: string;
          onPress?: () => void;
        }>;
        const discardButton = buttons.find((button) => button.text === 'DISCARD');
        await act(async () => {
          discardButton?.onPress?.();
        });

        expect(mockedSaveWorkoutSession).not.toHaveBeenCalled();
        expect(back).toHaveBeenCalledTimes(1);

        alertSpy.mockRestore();
      });

      it('Cancel leaves the screen showing, unchanged', async () => {
        mockedUseWorkoutSession.mockReturnValue(endedSessionMock());
        const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

        await render(<LiveWorkout />);

        await act(async () => {
          beforeRemoveListener?.({ preventDefault: jest.fn() });
        });

        const buttons = alertSpy.mock.calls[0][2] as Array<{
          text: string;
          onPress?: () => void;
        }>;
        const cancelButton = buttons.find((button) => button.text === 'CANCEL');
        await act(async () => {
          cancelButton?.onPress?.();
        });

        expect(back).not.toHaveBeenCalled();
        expect(mockedSaveWorkoutSession).not.toHaveBeenCalled();
        expect(screen.getByTestId('live-workout-save')).toBeOnTheScreen();

        alertSpy.mockRestore();
      });

      it('tapping Save directly does not trigger the confirm Alert', async () => {
        mockedUseWorkoutSession.mockReturnValue(endedSessionMock());
        const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

        await render(<LiveWorkout />);

        await act(async () => {
          fireEvent.press(screen.getByTestId('live-workout-save'));
        });
        await act(async () => {
          beforeRemoveListener?.({ preventDefault: jest.fn() });
        });

        expect(alertSpy).not.toHaveBeenCalled();
        expect(back).toHaveBeenCalledTimes(1);

        alertSpy.mockRestore();
      });

      it('tapping Discard directly does not trigger the confirm Alert', async () => {
        mockedUseWorkoutSession.mockReturnValue(endedSessionMock());
        const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

        await render(<LiveWorkout />);

        await act(async () => {
          fireEvent.press(screen.getByTestId('live-workout-discard'));
        });
        await act(async () => {
          beforeRemoveListener?.({ preventDefault: jest.fn() });
        });

        expect(alertSpy).not.toHaveBeenCalled();
        expect(back).toHaveBeenCalledTimes(1);
        expect(mockedSaveWorkoutSession).not.toHaveBeenCalled();

        alertSpy.mockRestore();
      });
    });

    describe('phase-conditional action row', () => {
      function sessionMock(phase: 'idle' | 'running' | 'paused') {
        return {
          phase,
          startedAt: phase === 'idle' ? null : 0,
          samples: [],
          pauses: [],
          elapsedMs: 0,
          averageBpm: null,
          maxBpm: null,
          start: jest.fn(),
          pause: jest.fn(),
          resume: jest.fn(),
          stop: jest.fn(),
        };
      }

      it('idle: shows Discard + Start; tapping Start calls session.start exactly once', async () => {
        const session = sessionMock('idle');
        mockedUseWorkoutSession.mockReturnValue(session);

        await render(<LiveWorkout />);

        expect(screen.getByTestId('live-workout-discard')).toBeOnTheScreen();
        expect(screen.getByTestId('live-workout-start')).toBeOnTheScreen();
        expect(screen.queryByTestId('live-workout-pause')).not.toBeOnTheScreen();
        expect(screen.queryByTestId('live-workout-resume')).not.toBeOnTheScreen();
        expect(screen.queryByTestId('live-workout-stop')).not.toBeOnTheScreen();
        expect(screen.queryByTestId('live-workout-save')).not.toBeOnTheScreen();

        fireEvent.press(screen.getByTestId('live-workout-start'));

        expect(session.start).toHaveBeenCalledTimes(1);
      });

      it('running: shows Pause + Stop; tapping each calls session.pause/session.stop exactly once', async () => {
        const session = sessionMock('running');
        mockedUseWorkoutSession.mockReturnValue(session);

        await render(<LiveWorkout />);

        expect(screen.getByTestId('live-workout-pause')).toBeOnTheScreen();
        expect(screen.getByTestId('live-workout-stop')).toBeOnTheScreen();
        expect(screen.queryByTestId('live-workout-start')).not.toBeOnTheScreen();
        expect(screen.queryByTestId('live-workout-resume')).not.toBeOnTheScreen();
        expect(screen.queryByTestId('live-workout-discard')).not.toBeOnTheScreen();
        expect(screen.queryByTestId('live-workout-save')).not.toBeOnTheScreen();

        await act(async () => {
          fireEvent.press(screen.getByTestId('live-workout-pause'));
        });
        await act(async () => {
          fireEvent.press(screen.getByTestId('live-workout-stop'));
        });

        expect(session.pause).toHaveBeenCalledTimes(1);
        expect(session.stop).toHaveBeenCalledTimes(1);
      });

      it('paused: shows Stop + Resume; tapping each calls session.stop/session.resume exactly once', async () => {
        const session = sessionMock('paused');
        mockedUseWorkoutSession.mockReturnValue(session);

        await render(<LiveWorkout />);

        expect(screen.getByTestId('live-workout-stop')).toBeOnTheScreen();
        expect(screen.getByTestId('live-workout-resume')).toBeOnTheScreen();
        expect(screen.queryByTestId('live-workout-pause')).not.toBeOnTheScreen();
        expect(screen.queryByTestId('live-workout-start')).not.toBeOnTheScreen();
        expect(screen.queryByTestId('live-workout-discard')).not.toBeOnTheScreen();
        expect(screen.queryByTestId('live-workout-save')).not.toBeOnTheScreen();

        await act(async () => {
          fireEvent.press(screen.getByTestId('live-workout-stop'));
        });
        await act(async () => {
          fireEvent.press(screen.getByTestId('live-workout-resume'));
        });

        expect(session.stop).toHaveBeenCalledTimes(1);
        expect(session.resume).toHaveBeenCalledTimes(1);
      });
    });

    it('does not flip to the guard branch when connection transitions to connectionLost mid-session, and shows "DISCONNECTED" on the chip', async () => {
      mockedUseLiveHeartRate.mockReturnValue({ bpm: 128, status: 'stale', lastReadingAt: 1000 });

      await render(<LiveWorkout />);

      await act(async () => {
        usePairingStore.getState().connectionLost('device-1', 'deviceDisconnected');
      });

      expect(screen.queryByText('No monitor connected')).not.toBeOnTheScreen();
      // The session heading's eyebrow, not the (now time-derived, so
      // non-deterministic here) session name below it.
      expect(screen.getByText('Session')).toBeOnTheScreen();
      expect(screen.queryByText('Pulse HRM')).not.toBeOnTheScreen();
      expect(screen.getByText('DISCONNECTED')).toBeOnTheScreen();
      expect(screen.getByText('128')).toBeOnTheScreen();
      expect(screen.getByText('SIGNAL LOST')).toBeOnTheScreen();
    });

    describe('auto-reconnect after a mid-session drop', () => {
      it('shows "RECONNECTING" on the chip, in place of the device name, without changing the BPM readout or status line', async () => {
        mockedUseLiveHeartRate.mockReturnValue({ bpm: 128, status: 'stale', lastReadingAt: 1000 });

        await render(<LiveWorkout />);

        await act(async () => {
          usePairingStore.setState({
            connection: { kind: 'reconnecting', deviceId: 'device-1', attempt: 1 },
          });
        });

        expect(screen.getByText('RECONNECTING')).toBeOnTheScreen();
        expect(screen.queryByText('Pulse HRM')).not.toBeOnTheScreen();
        expect(screen.getByText('128')).toBeOnTheScreen();
        expect(screen.getByText('SIGNAL LOST')).toBeOnTheScreen();
      });

      it('resumes a live BPM/status render and shows the device name again once connection returns to connected, with no remount', async () => {
        mockedUseLiveHeartRate.mockReturnValue({ bpm: 128, status: 'stale', lastReadingAt: 1000 });

        await render(<LiveWorkout />);

        await act(async () => {
          usePairingStore.setState({
            connection: { kind: 'reconnecting', deviceId: 'device-1', attempt: 1 },
          });
        });
        expect(screen.getByText('RECONNECTING')).toBeOnTheScreen();

        mockedUseLiveHeartRate.mockReturnValue({ bpm: 132, status: 'live', lastReadingAt: 2000 });
        await act(async () => {
          usePairingStore.setState({ connection: { kind: 'connected', deviceId: 'device-1' } });
        });

        expect(screen.queryByText('RECONNECTING')).not.toBeOnTheScreen();
        expect(screen.getByText('Pulse HRM')).toBeOnTheScreen();
        expect(screen.getByText('132')).toBeOnTheScreen();
        expect(screen.getByText('LIVE')).toBeOnTheScreen();
        // Same rendered tree throughout — no fresh render() call, i.e. no remount.
        // The session heading's eyebrow, not the (now time-derived, so
        // non-deterministic here) session name below it.
        expect(screen.getByText('Session')).toBeOnTheScreen();
      });

      it('shows "DISCONNECTED" on the chip once reconnectFailed is reached, without changing the BPM readout or status line', async () => {
        mockedUseLiveHeartRate.mockReturnValue({ bpm: 128, status: 'stale', lastReadingAt: 1000 });

        await render(<LiveWorkout />);

        await act(async () => {
          usePairingStore.setState({
            connection: { kind: 'reconnectFailed', deviceId: 'device-1' },
          });
        });

        expect(screen.queryByText('RECONNECTING')).not.toBeOnTheScreen();
        expect(screen.getByText('DISCONNECTED')).toBeOnTheScreen();
        expect(screen.getByText('128')).toBeOnTheScreen();
        expect(screen.getByText('SIGNAL LOST')).toBeOnTheScreen();
      });
    });

    describe('__DEV__-only dropout wiring on the device chip', () => {
      const originalDev = __DEV__;

      afterEach(() => {
        (globalThis as unknown as { __DEV__: boolean }).__DEV__ = originalDev;
      });

      // The dev-only gate itself (no Pressable/accessibilityRole outside
      // __DEV__) is covered by device-chip.test.tsx; this only checks that
      // this screen wires the chip's callback to the frozen `deviceId`.
      it('calls bleManager.cancelDeviceConnection with the frozen deviceId when the chip is pressed', async () => {
        (globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;

        await render(<LiveWorkout />);
        fireEvent.press(screen.getByTestId('live-workout-device-chip'));

        expect(mockedCancelDeviceConnection).toHaveBeenCalledWith('device-1');
      });
    });

    describe('heart-rate trace', () => {
      function sessionMock(
        phase: WorkoutSessionSnapshot['phase'],
        overrides: Partial<WorkoutSessionSnapshot> = {},
      ): WorkoutSessionSnapshot {
        return {
          phase,
          startedAt: phase === 'idle' ? null : 0,
          samples: [],
          pauses: [],
          elapsedMs: 0,
          averageBpm: null,
          maxBpm: null,
          start: jest.fn(),
          pause: jest.fn(),
          resume: jest.fn(),
          stop: jest.fn(),
          ...overrides,
        };
      }

      it('renders during idle, running, and paused with a bucket array of length LIVE_TRACE_BUCKET_COUNT', async () => {
        mockedUseWorkoutSession.mockReturnValue(sessionMock('idle'));
        const { rerender } = await render(<LiveWorkout />);
        expect(screen.getByTestId('live-workout-trace', { hidden: true }).children.length).toBe(
          LIVE_TRACE_BUCKET_COUNT,
        );

        mockedUseWorkoutSession.mockReturnValue(sessionMock('running'));
        await rerender(<LiveWorkout />);
        expect(screen.getByTestId('live-workout-trace', { hidden: true }).children.length).toBe(
          LIVE_TRACE_BUCKET_COUNT,
        );

        mockedUseWorkoutSession.mockReturnValue(sessionMock('paused'));
        await rerender(<LiveWorkout />);
        expect(screen.getByTestId('live-workout-trace', { hidden: true }).children.length).toBe(
          LIVE_TRACE_BUCKET_COUNT,
        );
      });

      it('is absent once phase is ended', async () => {
        mockedUseWorkoutSession.mockReturnValue(
          sessionMock('ended', { samples: [{ bpm: 120, timestamp: 1_000 }] }),
        );

        await render(<LiveWorkout />);

        expect(screen.queryByTestId('live-workout-trace', { hidden: true })).not.toBeOnTheScreen();
      });

      it('wraps the trace in a card with a LIVE TRACE / bpm header', async () => {
        mockedUseWorkoutSession.mockReturnValue(sessionMock('running'));

        await render(<LiveWorkout />);

        expect(screen.getByText('LIVE TRACE')).toBeOnTheScreen();
        expect(screen.getByText('bpm')).toBeOnTheScreen();
      });

      it('changes its rendered values when samples gains a new reading between renders', async () => {
        const now = 10_000_000;
        jest.spyOn(Date, 'now').mockReturnValue(now);

        mockedUseWorkoutSession.mockReturnValue(
          sessionMock('running', { startedAt: now - 5_000, samples: [] }),
        );
        const { rerender } = await render(<LiveWorkout />);
        // .toJSON() (a plain, serializable tree) rather than the raw
        // TestInstance `.children` array, which holds circular parent/child
        // references that crash `toEqual`'s diff on failure.
        const before = screen.getByTestId('live-workout-trace', { hidden: true }).toJSON();

        mockedUseWorkoutSession.mockReturnValue(
          sessionMock('running', {
            startedAt: now - 5_000,
            samples: [{ bpm: 150, timestamp: now }],
          }),
        );
        await rerender(<LiveWorkout />);
        const after = screen.getByTestId('live-workout-trace', { hidden: true }).toJSON();

        expect(after).not.toEqual(before);

        jest.spyOn(Date, 'now').mockRestore();
      });

      // NOTE on what this test can and can't prove: SPEC.md's Design
      // decision is that rounding `Date.now()` to the current whole second
      // — not a manual useMemo — is what lets the React Compiler skip
      // recomputing `bucketHeartRateSamples(...)` on an unrelated re-render.
      // That skip is a Metro/babel-plugin-react-compiler transform applied
      // to the real app build; jest-expo's babel caller never sets
      // `supportsReactCompiler` (see babel-preset-expo's `getReactCompiler`),
      // so the compiler pass never runs under Jest and every render here
      // genuinely re-invokes the function, compiler or not. What *is*
      // testable here, and what the rounding is actually responsible for,
      // is that two renders inside the same rounded second compute the
      // *same* range argument (the input stability the compiler's own
      // memoization keys off), while a render after the second advances (or
      // a new sample arrives) computes a different one.
      it('computes an identical range argument for two renders within the same rounded second, and a different one once the second advances or a new sample arrives', async () => {
        const bucketSpy = jest.spyOn(workoutRecord, 'bucketHeartRateSamples');
        const dateSpy = jest.spyOn(Date, 'now');

        dateSpy.mockReturnValue(10_000_000); // rounds to 10_000_000
        const session = sessionMock('running', { startedAt: 9_000_000, samples: [] });
        mockedUseWorkoutSession.mockReturnValue(session);
        const { rerender } = await render(<LiveWorkout />);
        const rangeAtMount = bucketSpy.mock.calls.at(-1)?.[1];

        // A re-render triggered by something unrelated (e.g. a status
        // change), still within the same rounded second.
        dateSpy.mockReturnValue(10_000_400);
        mockedUseLiveHeartRate.mockReturnValue({ bpm: 140, status: 'live', lastReadingAt: 9999 });
        await rerender(<LiveWorkout />);
        expect(bucketSpy.mock.calls.at(-1)?.[1]).toEqual(rangeAtMount);

        // The rounded second advances — a real input change.
        dateSpy.mockReturnValue(10_001_200);
        await rerender(<LiveWorkout />);
        expect(bucketSpy.mock.calls.at(-1)?.[1]).not.toEqual(rangeAtMount);
        const rangeAfterSecondAdvance = bucketSpy.mock.calls.at(-1)?.[1];

        // A new sample arrives — also a real input change (the first
        // argument, not the range, differs this time).
        mockedUseWorkoutSession.mockReturnValue(
          sessionMock('running', {
            startedAt: 9_000_000,
            samples: [{ bpm: 150, timestamp: 10_001_200 }],
          }),
        );
        await rerender(<LiveWorkout />);
        expect(bucketSpy.mock.calls.at(-1)?.[1]).toEqual(rangeAfterSecondAdvance);
        expect(bucketSpy.mock.calls.at(-1)?.[0]).toEqual([{ bpm: 150, timestamp: 10_001_200 }]);

        bucketSpy.mockRestore();
        dateSpy.mockRestore();
      });
    });
  });
});
