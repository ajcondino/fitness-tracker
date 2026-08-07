import { useEffect } from 'react';

import * as Sentry from '@sentry/react-native';
import { type ErrorBoundaryProps } from 'expo-router';

import { ErrorFallback } from '@/components/error-fallback';

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return <ErrorFallback error={error} retry={retry} />;
}
