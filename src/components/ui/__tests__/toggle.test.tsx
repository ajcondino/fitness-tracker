import { fireEvent, render, screen } from '@testing-library/react-native';

import { Toggle } from '@/components/ui/toggle';
import { colors } from '@/constants/theme';

describe('<Toggle />', () => {
  it('renders the track in the success color when value is true', async () => {
    await render(
      <Toggle
        value={true}
        onValueChange={jest.fn()}
        accessibilityLabel="Save to Health Connect"
        testID="toggle"
      />,
    );

    const track = screen.getByTestId('toggle-track');
    expect(track.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: colors.success })]),
    );
  });

  it('renders the track in the idle surface color when value is false', async () => {
    await render(
      <Toggle
        value={false}
        onValueChange={jest.fn()}
        accessibilityLabel="Save to Health Connect"
        testID="toggle"
      />,
    );

    const track = screen.getByTestId('toggle-track');
    expect(track.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ backgroundColor: colors.surfaceTrackIdle }),
      ]),
    );
  });

  it('calls onValueChange with the flipped value when pressed', async () => {
    const onValueChange = jest.fn();
    await render(
      <Toggle
        value={false}
        onValueChange={onValueChange}
        accessibilityLabel="Save to Health Connect"
      />,
    );

    fireEvent.press(screen.getByRole('switch'));

    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('reports its checked state via accessibilityState', async () => {
    await render(
      <Toggle value={true} onValueChange={jest.fn()} accessibilityLabel="Save to Health Connect" />,
    );

    expect(screen.getByRole('switch')).toHaveProp('accessibilityState', {
      checked: true,
      disabled: undefined,
    });
  });

  it('does not call onValueChange when disabled', async () => {
    const onValueChange = jest.fn();
    await render(
      <Toggle
        value={false}
        onValueChange={onValueChange}
        disabled
        accessibilityLabel="Save to Health Connect"
      />,
    );

    fireEvent.press(screen.getByRole('switch'));

    expect(onValueChange).not.toHaveBeenCalled();
  });
});
