import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountSection } from '@/components/account-section';
import { HealthConnectSection } from '@/components/health-connect-section';
import { UnitsSection } from '@/components/units-section';
import { BackButton } from '@/components/ui/back-button';
import { Screen } from '@/components/ui/screen';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useHealthConnectSettings } from '@/hooks/use-health-connect-settings';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { usePreferencesSync } from '@/hooks/use-preferences-sync';
import { useUnitsPreference } from '@/hooks/use-units-preference';

// Header (back chevron, title), then whichever settings sections exist —
// Account (unlabeled — its own identity row makes the section self-evident,
// see account-section.tsx), Health Connect, and Units.
export default function Profile() {
  const router = useRouter();
  const { t } = useTranslation();
  // This screen is a top-level Stack.Screen sibling of (tabs), so it never
  // renders the floating tab bar and is responsible for its own bottom
  // safe-area inset — mirrors session/[id].tsx's own note.
  const insets = useSafeAreaInsets();
  const { status: authStatus, user, signInWithGoogle, signOut } = useAuth();
  const { isOffline } = useNetworkStatus();
  const {
    status,
    grantAccess,
    setWriteBackEnabled,
    openHealthConnectApp,
    openSecuritySettings,
    openPlayStore,
  } = useHealthConnectSettings();
  const { distance, weight, setDistanceUnit, setWeightUnit } = useUnitsPreference();
  usePreferencesSync({
    authStatus,
    uid: user?.uid ?? null,
    distance,
    weight,
    setDistanceUnit,
    setWeightUnit,
  });

  return (
    <ThemedView style={[styles.container, { paddingBottom: spacing.xl + insets.bottom }]}>
      <Screen style={styles.screen}>
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
          isOffline={isOffline}
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

        <UnitsSection
          distance={distance}
          weight={weight}
          onSetDistanceUnit={setDistanceUnit}
          onSetWeightUnit={setWeightUnit}
        />
      </Screen>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
  },
  // <Screen> is the new flex column ancestor of the header/sections (see
  // docs/specs/tablet-layout/SPEC.md) — the `spacing.xl` rhythm between them
  // moves here from `container`, which now has a single child.
  screen: {
    gap: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
});
