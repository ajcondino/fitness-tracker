import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { WeightSection } from '@/components/weight-section';
import type { WeightSyncOutcome } from '@/health/weight-sync';

async function saveWith(text: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('weight-section-field'), text);
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('weight-section-submit'));
  });
}

describe('<WeightSection />', () => {
  it('shows "Not set" with no entry', async () => {
    await render(<WeightSection latestKg={null} unit="metric" onSave={jest.fn()} />);
    expect(screen.getByText('WEIGHT')).toBeOnTheScreen();
    expect(screen.getByTestId('weight-current')).toHaveTextContent('Not set');
  });

  it('shows the latest weight in the chosen unit', async () => {
    await render(<WeightSection latestKg={70} unit="imperial" onSave={jest.fn()} />);
    expect(screen.getByTestId('weight-current')).toHaveTextContent('154.3 lb');
  });

  it('saves the typed weight in canonical kg', async () => {
    const onSave = jest.fn().mockResolvedValue({ status: 'written' } satisfies WeightSyncOutcome);
    await render(<WeightSection latestKg={null} unit="metric" onSave={onSave} />);
    await saveWith('72');
    expect(onSave).toHaveBeenCalledWith(72);
    expect(screen.queryByTestId('weight-notice')).toBeNull();
  });

  it('shows a non-blocking notice for a skipped write', async () => {
    const onSave = jest
      .fn()
      .mockResolvedValue({ status: 'skipped', reason: 'denied' } satisfies WeightSyncOutcome);
    await render(<WeightSection latestKg={null} unit="metric" onSave={onSave} />);
    await saveWith('72');
    expect(screen.getByTestId('weight-notice')).toBeOnTheScreen();
  });

  it('shows no notice when write-back is off', async () => {
    const onSave = jest
      .fn()
      .mockResolvedValue({ status: 'skipped', reason: 'writeBackOff' } satisfies WeightSyncOutcome);
    await render(<WeightSection latestKg={null} unit="metric" onSave={onSave} />);
    await saveWith('72');
    expect(screen.queryByTestId('weight-notice')).toBeNull();
  });
});
