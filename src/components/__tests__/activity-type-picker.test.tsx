import { fireEvent, render, screen } from '@testing-library/react-native';

import { ActivityTypePicker } from '@/components/activity-type-picker';
import { ACTIVITY_TYPES } from '@/workout/workout-record';

describe('<ActivityTypePicker />', () => {
  it('renders all five activity pills', async () => {
    await render(<ActivityTypePicker value="run" onChange={jest.fn()} />);

    for (const type of ACTIVITY_TYPES) {
      expect(screen.getByTestId(`activity-type-picker-${type}`)).toBeOnTheScreen();
    }
  });

  it('marks only the pill matching value as selected', async () => {
    await render(<ActivityTypePicker value="cycle" onChange={jest.fn()} />);

    for (const type of ACTIVITY_TYPES) {
      const pill = screen.getByTestId(`activity-type-picker-${type}`);
      expect(pill.props.accessibilityState).toEqual({ selected: type === 'cycle' });
    }
  });

  it("calls onChange with the pressed pill's type", async () => {
    const onChange = jest.fn();
    await render(<ActivityTypePicker value="run" onChange={onChange} />);

    fireEvent.press(screen.getByTestId('activity-type-picker-strength'));

    expect(onChange).toHaveBeenCalledWith('strength');
  });

  it('calls onChange even when pressing the already-selected pill', async () => {
    const onChange = jest.fn();
    await render(<ActivityTypePicker value="run" onChange={onChange} />);

    fireEvent.press(screen.getByTestId('activity-type-picker-run'));

    expect(onChange).toHaveBeenCalledWith('run');
  });
});
