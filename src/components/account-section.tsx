import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { AccountSectionStatus, AuthUser, SignInFailureReason } from '@/auth/auth-types';
import { Avatar } from '@/components/ui/avatar';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type AccountSectionProps = {
  status: AccountSectionStatus;
  user: AuthUser | null;
  signInError: SignInFailureReason | null;
  onSignIn: () => void;
  onSignOut: () => void;
};

// Renders null for 'checking' — identical convention to
// HealthConnectSection, so a cold-start auth restore never flashes a
// signed-out state before settling. Reuses HealthConnectSection's exact
// chrome (label-caps header above one surface/outline/md-radius container)
// so the two sections read as one consistent "settings section" list. See
// SPEC.md's Interfaces/API copy/control table.
export function AccountSection({
  status,
  user,
  signInError,
  onSignIn,
  onSignOut,
}: AccountSectionProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  if (status === 'checking') {
    return null;
  }

  let content: ReactNode;

  switch (status) {
    case 'signedOut':
      content = (
        <SignInPrompt
          title={t('account.signedOut.title')}
          body={t('account.signedOut.body')}
          actionLabel={t('account.signedOut.signInAction')}
          onPress={onSignIn}
          theme={theme}
        />
      );
      break;
    case 'signingIn':
      content = (
        <SignInPrompt
          title={t('account.signedOut.title')}
          body={t('account.signedOut.body')}
          actionLabel={t('account.signingIn')}
          onPress={onSignIn}
          theme={theme}
          disabled
        />
      );
      break;
    case 'error':
      content = (
        <>
          <ThemedText variant="titleSm" color="onSurface">
            {t('account.signedOut.title')}
          </ThemedText>
          <ThemedText variant="bodySm" color="danger">
            {t(`account.error.${signInError ?? 'unknown'}.body`)}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={onSignIn}
            testID="account-sign-in-action"
            style={[
              styles.primaryButton,
              { backgroundColor: theme.colors.primary, borderRadius: theme.rounded.md },
            ]}
          >
            <ThemedText variant="actionSm" color="onPrimary">
              {t('account.error.retryAction')}
            </ThemedText>
          </Pressable>
        </>
      );
      break;
    case 'signedIn':
      content = (
        <View style={styles.identityRow}>
          <Avatar size="lg" initial={(user?.displayName ?? user?.email ?? '?')[0]} />
          <View style={styles.identityText}>
            <ThemedText variant="titleMd">{user?.displayName ?? user?.email}</ThemedText>
            {user?.email != null && (
              <ThemedText variant="dataSm" color="onSurfaceDim">
                {user.email}
              </ThemedText>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onSignOut}
            testID="account-sign-out-action"
          >
            <ThemedText variant="actionSm" color="primary">
              {t('account.signedIn.signOutAction')}
            </ThemedText>
          </Pressable>
        </View>
      );
      break;
  }

  return (
    <View style={styles.section}>
      <ThemedText variant="labelCaps" color="onSurfaceFaint">
        {t('account.sectionHeader')}
      </ThemedText>
      <ThemedView
        background="surface"
        style={[
          styles.container,
          { borderColor: theme.colors.outline, borderRadius: theme.rounded.md },
        ]}
      >
        {content}
      </ThemedView>
    </View>
  );
}

// The signedOut/signingIn shape: a title, a muted body, then the filled
// primary sign-in button — HealthConnectSection's notGranted button style.
// Same title/body for both statuses (unchanged, so the explanation doesn't
// flicker) — only the button's label/disabled state differs.
function SignInPrompt({
  title,
  body,
  actionLabel,
  onPress,
  theme,
  disabled,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
  disabled?: boolean;
}) {
  return (
    <>
      <ThemedText variant="titleSm" color="onSurface">
        {title}
      </ThemedText>
      <ThemedText variant="bodySm" color="onSurfaceMuted">
        {body}
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        disabled={disabled}
        testID="account-sign-in-action"
        style={[
          styles.primaryButton,
          { backgroundColor: theme.colors.primary, borderRadius: theme.rounded.md },
        ]}
      >
        <ThemedText variant="actionSm" color="onPrimary">
          {actionLabel}
        </ThemedText>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  container: {
    borderWidth: 1,
    padding: spacing.lg,
    gap: 10,
  },
  primaryButton: {
    height: 44,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  identityText: {
    flex: 1,
    gap: 3,
  },
});
