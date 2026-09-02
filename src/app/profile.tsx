import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountSection } from '@/components/account-section';
import { HealthConnectSection } from '@/components/health-connect-section';
import { BackButton } from '@/components/ui/back-button';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useHealthConnectSettings } from '@/hooks/use-health-connect-settings';

// Header (back chevron, title) plus whichever settings sections exist —
// Account and Health Connect. No other profile content — per CLAUDE.md's
// "don't invent cross-cutting structure," a Units section isn't built yet,
// so it isn't listed here.
export default function Profile() {
  const router = useRouter();
  const { t } = useTranslation();
  // This screen is a top-level Stack.Screen sibling of (tabs), so it never
  // renders the floating tab bar and is responsible for its own bottom
  // safe-area inset — mirrors session/[id].tsx's own note.
  const insets = useSafeAreaInsets();
  const { status: authStatus, user, signInError, signInWithGoogle, signOut } = useAuth();
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

      <AccountSection
        status={authStatus}
        user={user}
        signInError={signInError}
        onSignIn={signInWithGoogle}
        onSignOut={signOut}
      />

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
    gap: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
});
