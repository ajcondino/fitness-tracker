import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { WeightPrompt } from '@/components/weight-prompt';

describe('<WeightPrompt />', () => {
  it('renders nothing when not visible', async () => {
    await render(
      <WeightPrompt visible={false} unit="metric" onSave={jest.fn()} onDismiss={jest.fn()} />,
    );
    expect(screen.queryByTestId('weight-prompt-field')).toBeNull();
  });

  it('saves then dismisses', async () => {
    const onSave = jest.fn().mockResolvedValue({ status: 'written' });
    const onDismiss = jest.fn();
    await render(<WeightPrompt visible unit="metric" onSave={onSave} onDismiss={onDismiss} />);

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('weight-prompt-field'), '70');
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('weight-prompt-submit'));
    });

    expect(onSave).toHaveBeenCalledWith(70);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('"Not now" dismisses without saving', async () => {
    const onSave = jest.fn();
    const onDismiss = jest.fn();
    await render(<WeightPrompt visible unit="metric" onSave={onSave} onDismiss={onDismiss} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('weight-prompt-dismiss'));
    });

    expect(onSave).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not save or dismiss on invalid input', async () => {
    const onSave = jest.fn();
    const onDismiss = jest.fn();
    await render(<WeightPrompt visible unit="metric" onSave={onSave} onDismiss={onDismiss} />);
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('weight-prompt-field'), '5');
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('weight-prompt-submit'));
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
