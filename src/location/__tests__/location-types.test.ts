import { deriveLocationStatus } from '@/location/location-types';
import type { LocationStatusInput } from '@/location/location-types';

function derive(overrides: Partial<LocationStatusInput> = {}) {
  return deriveLocationStatus({
    permission: 'granted',
    servicesEnabled: true,
    phase: 'running',
    hasFixThisStretch: false,
    ...overrides,
  });
}

describe('deriveLocationStatus', () => {
  it('is idle before permission has been requested', () => {
    expect(derive({ permission: 'undetermined' })).toBe('idle');
  });

  it('is requesting while the OS dialog is up', () => {
    expect(derive({ permission: 'requesting', phase: 'running' })).toBe('requesting');
  });

  it('is permission-denied when asked and refused', () => {
    expect(derive({ permission: 'denied' })).toBe('permission-denied');
  });

  it('is permission-denied-permanently when blocked', () => {
    expect(derive({ permission: 'blocked' })).toBe('permission-denied-permanently');
  });

  it('is gps-unavailable when granted and running but services are off', () => {
    expect(derive({ servicesEnabled: false })).toBe('gps-unavailable');
  });

  it('is acquiring-fix when granted and running with no fix yet this stretch', () => {
    expect(derive({ hasFixThisStretch: false })).toBe('acquiring-fix');
  });

  it('is sampling once a fix has arrived this stretch', () => {
    expect(derive({ hasFixThisStretch: true })).toBe('sampling');
  });

  it.each(['idle', 'paused', 'ended'] as const)(
    'is idle when granted but the session is %s',
    (phase) => {
      expect(derive({ phase, hasFixThisStretch: true, servicesEnabled: false })).toBe('idle');
    },
  );
});
