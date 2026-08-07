import '@/i18n';

import { Stack } from 'expo-router';

import * as Sentry from '@sentry/react-native';

export { ErrorBoundary } from '@/components/error-boundary';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  sendDefaultPii: true,
  enableLogs: true,
});

function RootLayout() {
  return <Stack />;
}

export default Sentry.wrap(RootLayout);
