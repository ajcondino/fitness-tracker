import { fireEvent, render, screen } from '@testing-library/react-native';

import { DeviceRow } from '@/components/device-row';
import { colors } from '@/constants/theme';

describe('<DeviceRow />', () => {
  it('renders the name, RSSI, and a chevron for an available device', async () => {
    await render(
      <DeviceRow
        name="Pulse HRM"
        isNameFallback={false}
        rssi={-52}
        status="available"
        disabled={false}
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByText('Pulse HRM')).toBeOnTheScreen();
    expect(screen.getByText('-52 dBm')).toBeOnTheScreen();
    expect(screen.getByText('›')).toBeOnTheScreen();
  });

  it('dims the title when isNameFallback is true', async () => {
    await render(
      <DeviceRow
        name="Unknown device"
        isNameFallback
        rssi={-70}
        status="available"
        disabled={false}
        onPress={jest.fn()}
      />,
    );

    const title = screen.getByText('Unknown device');
    expect(title.props.style).toEqual(expect.arrayContaining([{ color: colors.onSurfaceMuted }]));
  });

  it('does not dim the title when isNameFallback is false', async () => {
    await render(
      <DeviceRow
        name="Pulse HRM"
        isNameFallback={false}
        rssi={-70}
        status="available"
        disabled={false}
        onPress={jest.fn()}
      />,
    );

    const title = screen.getByText('Pulse HRM');
    expect(title.props.style).toEqual(expect.arrayContaining([{ color: colors.onSurface }]));
  });

  it.each([
    ['connecting', 'CONNECTING…', colors.onSurfaceFaint],
    ['connected', 'CONNECTED', colors.success],
    ['failed', 'RETRY', colors.primary],
  ] as const)(
    'renders %s with trailing copy %s in the right color',
    async (status, text, color) => {
      await render(
        <DeviceRow
          name="Pulse HRM"
          isNameFallback={false}
          rssi={-52}
          status={status}
          disabled={false}
          onPress={jest.fn()}
        />,
      );

      const node = screen.getByText(text);
      expect(node.props.style).toEqual(expect.arrayContaining([{ color }]));
    },
  );

  it('calls onPress when enabled', async () => {
    const onPress = jest.fn();
    await render(
      <DeviceRow
        name="Pulse HRM"
        isNameFallback={false}
        rssi={-52}
        status="available"
        disabled={false}
        onPress={onPress}
      />,
    );

    fireEvent.press(screen.getByTestId('device-row'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('suppresses onPress when disabled', async () => {
    const onPress = jest.fn();
    await render(
      <DeviceRow
        name="Pulse HRM"
        isNameFallback={false}
        rssi={-52}
        status="available"
        disabled
        onPress={onPress}
      />,
    );

    fireEvent.press(screen.getByTestId('device-row'));

    expect(onPress).not.toHaveBeenCalled();
  });
});
