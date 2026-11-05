import type { SessionPhase } from '@/hooks/use-workout-session';

/**
 * Framework-free (no expo-location/React import): types and pure derivation
 * only, mirroring `pairing-types.ts`'s "framework-free, pure derivations"
 * layer.
 */

export type LocationPermissionResult = 'granted' | 'denied' | 'blocked';

export type LocationTrackingStatus =
  | 'idle' // session not running or no permission request made yet and nothing to show
  | 'requesting' // OS dialog is up
  | 'permission-denied' // asked, refused, can ask again
  | 'permission-denied-permanently' // refused with "don't ask again"; only Settings recovers
  | 'gps-unavailable' // permission granted but location services off / provider errors
  | 'acquiring-fix' // permission granted, running, no fix yet in the current running stretch
  | 'sampling'; // fixes arriving

export type LocationStatusInput = {
  permission: 'undetermined' | 'requesting' | LocationPermissionResult;
  servicesEnabled: boolean;
  phase: SessionPhase;
  hasFixThisStretch: boolean;
};

export function deriveLocationStatus({
  permission,
  servicesEnabled,
  phase,
  hasFixThisStretch,
}: LocationStatusInput): LocationTrackingStatus {
  switch (permission) {
    case 'requesting':
      return 'requesting';
    case 'denied':
      return 'permission-denied';
    case 'blocked':
      return 'permission-denied-permanently';
    case 'undetermined':
      return 'idle';
    case 'granted':
      // Nothing is sampled (and nothing is worth saying) outside a running
      // stretch — a paused/ended/idle session just shows no status.
      if (phase !== 'running') {
        return 'idle';
      }
      if (!servicesEnabled) {
        return 'gps-unavailable';
      }
      return hasFixThisStretch ? 'sampling' : 'acquiring-fix';
  }
}
