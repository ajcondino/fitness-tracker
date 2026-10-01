import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/ui/themed-text';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ACTIVITY_TYPES } from '@/workout/workout-record';
import type { ActivityType } from '@/workout/workout-record';

export type ActivityTypePickerProps = {
  value: ActivityType;
  onChange: (type: ActivityType) => void;
};

// Feature-level component (not a `ui/` primitive) shown on Live Workout
// before Start. Selected-pill styling reuses DeviceChip's `reconnecting`
// treatment — border + text shifted to `primary`, no solid fill — so this
// screen doesn't gain a second solid-yellow element alongside its START
// button. See SPEC.md's Interfaces/API.
export function ActivityTypePicker({ value, onChange }: ActivityTypePickerProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <View>
      <ThemedText variant="labelCaps" color="onSurfaceFaint" style={styles.header}>
        {t('liveWorkout.activityPicker.header')}
      </ThemedText>
      <View style={styles.row}>
        {ACTIVITY_TYPES.map((type) => {
          const selected = type === value;
          return (
            <Pressable
              key={type}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              testID={`activity-type-picker-${type}`}
              onPress={() => onChange(type)}
              style={[
                styles.pill,
                {
                  backgroundColor: selected ? theme.colors.surfaceRaised : theme.colors.surface,
                  borderColor: selected ? theme.colors.primary : theme.colors.outline,
                  borderRadius: theme.rounded.full,
                },
              ]}
            >
              <ThemedText
                variant="dataMd"
                color={selected ? 'primary' : 'onSurfaceChip'}
                style={styles.label}
              >
                {t(`activityType.${type}`)}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  label: {
    textTransform: 'uppercase',
  },
});
