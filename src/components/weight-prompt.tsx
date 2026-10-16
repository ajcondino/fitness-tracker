import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/ui/themed-text';
import { WeightInput } from '@/components/weight-input';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { WeightSyncOutcome } from '@/health/weight-sync';
import type { UnitSystem } from '@/units/units';

export type WeightPromptProps = {
  visible: boolean;
  unit: UnitSystem;
  onSave: (kg: number) => Promise<WeightSyncOutcome>;
  onDismiss: () => void;
};

// One-time first-launch prompt. Saving and "Not now" both end in
// `onDismiss`, so the caller persists `weight.promptDismissed` in one place.
export function WeightPrompt({ visible, unit, onSave, onDismiss }: WeightPromptProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  async function handleSave(kg: number) {
    await onSave(kg);
    onDismiss();
  }

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onDismiss}>
      <View style={[styles.backdrop, { backgroundColor: theme.colors.backgroundDeep + 'CC' }]}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outline,
              borderRadius: theme.rounded.lg,
            },
          ]}
        >
          <ThemedText variant="titleMd" accessibilityRole="header">
            {t('weight.prompt.title')}
          </ThemedText>
          <ThemedText variant="bodyMd" color="onSurfaceMuted">
            {t('weight.prompt.body')}
          </ThemedText>

          <WeightInput
            unit={unit}
            initialKg={null}
            onSubmit={handleSave}
            submitLabel={t('weight.save')}
            testIDPrefix="weight-prompt"
          />

          <Pressable
            accessibilityRole="button"
            onPress={onDismiss}
            testID="weight-prompt-dismiss"
            style={styles.dismiss}
          >
            <ThemedText variant="actionSm" color="onSurfaceMuted">
              {t('weight.prompt.dismiss')}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    borderWidth: 1,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  dismiss: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
});
