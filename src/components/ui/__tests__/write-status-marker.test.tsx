import { render, screen } from '@testing-library/react-native';

import { WriteStatusMarker } from '@/components/ui/write-status-marker';
import type { HealthConnectWriteStatus } from '@/workout/workout-record';

describe('<WriteStatusMarker />', () => {
  it.each<[HealthConnectWriteStatus, string]>([
    ['written', 'write-status-marker-written'],
    ['notWritten', 'write-status-marker-not-written'],
    ['failed', 'write-status-marker-failed'],
  ])('renders testID %2$s for status %1$s', async (status, testID) => {
    await render(<WriteStatusMarker status={status} />);

    expect(screen.getByTestId(testID, { hidden: true })).toBeOnTheScreen();
  });

  it('is accessible with the given accessibilityLabel when provided', async () => {
    await render(
      <WriteStatusMarker status="written" accessibilityLabel="Written to Health Connect" />,
    );

    expect(screen.getByLabelText('Written to Health Connect')).toBeOnTheScreen();
  });

  it('is importantForAccessibility="no" (decorative) when accessibilityLabel is omitted', async () => {
    await render(<WriteStatusMarker status="notWritten" />);

    expect(screen.getByTestId('write-status-marker-not-written', { hidden: true })).toHaveProp(
      'importantForAccessibility',
      'no',
    );
  });
});
