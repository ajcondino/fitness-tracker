import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Toggle } from '@/components/ui/toggle';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { UnitSystem } from '@/units/units';

export type UnitsSectionProps = {
  distance: UnitSystem;
  weight: UnitSystem;
  onSetDistanceUnit: (system: UnitSystem) => void;
  onSetWeightUnit: (system: UnitSystem) => void;
};

// Same label-caps header + surface/outline/md-radius card chrome as
// HealthConnectSection. Unlike that section, there's no derived status to
// switch on — both rows always render, each an independent metric/imperial
// toggle. See SPEC.md's Interfaces/API.
export function UnitsSection({
  distance,
  weight,
  onSetDistanceUnit,
  onSetWeightUnit,
}: UnitsSectionProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <View style={styles.section}>
      <ThemedText variant="labelCaps" color="onSurfaceFaint">
        {t('units.sectionHeader')}
      </ThemedText>
      <ThemedView
        background="surface"
        style={[
          styles.container,
          { borderColor: theme.colors.outline, borderRadius: theme.rounded.md },
        ]}
      >
        <UnitRow
          label={t('units.distance.label')}
          caption={t(
            distance === 'imperial'
              ? 'units.distance.imperialCaption'
              : 'units.distance.metricCaption',
          )}
          value={distance === 'imperial'}
          onValueChange={(useImperial) => onSetDistanceUnit(useImperial ? 'imperial' : 'metric')}
          accessibilityLabel={t('units.distance.toggleLabel')}
          testID="units-distance-toggle"
        />
        <UnitRow
          label={t('units.weight.label')}
          caption={t(
            weight === 'imperial' ? 'units.weight.imperialCaption' : 'units.weight.metricCaption',
          )}
          value={weight === 'imperial'}
          onValueChange={(useImperial) => onSetWeightUnit(useImperial ? 'imperial' : 'metric')}
          accessibilityLabel={t('units.weight.toggleLabel')}
          testID="units-weight-toggle"
        />
      </ThemedView>
    </View>
  );
}

function UnitRow({
  label,
  caption,
  value,
  onValueChange,
  accessibilityLabel,
  testID,
}: {
  label: string;
  caption: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  testID: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <ThemedText variant="titleSm" color="onSurface">
          {label}
        </ThemedText>
        <ThemedText variant="dataSm" color="onSurfaceMuted">
          {caption}
        </ThemedText>
      </View>
      <Toggle
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      />
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
});
