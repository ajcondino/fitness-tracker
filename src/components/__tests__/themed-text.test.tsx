import { render, screen } from '@testing-library/react-native';

import { colors, typography } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';

describe('<ThemedText />', () => {
  it('defaults to the bodyMd variant and onSurface color', async () => {
    await render(<ThemedText>Hello</ThemedText>);

    const node = screen.getByText('Hello');
    expect(node.props.style).toEqual(
      expect.arrayContaining([typography.bodyMd, { color: colors.onSurface }]),
    );
  });

  it('applies the requested variant and color tokens', async () => {
    await render(
      <ThemedText variant="h1" color="danger">
        Alert
      </ThemedText>,
    );

    const node = screen.getByText('Alert');
    expect(node.props.style).toEqual(
      expect.arrayContaining([typography.h1, { color: colors.danger }]),
    );
  });

  it('lets a passed-in style win over the token defaults', async () => {
    await render(<ThemedText style={{ color: 'purple' }}>Override</ThemedText>);

    const node = screen.getByText('Override');
    expect(node.props.style[node.props.style.length - 1]).toEqual({ color: 'purple' });
  });
});
