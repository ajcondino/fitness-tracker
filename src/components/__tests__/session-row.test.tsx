import { fireEvent, render, screen } from '@testing-library/react-native';

import { SessionRow } from '@/components/session-row';
import { colors } from '@/constants/theme';
import type { HealthConnectWriteStatus } from '@/workout/workout-record';

describe('<SessionRow />', () => {
  it('renders the date column, title, time, duration, and average BPM', async () => {
    await render(
      <SessionRow
        monthLabel="AUG"
        dayLabel="17"
        titleLabel="Morning Workout"
        timeLabel="6:42 PM"
        durationLabel="42:10"
        averageBpmLabel="134"
        writeStatus="notWritten"
      />,
    );

    expect(screen.getByText('AUG')).toBeOnTheScreen();
    expect(screen.getByText('17')).toBeOnTheScreen();
    expect(screen.getByText('Morning Workout')).toBeOnTheScreen();
    expect(screen.getByText('6:42 PM')).toBeOnTheScreen();
    expect(screen.getByText('42:10')).toBeOnTheScreen();
    expect(screen.getByText('134 avg')).toBeOnTheScreen();
  });

  it('renders the average BPM in the primary color', async () => {
    await render(
      <SessionRow
        monthLabel="AUG"
        dayLabel="17"
        titleLabel="Morning Workout"
        timeLabel="6:42 PM"
        durationLabel="42:10"
        averageBpmLabel="134"
        writeStatus="notWritten"
      />,
    );

    const average = screen.getByText('134 avg');
    expect(average.props.style).toEqual(expect.arrayContaining([{ color: colors.primary }]));
  });

  it('renders "--" for a null average BPM label as-is, with no crash', async () => {
    await render(
      <SessionRow
        monthLabel="AUG"
        dayLabel="17"
        titleLabel="Morning Workout"
        timeLabel="6:42 PM"
        durationLabel="00:00"
        averageBpmLabel="--"
        writeStatus="notWritten"
      />,
    );

    expect(screen.getByText('-- avg')).toBeOnTheScreen();
  });

  it('renders a decorative chevron but stays non-tappable', async () => {
    await render(
      <SessionRow
        monthLabel="AUG"
        dayLabel="17"
        titleLabel="Morning Workout"
        timeLabel="6:42 PM"
        durationLabel="42:10"
        averageBpmLabel="134"
        writeStatus="notWritten"
      />,
    );

    expect(screen.getByText('›')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('exposes a button role and calls onPress when pressed, given an onPress prop', async () => {
    const onPress = jest.fn();
    await render(
      <SessionRow
        monthLabel="AUG"
        dayLabel="17"
        titleLabel="Morning Workout"
        timeLabel="6:42 PM"
        durationLabel="42:10"
        averageBpmLabel="134"
        writeStatus="notWritten"
        onPress={onPress}
      />,
    );

    expect(screen.getByRole('button')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('session-row'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  describe('write status marker', () => {
    it.each<[HealthConnectWriteStatus, string]>([
      ['written', 'write-status-marker-written'],
      ['notWritten', 'write-status-marker-not-written'],
      ['failed', 'write-status-marker-failed'],
    ])('renders %s with testID %s and a matching accessibilityLabel', async (status, testID) => {
      await render(
        <SessionRow
          monthLabel="AUG"
          dayLabel="17"
          titleLabel="Morning Workout"
          timeLabel="6:42 PM"
          durationLabel="42:10"
          averageBpmLabel="134"
          writeStatus={status}
        />,
      );

      const marker = screen.getByTestId(testID, { hidden: true });
      expect(marker).toBeOnTheScreen();
    });

    it('written renders with accessibilityLabel "Written to Health Connect"', async () => {
      await render(
        <SessionRow
          monthLabel="AUG"
          dayLabel="17"
          titleLabel="Morning Workout"
          timeLabel="6:42 PM"
          durationLabel="42:10"
          averageBpmLabel="134"
          writeStatus="written"
        />,
      );

      expect(screen.getByLabelText('Written to Health Connect')).toBeOnTheScreen();
    });

    it('notWritten renders with accessibilityLabel "Not written to Health Connect"', async () => {
      await render(
        <SessionRow
          monthLabel="AUG"
          dayLabel="17"
          titleLabel="Morning Workout"
          timeLabel="6:42 PM"
          durationLabel="42:10"
          averageBpmLabel="134"
          writeStatus="notWritten"
        />,
      );

      expect(screen.getByLabelText('Not written to Health Connect')).toBeOnTheScreen();
    });

    it('failed renders with accessibilityLabel "Health Connect sync failed"', async () => {
      await render(
        <SessionRow
          monthLabel="AUG"
          dayLabel="17"
          titleLabel="Morning Workout"
          timeLabel="6:42 PM"
          durationLabel="42:10"
          averageBpmLabel="134"
          writeStatus="failed"
        />,
      );

      expect(screen.getByLabelText('Health Connect sync failed')).toBeOnTheScreen();
    });
  });
});
