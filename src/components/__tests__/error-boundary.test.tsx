import * as Sentry from '@sentry/react-native';
import { render, screen } from '@testing-library/react-native';

import { ErrorBoundary } from '@/components/error-boundary';

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
}));

describe('<ErrorBoundary />', () => {
  it('reports the error to Sentry and renders the fallback', async () => {
    const error = new Error('Boom');

    await render(<ErrorBoundary error={error} retry={jest.fn()} />);

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    expect(screen.getByText('Boom')).toBeOnTheScreen();
  });
});
