import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { SessionSummary } from '@/components/session-summary';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { spacing } from '@/constants/theme';
import type { WorkoutRecord } from '@/workout/workout-record';
import { loadWorkoutSession } from '@/workout/workout-store';

// History-detail route: loads one saved record independently by `id`, so it
// works from a deep link or a cold start, not only when navigated to from a
// still-mounted History list. See docs/specs/session-summary/SPEC.md's
// Context for why this doesn't reuse whatever list navigated here.
export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  // Mirrors live-workout.tsx's own note: this screen is a top-level
  // Stack.Screen sibling of (tabs), so it never renders the floating tab
  // bar and is responsible for its own bottom safe-area inset.
  const insets = useSafeAreaInsets();

  // undefined = loading; null = not found or failed to load; WorkoutRecord =
  // loaded — same three-state pattern history.tsx/index.tsx already use for
  // their own loads.
  const [record, setRecord] = useState<WorkoutRecord | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setRecord(undefined);
    loadWorkoutSession(id).then((loaded) => {
      if (!cancelled) setRecord(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const goBack = () => router.back();
  const goHome = () => router.replace('/');

  if (record === undefined) {
    // No spinner — matches history.tsx's own "renders nothing further while
    // loading" convention.
    return (
      <ThemedView
        testID="session-detail-container"
        style={[styles.container, { paddingBottom: spacing.xl + insets.bottom }]}
      />
    );
  }

  if (record === null) {
    return (
      <ThemedView
        testID="session-detail-container"
        style={[styles.container, { paddingBottom: spacing.xl + insets.bottom }]}
      >
        <Pressable
          accessibilityRole="button"
          onPress={goBack}
          testID="session-detail-back"
          style={styles.backButton}
        >
          <ThemedText variant="titleMd" color="onSurfaceDim">
            ‹
          </ThemedText>
        </Pressable>
        <ThemedText variant="bodyMd" color="onSurfaceMuted">
          {t('sessionSummary.notFound')}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView
      testID="session-detail-container"
      style={[styles.container, { paddingBottom: spacing.xl + insets.bottom }]}
    >
      <SessionSummary mode="detail" record={record} onBack={goBack} onDone={goHome} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.md,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
});
