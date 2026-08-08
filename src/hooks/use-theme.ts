import { theme, type Theme } from '@/constants/theme';

/**
 * Pulse is dark-only (see app.json's `userInterfaceStyle: "dark"`), so this
 * hook has no light/dark resolution to do — it exists purely as the single
 * seam components consume, in case theming ever needs to become dynamic.
 */
export function useTheme(): Theme {
  return theme;
}
