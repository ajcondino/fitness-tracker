import { render, screen } from '@testing-library/react-native';

import { SessionRow } from '@/components/session-row';
import { colors } from '@/constants/theme';

describe('<SessionRow />', () => {
  it('renders the date column, time, duration, and average BPM', async () => {
    await render(
      <SessionRow
        monthLabel="AUG"
        dayLabel="17"
        timeLabel="6:42 PM"
        durationLabel="42:10"
        averageBpmLabel="134"
      />,
    );

    expect(screen.getByText('AUG')).toBeOnTheScreen();
    expect(screen.getByText('17')).toBeOnTheScreen();
    expect(screen.getByText('6:42 PM')).toBeOnTheScreen();
    expect(screen.getByText('42:10')).toBeOnTheScreen();
    expect(screen.getByText('134')).toBeOnTheScreen();
  });

  it('renders the average BPM in the primary color', async () => {
    await render(
      <SessionRow
        monthLabel="AUG"
        dayLabel="17"
        timeLabel="6:42 PM"
        durationLabel="42:10"
        averageBpmLabel="134"
      />,
    );

    const average = screen.getByText('134');
    expect(average.props.style).toEqual(expect.arrayContaining([{ color: colors.primary }]));
  });

  it('renders "--" for a null average BPM label as-is, with no crash', async () => {
    await render(
      <SessionRow
        monthLabel="AUG"
        dayLabel="17"
        timeLabel="6:42 PM"
        durationLabel="00:00"
        averageBpmLabel="--"
      />,
    );

    expect(screen.getByText('--')).toBeOnTheScreen();
  });

  it('renders no chevron and is not tappable', async () => {
    await render(
      <SessionRow
        monthLabel="AUG"
        dayLabel="17"
        timeLabel="6:42 PM"
        durationLabel="42:10"
        averageBpmLabel="134"
      />,
    );

    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });
});
