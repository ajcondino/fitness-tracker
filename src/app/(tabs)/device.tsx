import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { spacing } from '@/constants/theme';

export default function Device() {
  const { t } = useTranslation();

  return (
    <ThemedView style={styles.container}>
      {/* See index.tsx for why these sibling tab stubs share the h2 role. */}
      <ThemedText variant="h2">{t('tabs.device')}</ThemedText>
      <ThemedText variant="bodyMd" color="onSurfaceMuted" style={styles.subtitle}>
        {t('tabs.deviceSubtitle')}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  subtitle: {
    marginTop: spacing.sm,
  },
});
