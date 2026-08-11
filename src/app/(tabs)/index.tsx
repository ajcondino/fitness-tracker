import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { DeviceCard } from '@/components/device-card';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function Index() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();

  const goToDevice = () => router.navigate('/device');

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

      <View style={styles.content}>
        {/* There's no real connection state yet — both this card and the
            hero button below are fixed to their disconnected copy until the
            follow-up scanning/connection ticket threads live state through. */}
        <DeviceCard
          status="disconnected"
          title={t('home.deviceCard.title')}
          subtitle={t('home.deviceCard.subtitle')}
          onPress={goToDevice}
        />

        <Pressable
          accessibilityRole="button"
          onPress={goToDevice}
          testID="home-hero-cta"
          style={({ pressed }) => [
            styles.heroButton,
            {
              backgroundColor: theme.colors.primary,
              borderRadius: theme.rounded.xl,
              opacity: pressed ? 0.82 : 1,
            },
          ]}
        >
          <View style={[styles.heroTriangle, { borderLeftColor: theme.colors.onPrimary }]} />
          <ThemedText variant="actionLg" color="onPrimary">
            {t('home.connectCta')}
          </ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
  },
  subtitle: {
    marginTop: spacing.sm,
  },
  content: {
    marginTop: spacing.xl,
    gap: spacing.lg,
  },
  heroButton: {
    height: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  heroTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderLeftWidth: 12,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
});
