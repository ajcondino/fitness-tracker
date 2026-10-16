import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/ui/themed-text';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { convertUnit, toCanonicalUnit } from '@/units/units';
import type { UnitSystem } from '@/units/units';
import { MAX_WEIGHT_KG, MIN_WEIGHT_KG } from '@/weight/weight-store';

export type WeightInputProps = {
  unit: UnitSystem;
  initialKg: number | null;
  onSubmit: (kg: number) => void;
  submitLabel: string;
  testIDPrefix: string;
};

const UNIT_LABEL: Record<UnitSystem, string> = { metric: 'kg', imperial: 'lb' };

// Accepts `,` or `.` as the decimal separator. Rejects anything that isn't a
// plain decimal number (so "12abc" is invalid rather than silently 12).
function parseDecimal(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

// Feature-level (not `ui/`): no shared text-input primitive exists, and
// creating one is a separate decision. Styled from DESIGN.md's `input-field`
// token. See docs/specs/weight-capture-health-connect/SPEC.md.
export function WeightInput({
  unit,
  initialKg,
  onSubmit,
  submitLabel,
  testIDPrefix,
}: WeightInputProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [text, setText] = useState(
    initialKg == null ? '' : convertUnit(initialKg, 'weight', unit).toFixed(1),
  );
  const [hasError, setHasError] = useState(false);
  // The value last saved (or initially shown); submit stays disabled until
  // the field differs from it, so the same weight can't be saved repeatedly.
  const [savedText, setSavedText] = useState(text);
  const isUnchanged = text === savedText;

  function handleSubmit() {
    if (isUnchanged) return;
    const typed = parseDecimal(text);
    // Validate after conversion so the bounds mean the same in both units.
    const kg = typed == null ? null : toCanonicalUnit(typed, 'weight', unit);
    if (kg == null || kg < MIN_WEIGHT_KG || kg > MAX_WEIGHT_KG) {
      setHasError(true);
      return;
    }
    setHasError(false);
    setSavedText(text);
    onSubmit(kg);
  }

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.field,
          {
            backgroundColor: theme.colors.surface,
            borderColor: hasError ? theme.colors.danger : theme.colors.outline,
            borderRadius: theme.rounded.md,
          },
        ]}
      >
        <TextInput
          testID={`${testIDPrefix}-field`}
          value={text}
          onChangeText={(next) => {
            setText(next);
            setHasError(false);
          }}
          keyboardType="decimal-pad"
          placeholder={t('weight.input.placeholder')}
          placeholderTextColor={theme.colors.onSurfaceFaint}
          accessibilityLabel={t('weight.input.label')}
          style={[theme.typography.bodyMd, styles.text, { color: theme.colors.onSurface }]}
        />
        <ThemedText variant="dataSm" color="onSurfaceMuted">
          {UNIT_LABEL[unit]}
        </ThemedText>
      </View>

      {hasError && (
        <ThemedText variant="bodySm" color="danger" testID={`${testIDPrefix}-error`}>
          {t('weight.input.error', {
            min: Math.round(convertUnit(MIN_WEIGHT_KG, 'weight', unit)),
            max: Math.round(convertUnit(MAX_WEIGHT_KG, 'weight', unit)),
            unit: UNIT_LABEL[unit],
          })}
        </ThemedText>
      )}

      <Pressable
        accessibilityRole="button"
        onPress={handleSubmit}
        disabled={isUnchanged}
        accessibilityState={{ disabled: isUnchanged }}
        testID={`${testIDPrefix}-submit`}
        style={({ pressed }) => [
          styles.submit,
          {
            backgroundColor: theme.colors.primary,
            borderRadius: theme.rounded.xl,
            opacity: pressed ? 0.82 : 1,
          },
          isUnchanged && styles.submitDisabled,
        ]}
      >
        <ThemedText variant="actionMd" color="onPrimary">
          {submitLabel}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  text: {
    flex: 1,
    paddingVertical: spacing.lg,
  },
  submit: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: {
    opacity: 0.4,
  },
});
