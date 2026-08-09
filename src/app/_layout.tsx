import '@/i18n';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import * as Sentry from '@sentry/react-native';

import { useTheme } from '@/hooks/use-theme';

export { ErrorBoundary } from '@/components/error-boundary';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  sendDefaultPii: true,
  enableLogs: true,
});

function RootLayout() {
  const theme = useTheme();

  return (
    <SafeAreaProvider>
      {/*
        Bottom edge intentionally excluded: the floating tab bar (TabBar) owns
        the bottom safe-area inset itself via useSafeAreaInsets, since it's
        pinned above the gesture area rather than flush with it. Consuming
        'bottom' here too would double the inset. Any future non-tab screen
        pushed on this Stack is responsible for its own bottom inset.
      */}
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <StatusBar style="light" />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(RootLayout);
