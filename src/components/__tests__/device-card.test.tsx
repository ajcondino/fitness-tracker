import { fireEvent, render, screen } from '@testing-library/react-native';

import { DeviceCard } from '@/components/device-card';
import { colors } from '@/constants/theme';

describe('<DeviceCard />', () => {
  it('renders the title and subtitle', async () => {
    await render(
      <DeviceCard
        status="disconnected"
        title="No monitor connected"
        subtitle="Tap to pair a heart-rate monitor"
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByText('No monitor connected')).toBeOnTheScreen();
    expect(screen.getByText('Tap to pair a heart-rate monitor')).toBeOnTheScreen();
  });

  it('renders a danger status dot when disconnected', async () => {
    await render(
      <DeviceCard status="disconnected" title="Title" subtitle="Subtitle" onPress={jest.fn()} />,
    );

    expect(screen.getByTestId('device-card-status-dot').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: colors.danger })]),
    );
  });

  it('renders a success status dot when connected', async () => {
    await render(
      <DeviceCard status="connected" title="Title" subtitle="Subtitle" onPress={jest.fn()} />,
    );

    expect(screen.getByTestId('device-card-status-dot').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: colors.success })]),
    );
  });

  it('calls onPress when pressed', async () => {
    const onPress = jest.fn();
    await render(
      <DeviceCard status="disconnected" title="Title" subtitle="Subtitle" onPress={onPress} />,
    );

    fireEvent.press(screen.getByTestId('device-card'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
