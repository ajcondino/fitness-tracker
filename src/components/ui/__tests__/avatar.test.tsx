import { render, screen } from '@testing-library/react-native';

import { Avatar } from '@/components/ui/avatar';

describe('<Avatar />', () => {
  it('renders the uppercase initial by default', async () => {
    await render(<Avatar size="sm" initial="a" testID="avatar" />);

    expect(screen.getByText('A')).toBeOnTheScreen();
  });

  it('renders the uppercase initial for the explicit initial variant', async () => {
    await render(<Avatar size="lg" variant="initial" initial="z" testID="avatar" />);

    expect(screen.getByText('Z')).toBeOnTheScreen();
  });

  it('renders a person-glyph placeholder instead of an initial when variant is placeholder', async () => {
    await render(<Avatar size="sm" variant="placeholder" testID="avatar" />);

    expect(screen.queryByText(/./)).not.toBeOnTheScreen();
    expect(screen.getByTestId('avatar')).toBeOnTheScreen();
  });

  it('renders the same tile testID regardless of variant', async () => {
    const { unmount } = await render(<Avatar size="lg" initial="a" testID="avatar" />);
    expect(screen.getByTestId('avatar')).toBeOnTheScreen();
    unmount();

    await render(<Avatar size="lg" variant="placeholder" testID="avatar" />);
    expect(screen.getByTestId('avatar')).toBeOnTheScreen();
  });
});
