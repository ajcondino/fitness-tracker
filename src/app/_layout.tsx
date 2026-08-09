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
      <SafeAreaView
        edges={['top', 'bottom']}
        style={{ flex: 1, backgroundColor: theme.colors.background }}
      >
        <StatusBar style="light" />
        <Stack />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(RootLayout);
