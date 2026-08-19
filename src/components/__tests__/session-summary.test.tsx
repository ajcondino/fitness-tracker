import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { SessionSummary } from '@/components/session-summary';
import type { WorkoutRecord } from '@/workout/workout-record';

function makeRecord(overrides: Partial<WorkoutRecord> = {}): WorkoutRecord {
  return {
    schemaVersion: 1,
    id: 'workout-1',
    // 6:42 PM — within the 17:00–21:59 "evening" bucket.
    startedAt: new Date('2026-08-19T18:42:00').getTime(),
    samples: [
      { bpm: 120, timestamp: new Date('2026-08-19T18:42:00').getTime() },
      { bpm: 140, timestamp: new Date('2026-08-19T18:52:10').getTime() },
    ],
    device: { id: 'device-1', name: 'Pulse HRM' },
    pauses: [],
    ...overrides,
  };
}

describe('<SessionSummary />', () => {
  describe('shared rendering (both modes)', () => {
    it('renders the date/time, derived title, hero duration, and avg/max BPM stat cards', async () => {
      const record = makeRecord();

      await render(
        <SessionSummary mode="detail" record={record} onBack={jest.fn()} onDone={jest.fn()} />,
      );

      expect(screen.getByText('AUG 19 · 6:42 PM')).toBeOnTheScreen();
      expect(screen.getByText('Evening Workout')).toBeOnTheScreen();
      expect(screen.getByText('TOTAL TIME')).toBeOnTheScreen();
      expect(screen.getByText('10:10')).toBeOnTheScreen();
      expect(screen.getByText('130')).toBeOnTheScreen();
      expect(screen.getByText('140')).toBeOnTheScreen();
    });

    it('renders "--" for a null average/max BPM on a zero-sample record, with 0:00 duration', async () => {
      const record = makeRecord({ samples: [] });

      await render(
        <SessionSummary mode="detail" record={record} onBack={jest.fn()} onDone={jest.fn()} />,
      );

      expect(screen.getByText('00:00')).toBeOnTheScreen();
      expect(screen.getAllByText('--')).toHaveLength(2);
    });
  });

  describe('mode="review"', () => {
    it('renders the "session complete" flag and no back/done controls', async () => {
      const record = makeRecord();

      await render(
        <SessionSummary mode="review" record={record} onSave={jest.fn()} onDiscard={jest.fn()} />,
      );

      expect(screen.getByText('SESSION COMPLETE')).toBeOnTheScreen();
      expect(screen.queryByTestId('session-summary-back')).not.toBeOnTheScreen();
      expect(screen.queryByTestId('session-summary-done')).not.toBeOnTheScreen();
    });

    it('Save is disabled with a visible hint and is a no-op when there are no samples', async () => {
      const record = makeRecord({ samples: [] });
      const onSave = jest.fn();

      await render(
        <SessionSummary mode="review" record={record} onSave={onSave} onDiscard={jest.fn()} />,
      );

      const save = screen.getByTestId('live-workout-save');
      expect(save.props.accessibilityState.disabled).toBe(true);
      expect(screen.getByText('Wait for a reading before saving')).toBeOnTheScreen();

      fireEvent.press(save);

      expect(onSave).not.toHaveBeenCalled();
    });

    it('Save calls onSave when there is at least one sample, with no disabled hint', async () => {
      const record = makeRecord();
      const onSave = jest.fn();

      await render(
        <SessionSummary mode="review" record={record} onSave={onSave} onDiscard={jest.fn()} />,
      );

      const save = screen.getByTestId('live-workout-save');
      expect(save.props.accessibilityState.disabled).toBe(false);
      expect(screen.queryByText('Wait for a reading before saving')).not.toBeOnTheScreen();

      fireEvent.press(save);

      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it('Discard calls onDiscard', async () => {
      const record = makeRecord();
      const onDiscard = jest.fn();

      await render(
        <SessionSummary mode="review" record={record} onSave={jest.fn()} onDiscard={onDiscard} />,
      );

      fireEvent.press(screen.getByTestId('live-workout-discard'));

      expect(onDiscard).toHaveBeenCalledTimes(1);
    });
  });

  describe('mode="detail"', () => {
    it('renders the "saved session" flag and no Save/Discard controls', async () => {
      const record = makeRecord();

      await render(
        <SessionSummary mode="detail" record={record} onBack={jest.fn()} onDone={jest.fn()} />,
      );

      expect(screen.getByText('SAVED SESSION')).toBeOnTheScreen();
      expect(screen.queryByTestId('live-workout-save')).not.toBeOnTheScreen();
      expect(screen.queryByTestId('live-workout-discard')).not.toBeOnTheScreen();
    });

    it('BACK calls onBack and DONE calls onDone', async () => {
      const record = makeRecord();
      const onBack = jest.fn();
      const onDone = jest.fn();

      await render(
        <SessionSummary mode="detail" record={record} onBack={onBack} onDone={onDone} />,
      );

      await act(async () => {
        fireEvent.press(screen.getByTestId('session-summary-back'));
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId('session-summary-done'));
      });

      expect(onBack).toHaveBeenCalledTimes(1);
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });
});
