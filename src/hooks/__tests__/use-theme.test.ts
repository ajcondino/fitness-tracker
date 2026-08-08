import { renderHook } from '@testing-library/react-native';

import { theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

describe('useTheme', () => {
  it('returns the single dark theme object, with no light/dark resolution', async () => {
    const { result } = await renderHook(() => useTheme());

    expect(result.current).toBe(theme);
  });
});
