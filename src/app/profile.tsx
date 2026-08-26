import { Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HealthConnectSection } from '@/components/health-connect-section';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { spacing } from '@/constants/theme';
import { useHealthConnectSettings } from '@/hooks/use-health-connect-settings';

// A minimal screen: back chevron (session/[id].tsx's exact pattern), title,
// then the Health Connect section. No other profile content — per
// CLAUDE.md's "don't invent cross-cutting structure," this ticket's only
// content requirement is the Health Connect section.
export default function Profile() {
  const router = useRouter();
  const { t } = useTranslation();
  // This screen is a top-level Stack.Screen sibling of (tabs), so it never
  // renders the floating tab bar and is responsible for its own bottom
  // safe-area inset — mirrors session/[id].tsx's own note.
  const insets = useSafeAreaInsets();
  const {
    status,
    grantAccess,
    setWriteBackEnabled,
    openHealthConnectApp,
    openSecuritySettings,
    openPlayStore,
  } = useHealthConnectSettings();

  return (
    <ThemedView style={[styles.container, { paddingBottom: spacing.xl + insets.bottom }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('profile.back')}
        onPress={() => router.back()}
        testID="profile-back"
        style={styles.backButton}
      >
        <ThemedText variant="titleMd" color="onSurfaceDim">
          ‹
        </ThemedText>
      </Pressable>

      <ThemedText variant="h2" accessibilityRole="header">
        {t('profile.title')}
      </ThemedText>

      <HealthConnectSection
        status={status}
        onGrantAccess={grantAccess}
        onToggleWriteBack={setWriteBackEnabled}
        onOpenHealthConnectApp={openHealthConnectApp}
        onOpenSecuritySettings={openSecuritySettings}
        onOpenPlayStore={openPlayStore}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
});
