import { render, screen } from '@testing-library/react-native';

import { ConnectivityBanner } from '@/components/connectivity-banner';

describe('<ConnectivityBanner />', () => {
  it('renders nothing when isOffline is false', async () => {
    await render(<ConnectivityBanner isOffline={false} />);

    expect(screen.queryByTestId('connectivity-banner')).not.toBeOnTheScreen();
    expect(screen.queryByText('OFFLINE')).not.toBeOnTheScreen();
  });

  it('renders the dot-glyph + OFFLINE copy when isOffline is true', async () => {
    await render(<ConnectivityBanner isOffline={true} />);

    expect(screen.getByTestId('connectivity-banner')).toBeOnTheScreen();
    expect(screen.getByText('● OFFLINE')).toBeOnTheScreen();
  });
});
