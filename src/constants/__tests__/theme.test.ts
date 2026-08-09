import { colors, layout, rounded, spacing, theme, typography } from '@/constants/theme';

describe('theme tokens', () => {
  it('has exactly the color tokens defined in DESIGN.md', () => {
    expect(Object.keys(colors)).toHaveLength(25);
    expect(colors.primary).toBe('#F5C518');
    expect(colors.onPrimary).toBe('#141414');
    expect(colors.background).toBe('#0F0F10');
  });

  it('has exactly the typography scales defined in DESIGN.md', () => {
    expect(Object.keys(typography)).toHaveLength(21);

    Object.values(typography).forEach((scale) => {
      expect(scale.fontFamily).toBeTruthy();
      expect(typeof scale.fontSize).toBe('number');
      expect(scale.fontWeight).toBeTruthy();
    });

    // fontFamily is the font file's own PostScript name (e.g. `Archivo-ExtraBold`),
    // not the bare `Archivo` family DESIGN.md's YAML lists — see theme.ts's
    // comment above `typography` for why per-weight static fonts need this.
    expect(typography.displayXl).toMatchObject({
      fontFamily: 'Archivo-ExtraBold',
      fontSize: 132,
      fontWeight: 800,
      lineHeight: 138,
      letterSpacing: -6,
    });
    // h3 has no lineHeight in the source — must not be invented.
    expect(typography.h3.lineHeight).toBeUndefined();
  });

  it('has exactly the spacing steps defined in DESIGN.md', () => {
    expect(spacing).toEqual({ xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 });
  });

  it('has exactly the corner radii defined in DESIGN.md', () => {
    expect(rounded).toEqual({ sm: 12, md: 16, lg: 18, xl: 22, full: 999 });
  });

  it('has exactly the tab bar layout tokens defined in DESIGN.md', () => {
    expect(layout).toEqual({
      tabBarHeight: 64,
      tabBarHorizontalInset: 24,
      tabBarBottomOffset: 16,
      tabBarClearance: 104,
    });
  });

  it('composes a single flat theme object with no light/dark split', () => {
    expect(theme).toEqual({ colors, typography, spacing, rounded, layout });
  });
});
