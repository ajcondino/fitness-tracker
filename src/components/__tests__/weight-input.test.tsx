import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { WeightInput } from '@/components/weight-input';

async function setup(props: Partial<React.ComponentProps<typeof WeightInput>> = {}) {
  const onSubmit = jest.fn();
  await render(
    <WeightInput
      unit="metric"
      initialKg={null}
      onSubmit={onSubmit}
      submitLabel="SAVE"
      testIDPrefix="w"
      {...props}
    />,
  );
  return { onSubmit };
}

async function type(text: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('w-field'), text);
  });
}

async function submit() {
  await act(async () => {
    fireEvent.press(screen.getByTestId('w-submit'));
  });
}

describe('<WeightInput />', () => {
  it('submits kg unchanged for metric', async () => {
    const { onSubmit } = await setup();
    await type('70');
    await submit();
    expect(onSubmit).toHaveBeenCalledWith(70);
  });

  it('converts lb to canonical kg for imperial', async () => {
    const { onSubmit } = await setup({ unit: 'imperial' });
    await type('154.3');
    await submit();
    expect(onSubmit.mock.calls[0][0]).toBeCloseTo(69.99, 2);
  });

  it('accepts a comma decimal separator', async () => {
    const { onSubmit } = await setup();
    await type('70,5');
    await submit();
    expect(onSubmit).toHaveBeenCalledWith(70.5);
  });

  it('seeds the field from initialKg in the display unit at 1 decimal', async () => {
    await setup({ unit: 'imperial', initialKg: 70 });
    expect(screen.getByTestId('w-field').props.value).toBe('154.3');
    expect(screen.getByText('lb')).toBeOnTheScreen();
  });

  it.each(['abc', '12abc', '7', '700'])('rejects %p with an inline error', async (text) => {
    const { onSubmit } = await setup();
    await type(text);
    await submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('w-error')).toBeOnTheScreen();
  });

  it('disables submit until the value differs from the initial one', async () => {
    const { onSubmit } = await setup({ initialKg: 70 });
    expect(screen.getByTestId('w-submit').props.accessibilityState.disabled).toBe(true);
    await submit();
    expect(onSubmit).not.toHaveBeenCalled();

    await type('71');
    expect(screen.getByTestId('w-submit').props.accessibilityState.disabled).toBe(false);
  });

  it('disables submit again after saving until the value is edited', async () => {
    const { onSubmit } = await setup();
    expect(screen.getByTestId('w-submit').props.accessibilityState.disabled).toBe(true);

    await type('70');
    await submit();
    await submit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('w-submit').props.accessibilityState.disabled).toBe(true);

    await type('71');
    expect(screen.getByTestId('w-submit').props.accessibilityState.disabled).toBe(false);
  });

  it('validates after conversion: 40 lb (~18.1 kg) fails, 50 lb (~22.7 kg) passes', async () => {
    const { onSubmit } = await setup({ unit: 'imperial' });
    await type('40'); // ~18.1 kg < 20
    await submit();
    expect(onSubmit).not.toHaveBeenCalled();

    await type('50'); // ~22.7 kg
    await submit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('clears the error once the person edits the text', async () => {
    await setup();
    await type('7');
    await submit();
    expect(screen.getByTestId('w-error')).toBeOnTheScreen();
    await type('70');
    expect(screen.queryByTestId('w-error')).toBeNull();
  });
});
