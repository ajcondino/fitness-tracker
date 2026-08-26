import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HealthConnectSection } from '@/components/health-connect-section';
import { Avatar } from '@/components/ui/avatar';
import { BackButton } from '@/components/ui/back-button';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { spacing } from '@/constants/theme';
import { useHealthConnectSettings } from '@/hooks/use-health-connect-settings';
import { useTheme } from '@/hooks/use-theme';

// Mocked — there's no user/auth-profile feature yet. Source all three from
// the signed-in user once that feature lands (mirrors index.tsx's own
// MOCK_USER_NAME/MOCK_USER_INITIAL note).
const MOCK_USER_INITIAL = 'A';
const MOCK_USER_NAME = 'AJ';
const MOCK_USER_EMAIL = 'aj@pulse.app';

// Header (back chevron, title) plus the identity block, then whichever
// settings sections exist — currently just Health Connect. No other
// profile content — per CLAUDE.md's "don't invent cross-cutting
// structure," a Units section isn't built yet, so it isn't listed here.
export default function Profile() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useTheme();
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
      <View style={styles.header}>
        <BackButton
          accessibilityLabel={t('profile.back')}
          onPress={() => router.back()}
          testID="profile-back"
        />

        <ThemedText variant="h2" accessibilityRole="header">
          {t('profile.title')}
        </ThemedText>
      </View>

      <View style={styles.identity}>
        <Avatar size="lg" initial={MOCK_USER_INITIAL} />
        <View style={styles.identityText}>
          <ThemedText variant="titleMd">{MOCK_USER_NAME}</ThemedText>
          <ThemedText variant="dataSm" color="onSurfaceDim">
            {MOCK_USER_EMAIL}
          </ThemedText>
        </View>
      </View>

      <HealthConnectSection
        status={status}
        onGrantAccess={grantAccess}
        onToggleWriteBack={setWriteBackEnabled}
        onOpenHealthConnectApp={openHealthConnectApp}
        onOpenSecuritySettings={openSecuritySettings}
        onOpenPlayStore={openPlayStore}
      />

      <Pressable
        accessibilityRole="button"
        testID="profile-sign-out"
        // No-op: there's no auth feature to sign out of yet. Stubbed so
        // the control renders per the mock without pretending to work.
        onPress={() => {}}
        style={[
          styles.signOut,
          {
            backgroundColor: theme.colors.surfaceRaised,
            borderRadius: theme.rounded.lg,
            borderColor: theme.colors.outline,
          },
        ]}
      >
        <ThemedText variant="actionSm" color="onSurfaceMuted">
          {t('profile.signOut')}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  identityText: {
    gap: 3,
  },
  signOut: {
    height: 52,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
  },
});
