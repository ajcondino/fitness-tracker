import { fireEvent, render, screen } from '@testing-library/react-native';

import { DeviceChip } from '@/components/device-chip';
import { colors } from '@/constants/theme';

describe('<DeviceChip />', () => {
  const originalDev = __DEV__;

  afterEach(() => {
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = originalDev;
  });

  it('renders the device name, no border, and a pulsing success dot when connected', async () => {
    await render(
      <DeviceChip deviceName="Pulse HRM" status="connected" onSimulateDropout={jest.fn()} />,
    );

    expect(screen.getByText('Pulse HRM')).toBeOnTheScreen();
    expect(screen.getByTestId('live-workout-device-chip').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ borderWidth: 0 })]),
    );
    const dot = screen.getByTestId('device-chip-dot');
    // The pulsing LiveDot is an Animated.View, which flattens its style
    // array into a single object — unlike the plain View used below.
    expect(dot.props.style).toEqual(
      expect.objectContaining({ backgroundColor: colors.success, opacity: expect.anything() }),
    );
  });

  it('replaces the label with "RECONNECTING" and uses a primary border/dot when reconnecting', async () => {
    await render(
      <DeviceChip deviceName="Pulse HRM" status="reconnecting" onSimulateDropout={jest.fn()} />,
    );

    expect(screen.getByText('RECONNECTING')).toBeOnTheScreen();
    expect(screen.queryByText('Pulse HRM')).not.toBeOnTheScreen();
    expect(screen.getByText('RECONNECTING').props.style).toEqual(
      expect.arrayContaining([{ color: colors.primary }]),
    );
    expect(screen.getByTestId('live-workout-device-chip').props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ borderWidth: 1, borderColor: colors.primary }),
      ]),
    );
    const dot = screen.getByTestId('device-chip-dot');
    expect(dot.props.style).toEqual(
      expect.objectContaining({ backgroundColor: colors.primary, opacity: expect.anything() }),
    );
  });

  it('replaces the label with "DISCONNECTED" and uses a static danger border/dot when disconnected', async () => {
    await render(
      <DeviceChip deviceName="Pulse HRM" status="disconnected" onSimulateDropout={jest.fn()} />,
    );

    expect(screen.getByText('DISCONNECTED')).toBeOnTheScreen();
    expect(screen.queryByText('Pulse HRM')).not.toBeOnTheScreen();
    expect(screen.getByText('DISCONNECTED').props.style).toEqual(
      expect.arrayContaining([{ color: colors.danger }]),
    );
    expect(screen.getByTestId('live-workout-device-chip').props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ borderWidth: 1, borderColor: colors.danger }),
      ]),
    );
    const dot = screen.getByTestId('device-chip-dot');
    expect(dot.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: colors.danger })]),
    );
    // Static, not the pulsing LiveDot — no animated opacity style.
    expect(
      (dot.props.style as Array<Record<string, unknown>>).some((s) => s && 'opacity' in s),
    ).toBe(false);
  });

  describe('__DEV__ gating', () => {
    it('is a button that calls onSimulateDropout when pressed, when __DEV__ is true', async () => {
      (globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;
      const onSimulateDropout = jest.fn();

      await render(
        <DeviceChip
          deviceName="Pulse HRM"
          status="connected"
          onSimulateDropout={onSimulateDropout}
        />,
      );

      const chip = screen.getByTestId('live-workout-device-chip');
      expect(chip.props.accessibilityRole).toBe('button');

      fireEvent.press(chip);

      expect(onSimulateDropout).toHaveBeenCalledTimes(1);
    });

    it('is a plain, non-interactive element with no button role or press feedback when __DEV__ is false', async () => {
      (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
      const onSimulateDropout = jest.fn();

      await render(
        <DeviceChip
          deviceName="Pulse HRM"
          status="connected"
          onSimulateDropout={onSimulateDropout}
        />,
      );

      const chip = screen.getByTestId('live-workout-device-chip');
      expect(chip.props.accessibilityRole).toBeUndefined();
      expect(screen.queryByRole('button')).not.toBeOnTheScreen();

      fireEvent.press(chip);

      expect(onSimulateDropout).not.toHaveBeenCalled();
    });
  });
});
