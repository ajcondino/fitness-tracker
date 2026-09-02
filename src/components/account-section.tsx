import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { AccountSectionStatus, AuthUser } from '@/auth/auth-types';
import { AlertTriangleIcon } from '@/components/icons';
import { Avatar } from '@/components/ui/avatar';
import { GoogleLogo } from '@/components/ui/google-logo';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type AccountSectionProps = {
  status: AccountSectionStatus;
  user: AuthUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
};

// One unlabeled card — identity (avatar + name/email or a signed-out
// placeholder) is present in every state, so it reads as the section
// header on its own; no separate "ACCOUNT" label above it. State-specific
// content (sign-in CTA / spinner / error) renders below the identity row,
// inside the same card. Renders null for 'checking' — identical convention
// to HealthConnectSection, so a cold-start auth restore never flashes a
// signed-out state before settling.
export function AccountSection({ status, user, onSignIn, onSignOut }: AccountSectionProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  if (status === 'checking') {
    return null;
  }

  // Branch on this, not on `status === 'signedOut'` directly — checking/
  // signingIn/error must all read the same as signed-out in the identity
  // row (never an empty or broken-looking tile), and only 'signedIn' gets
  // the sign-out pill.
  const isSignedIn = status === 'signedIn';

  let stateContent: ReactNode = null;

  switch (status) {
    case 'signedOut':
      stateContent = (
        <>
          <ThemedText variant="bodySm" color="onSurfaceMuted" style={styles.bodyLineHeight}>
            {t('account.signedOut.body')}
          </ThemedText>
          <GoogleSignInButton onPress={onSignIn} theme={theme} />
        </>
      );
      break;
    case 'signingIn':
      stateContent = (
        <View style={styles.signingInRow}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <ThemedText variant="titleSm" color="onSurfaceMuted">
            {t('account.signingIn')}
          </ThemedText>
        </View>
      );
      break;
    case 'error':
      stateContent = (
        <>
          <View style={styles.errorHeaderRow}>
            <AlertTriangleIcon color={theme.colors.danger} size={18} />
            <ThemedText variant="titleSm" color="onSurface">
              {t('account.error.title')}
            </ThemedText>
          </View>
          <ThemedText variant="bodySm" color="onSurfaceMuted" style={styles.bodyLineHeight}>
            {t('account.error.body')}
          </ThemedText>
          <View style={styles.errorActionRow}>
            <Pressable
              accessibilityRole="button"
              onPress={onSignIn}
              testID="account-sign-in-action"
              style={[
                styles.button,
                styles.primaryButton,
                { flex: 1, backgroundColor: theme.colors.primary, borderRadius: theme.rounded.md },
              ]}
            >
              <ThemedText variant="actionSm" color="onPrimary">
                {t('account.error.retryAction')}
              </ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onSignOut}
              testID="account-dismiss-error-action"
              style={[
                styles.button,
                styles.outlinedButton,
                { borderColor: theme.colors.outlineEmphasis, borderRadius: theme.rounded.md },
              ]}
            >
              <ThemedText variant="actionSm" color="onSurfaceMuted">
                {t('account.error.dismissAction')}
              </ThemedText>
            </Pressable>
          </View>
        </>
      );
      break;
    case 'signedIn':
      // Nothing below the identity row — the card is just the one row.
      break;
  }

  return (
    <ThemedView
      background="surface"
      style={[styles.card, { borderColor: theme.colors.outline, borderRadius: theme.rounded.lg }]}
    >
      <View style={styles.identityRow}>
        {isSignedIn ? (
          <Avatar size="lg" initial={(user?.displayName ?? user?.email ?? '?')[0]} />
        ) : (
          <Avatar size="lg" variant="placeholder" />
        )}
        <View style={styles.identityText}>
          <ThemedText variant="titleMd" color="onSurface" numberOfLines={1}>
            {isSignedIn ? (user?.displayName ?? user?.email) : t('profile.identity.signedOutName')}
          </ThemedText>
          <ThemedText variant="dataSm" color="onSurfaceDim" numberOfLines={1}>
            {isSignedIn ? user?.email : t('profile.identity.signedOutMeta')}
          </ThemedText>
        </View>
        {isSignedIn && (
          <Pressable
            accessibilityRole="button"
            onPress={onSignOut}
            testID="account-sign-out-action"
            style={[
              styles.signOutPill,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderColor: theme.colors.outline,
                borderRadius: theme.rounded.full,
              },
            ]}
          >
            <ThemedText variant="actionSm" color="onSurfaceMuted">
              {t('account.signedIn.signOutAction')}
            </ThemedText>
          </Pressable>
        )}
      </View>

      {stateContent}
    </ThemedView>
  );
}

// A deliberate, narrow exception to DESIGN.md's "no second accent color" /
// "no white" rules (confirmed with the user before implementing) — Google's
// own sign-in button guidelines call for their exact mark on a light
// background, not a re-skinned single-color version. See google-logo.tsx.
function GoogleSignInButton({
  onPress,
  theme,
}: {
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID="account-sign-in-action"
      style={[styles.button, styles.googleButton, { borderRadius: theme.rounded.md }]}
    >
      <GoogleLogo size={18} />
      <ThemedText variant="actionSm" style={styles.googleButtonLabel}>
        {t('account.signedOut.signInAction')}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: spacing.lg,
    gap: 14,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  bodyLineHeight: {
    lineHeight: 21,
  },
  button: {
    height: 44,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primaryButton: {
    width: undefined,
  },
  // Fixed width, 1px border — height stays 44 like the filled button
  // alongside it (border is inset, not additive, so neither button is
  // taller than the other).
  outlinedButton: {
    width: 110,
    borderWidth: 1,
    boxSizing: 'border-box',
  },
  errorActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  errorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // Raw hex, deliberately not a theme token — see GoogleSignInButton's own
  // comment above. Google's official "Sign in with Google" button spec
  // fixes both this fill and this label color; there's no app token for
  // either (this app has no white/near-black tokens at all, per DESIGN.md's
  // "don't use white or pure black" rule), and inventing one for a single,
  // brand-mandated button would misrepresent it as a reusable design
  // decision rather than the one-off exception it is.
  googleButton: {
    backgroundColor: '#FFFFFF',
  },
  googleButtonLabel: {
    color: '#1F1F1F',
  },
  signingInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  signOutPill: {
    height: 30,
    flexShrink: 0,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
