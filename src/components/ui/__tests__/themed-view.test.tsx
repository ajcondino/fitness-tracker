import { render, screen } from '@testing-library/react-native';

import { colors } from '@/constants/theme';
import { ThemedView } from '@/components/ui/themed-view';

describe('<ThemedView />', () => {
  it('defaults to the background color token', async () => {
    await render(<ThemedView testID="view" />);

    const node = screen.getByTestId('view');
    expect(node.props.style).toEqual(
      expect.arrayContaining([{ backgroundColor: colors.background }]),
    );
  });

  it('applies the requested background token', async () => {
    await render(<ThemedView testID="view" background="surfaceRaised" />);

    const node = screen.getByTestId('view');
    expect(node.props.style).toEqual(
      expect.arrayContaining([{ backgroundColor: colors.surfaceRaised }]),
    );
  });

  it('lets a passed-in style win over the token default', async () => {
    await render(<ThemedView testID="view" style={{ backgroundColor: 'purple' }} />);

    const node = screen.getByTestId('view');
    expect(node.props.style[node.props.style.length - 1]).toEqual({
      backgroundColor: 'purple',
    });
  });
});
