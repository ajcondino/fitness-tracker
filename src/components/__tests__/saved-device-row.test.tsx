import { fireEvent, render, screen } from '@testing-library/react-native';

import { SavedDeviceRow } from '@/components/saved-device-row';
import { colors } from '@/constants/theme';

describe('<SavedDeviceRow />', () => {
  it('renders the name and a FORGET action', async () => {
    await render(<SavedDeviceRow name="Pulse HRM" isNameFallback={false} onForget={jest.fn()} />);

    expect(screen.getByText('Pulse HRM')).toBeOnTheScreen();
    expect(screen.getByText('FORGET')).toBeOnTheScreen();
  });

  it('dims the name when isNameFallback is true', async () => {
    await render(<SavedDeviceRow name="Unknown device" isNameFallback onForget={jest.fn()} />);

    const title = screen.getByText('Unknown device');
    expect(title.props.style).toEqual(expect.arrayContaining([{ color: colors.onSurfaceMuted }]));
  });

  it('does not dim the name when isNameFallback is false', async () => {
    await render(<SavedDeviceRow name="Pulse HRM" isNameFallback={false} onForget={jest.fn()} />);

    const title = screen.getByText('Pulse HRM');
    expect(title.props.style).toEqual(expect.arrayContaining([{ color: colors.onSurface }]));
  });

  it('renders the FORGET action in the danger color', async () => {
    await render(<SavedDeviceRow name="Pulse HRM" isNameFallback={false} onForget={jest.fn()} />);

    const action = screen.getByText('FORGET');
    expect(action.props.style).toEqual(expect.arrayContaining([{ color: colors.danger }]));
  });

  it('calls onForget when the FORGET action is pressed', async () => {
    const onForget = jest.fn();
    await render(<SavedDeviceRow name="Pulse HRM" isNameFallback={false} onForget={onForget} />);

    fireEvent.press(screen.getByTestId('saved-device-row-forget'));

    expect(onForget).toHaveBeenCalledTimes(1);
  });
});
