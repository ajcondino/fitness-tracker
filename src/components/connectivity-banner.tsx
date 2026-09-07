import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ConnectivityBannerProps = {
  isOffline: boolean;
};

// An edge-to-edge top strip — deliberately not a card (no horizontal inset,
// no rounded corners) so it reads as a system-level status rather than a
// piece of screen content. Reuses scan-status-bar.tsx's established "a
// status is a dot glyph plus a word, same color, actionSm" grammar rather
// than inventing a second one. Renders null when online: no space is
// reserved and there is no "you're connected" state.
export function ConnectivityBanner({ isOffline }: ConnectivityBannerProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  if (!isOffline) {
    return null;
  }

  return (
    <ThemedView
      background="surfaceMuted"
      style={[styles.container, { borderBottomColor: theme.colors.outlineSoft }]}
      testID="connectivity-banner"
    >
      <ThemedText variant="actionSm" color="onSurfaceMuted">
        ● {t('connectivity.offline')}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
});
