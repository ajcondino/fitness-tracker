import { render, screen } from '@testing-library/react-native';

import { colors, typography } from '@/constants/theme';
import { ThemedText } from '@/components/ui/themed-text';

// `fontWeight` is never forwarded to the rendered style: each variant's
// `fontFamily` already points at the specific static font file for that
// weight, and re-requesting a weight on top of it breaks Android's custom
// font lookup (see themed-text.tsx).
function withoutFontWeight(variant: (typeof typography)[keyof typeof typography]) {
  const { fontWeight: _fontWeight, ...rest } = variant;
  return rest;
}

describe('<ThemedText />', () => {
  it('defaults to the bodyMd variant and onSurface color', async () => {
    await render(<ThemedText>Hello</ThemedText>);

    const node = screen.getByText('Hello');
    expect(node.props.style).toEqual(
      expect.arrayContaining([withoutFontWeight(typography.bodyMd), { color: colors.onSurface }]),
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
      expect.arrayContaining([withoutFontWeight(typography.h1), { color: colors.danger }]),
    );
  });

  it('lets a passed-in style win over the token defaults', async () => {
    await render(<ThemedText style={{ color: 'purple' }}>Override</ThemedText>);

    const node = screen.getByText('Override');
    expect(node.props.style[node.props.style.length - 1]).toEqual({ color: 'purple' });
  });
});
