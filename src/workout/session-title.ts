import type { TFunction } from 'i18next';

import type { ActivityType, SessionTimeOfDay } from '@/workout/workout-record';

/**
 * Composes a session's display title from its time-of-day bucket and
 * activity type — shared by Live Workout's heading, Session Summary's hero
 * title, and every History/Recent row (via SessionRow's caller-formatted
 * titleLabel). Takes `t` as a parameter rather than calling
 * useTranslation() itself, so each caller can use its own already-obtained
 * `t` — this is why it isn't folded into workout-record.ts, which is
 * explicitly framework/service-free.
 */
export function deriveSessionTitle(
  timeOfDay: SessionTimeOfDay,
  activityType: ActivityType | null,
  t: TFunction,
): string {
  // 'other' gets the same generic word this app used everywhere before this
  // feature, not 'session' — that word is reserved for a genuinely
  // unrecorded (pre-ticket) session, so a deliberate "Other" pick never
  // reads as indistinguishable from one.
  let activity: string;
  if (activityType == null) {
    activity = t('sessionSummary.title.activityFallback');
  } else if (activityType === 'other') {
    activity = t('sessionSummary.title.otherActivity');
  } else {
    activity = t(`activityType.${activityType}`);
  }
  return t(`sessionSummary.title.${timeOfDay}`, { activity });
}
