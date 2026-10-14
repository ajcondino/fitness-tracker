import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { WeightInput } from '@/components/weight-input';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { WeightSyncOutcome } from '@/health/weight-sync';
import { formatUnit } from '@/units/units';
import type { UnitSystem } from '@/units/units';

export type WeightSectionProps = {
  latestKg: number | null | undefined;
  unit: UnitSystem;
  onSave: (kg: number) => Promise<WeightSyncOutcome>;
};

// `writeBackOff` is excluded: it never produces a notice.
type NoticeReason = Exclude<
  Extract<WeightSyncOutcome, { status: 'skipped' }>['reason'],
  'writeBackOff'
>;

// Same label-caps header + surface/outline/md-radius card chrome as
// UnitsSection. A skipped Health Connect write is a non-blocking notice
// line, not an error — the weight is always saved locally. `writeBackOff`
// shows nothing: it's the person's own setting.
export function WeightSection({ latestKg, unit, onSave }: WeightSectionProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [noticeReason, setNoticeReason] = useState<NoticeReason | null>(null);

  async function handleSave(kg: number) {
    const outcome = await onSave(kg);
    setNoticeReason(
      outcome.status === 'skipped' && outcome.reason !== 'writeBackOff' ? outcome.reason : null,
    );
  }

  return (
    <View style={styles.section}>
      <ThemedText variant="labelCaps" color="onSurfaceFaint">
        {t('weight.sectionHeader')}
      </ThemedText>
      <ThemedView
        background="surface"
        style={[
          styles.container,
          { borderColor: theme.colors.outline, borderRadius: theme.rounded.md },
        ]}
      >
        <View style={styles.current}>
          <ThemedText variant="titleSm" color="onSurface">
            {t('weight.current')}
          </ThemedText>
          <ThemedText variant="dataSm" color="onSurfaceMuted" testID="weight-current">
            {latestKg == null ? t('weight.none') : formatUnit(latestKg, 'weight', unit)}
          </ThemedText>
        </View>

        {/* Keyed on unit + latest so the field re-seeds when either changes. */}
        <WeightInput
          key={`${unit}-${latestKg ?? 'none'}`}
          unit={unit}
          initialKg={latestKg ?? null}
          onSubmit={handleSave}
          submitLabel={t('weight.save')}
          testIDPrefix="weight-section"
        />

        {noticeReason != null && (
          <ThemedText variant="bodySm" color="onSurfaceMuted" testID="weight-notice">
            {t(`weight.notice.${noticeReason}`)}
          </ThemedText>
        )}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  container: {
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  current: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
