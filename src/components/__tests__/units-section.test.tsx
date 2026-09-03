import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { UnitsSection } from '@/components/units-section';

describe('<UnitsSection />', () => {
  it('renders both rows with metric captions and off toggles for metric/metric props', async () => {
    await render(
      <UnitsSection
        distance="metric"
        weight="metric"
        onSetDistanceUnit={jest.fn()}
        onSetWeightUnit={jest.fn()}
      />,
    );

    expect(screen.getByText('UNITS')).toBeOnTheScreen();
    expect(screen.getByText('Kilometers (km)')).toBeOnTheScreen();
    expect(screen.getByText('Kilograms (kg)')).toBeOnTheScreen();
    expect(screen.getByTestId('units-distance-toggle').props.accessibilityState.checked).toBe(
      false,
    );
    expect(screen.getByTestId('units-weight-toggle').props.accessibilityState.checked).toBe(false);
  });

  it('renders both rows with imperial captions and on toggles for imperial/imperial props', async () => {
    await render(
      <UnitsSection
        distance="imperial"
        weight="imperial"
        onSetDistanceUnit={jest.fn()}
        onSetWeightUnit={jest.fn()}
      />,
    );

    expect(screen.getByText('Miles (mi)')).toBeOnTheScreen();
    expect(screen.getByText('Pounds (lb)')).toBeOnTheScreen();
    expect(screen.getByTestId('units-distance-toggle').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('units-weight-toggle').props.accessibilityState.checked).toBe(true);
  });

  it('pressing the distance toggle calls onSetDistanceUnit with the opposite system', async () => {
    const onSetDistanceUnit = jest.fn();
    await render(
      <UnitsSection
        distance="metric"
        weight="metric"
        onSetDistanceUnit={onSetDistanceUnit}
        onSetWeightUnit={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('units-distance-toggle'));
    });

    expect(onSetDistanceUnit).toHaveBeenCalledWith('imperial');
  });

  it('pressing the weight toggle calls onSetWeightUnit with the opposite system', async () => {
    const onSetWeightUnit = jest.fn();
    await render(
      <UnitsSection
        distance="imperial"
        weight="imperial"
        onSetDistanceUnit={jest.fn()}
        onSetWeightUnit={onSetWeightUnit}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('units-weight-toggle'));
    });

    expect(onSetWeightUnit).toHaveBeenCalledWith('metric');
  });
});
