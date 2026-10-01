import type { TFunction } from 'i18next';

import { deriveSessionTitle } from '@/workout/session-title';

// Mirrors en.json's actual templates closely enough to prove interpolation
// wiring, without depending on the real i18n instance — a plain lookup
// table is enough here since deriveSessionTitle's only real branching is
// which key it asks for `activity`, not how i18next itself interpolates.
const STRINGS: Record<string, string> = {
  'sessionSummary.title.morning': 'Morning {{activity}}',
  'sessionSummary.title.afternoon': 'Afternoon {{activity}}',
  'sessionSummary.title.evening': 'Evening {{activity}}',
  'sessionSummary.title.night': 'Night {{activity}}',
  'sessionSummary.title.activityFallback': 'session',
  'sessionSummary.title.otherActivity': 'Workout',
  'activityType.run': 'Run',
  'activityType.walk': 'Walk',
  'activityType.cycle': 'Cycle',
  'activityType.strength': 'Strength',
  'activityType.other': 'Other',
};

const t = ((key: string, options?: { activity?: string }) => {
  const template = STRINGS[key];
  return options?.activity != null ? template.replace('{{activity}}', options.activity) : template;
}) as TFunction;

describe('deriveSessionTitle', () => {
  it('composes "<TimeOfDay> <Activity>" for a concrete activityType', () => {
    expect(deriveSessionTitle('morning', 'run', t)).toBe('Morning Run');
    expect(deriveSessionTitle('evening', 'cycle', t)).toBe('Evening Cycle');
  });

  it('uses "Workout" for the \'other\' activityType, not the literal "Other" label', () => {
    expect(deriveSessionTitle('afternoon', 'other', t)).toBe('Afternoon Workout');
  });

  it('uses the lowercase "session" fallback for a null (pre-ticket, unrecorded) activityType', () => {
    expect(deriveSessionTitle('night', null, t)).toBe('Night session');
  });

  it('interpolates into each of the four time-of-day templates', () => {
    expect(deriveSessionTitle('morning', 'walk', t)).toBe('Morning Walk');
    expect(deriveSessionTitle('afternoon', 'walk', t)).toBe('Afternoon Walk');
    expect(deriveSessionTitle('evening', 'walk', t)).toBe('Evening Walk');
    expect(deriveSessionTitle('night', 'walk', t)).toBe('Night Walk');
  });
});
