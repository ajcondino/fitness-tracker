import { fireEvent, render, screen } from '@testing-library/react-native';

import { DeviceRow } from '@/components/device-row';
import { colors } from '@/constants/theme';

describe('<DeviceRow />', () => {
  it('renders the name, RSSI with a signal qualifier, and a CONNECT pill for a strong-signal available device', async () => {
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
    expect(screen.getByText('−52 dBm · Strong')).toBeOnTheScreen();
    expect(screen.getByText('CONNECT')).toBeOnTheScreen();
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
    ['−70 dBm · Fair', -70],
    ['−60 dBm · Good', -60],
    ['−52 dBm · Strong', -52],
    ['−90 dBm · Weak', -90],
  ] as const)('formats %s for an RSSI of %i dBm', async (text, rssi) => {
    await render(
      <DeviceRow
        name="Pulse HRM"
        isNameFallback={false}
        rssi={rssi}
        status="available"
        disabled={false}
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByText(text)).toBeOnTheScreen();
  });

  it.each([
    ['connecting', 'PAIRING', colors.onPrimary],
    ['connected', 'CONNECTED', colors.success],
    ['failed', 'RETRY', colors.primary],
  ] as const)(
    'renders %s with trailing pill copy %s in the right label color',
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

  it('renders an available device with a weaker signal with an outline pill, not the filled one', async () => {
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

    const node = screen.getByText('CONNECT');
    expect(node.props.style).toEqual(expect.arrayContaining([{ color: colors.onSurfaceSoft }]));
  });

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
