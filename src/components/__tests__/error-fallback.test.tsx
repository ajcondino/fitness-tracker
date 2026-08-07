import { fireEvent, render, screen } from '@testing-library/react-native';

import { ErrorFallback } from '@/components/error-fallback';

describe('<ErrorFallback />', () => {
  it('renders the error message', async () => {
    await render(<ErrorFallback error={new Error('Boom')} retry={jest.fn()} />);

    expect(screen.getByText('Boom')).toBeOnTheScreen();
  });

  it('calls retry when the retry button is pressed', async () => {
    const retry = jest.fn();
    await render(<ErrorFallback error={new Error('Boom')} retry={retry} />);

    fireEvent.press(screen.getByTestId('error-fallback-retry'));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
