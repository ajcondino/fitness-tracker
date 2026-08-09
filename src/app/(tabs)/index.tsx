import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { spacing } from '@/constants/theme';

export default function Index() {
  const { t } = useTranslation();

  return (
    <ThemedView style={styles.container}>
      {/* DESIGN.md's hierarchy table only names a heading role for Home (h1,
          "Home greeting") and History/Device ("Pairing, History" -> h2). Using
          h2 for all three sibling tab stubs; h1 stays reserved for a future
          personalized Home greeting rather than this plain screen title. */}
      <ThemedText variant="h2">{t('tabs.home')}</ThemedText>
      <ThemedText variant="bodyMd" color="onSurfaceMuted" style={styles.subtitle}>
        {t('tabs.homeSubtitle')}
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
