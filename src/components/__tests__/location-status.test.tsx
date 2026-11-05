import { fireEvent, render, screen } from '@testing-library/react-native';

import { LocationStatus } from '@/components/location-status';
import type { LocationTrackingStatus } from '@/location/location-types';

const COPY: Record<Exclude<LocationTrackingStatus, 'idle'>, string> = {
  requesting: '● Waiting for location permission…',
  'permission-denied': '● Location off — no route will be recorded',
  'permission-denied-permanently': '● Location blocked — no route will be recorded',
  'gps-unavailable': '● GPS unavailable — turn on location services',
  'acquiring-fix': '● Acquiring GPS fix…',
  sampling: '● Recording route',
};

function renderStatus(status: LocationTrackingStatus) {
  const onRequestAccess = jest.fn();
  const onOpenSettings = jest.fn();
  const view = render(
    <LocationStatus
      status={status}
      onRequestAccess={onRequestAccess}
      onOpenSettings={onOpenSettings}
      testID="location-status"
    />,
  );
  return { view, onRequestAccess, onOpenSettings };
}

describe('<LocationStatus />', () => {
  it('renders nothing for idle', async () => {
    const { view } = renderStatus('idle');
    await view;

    expect(screen.queryByTestId('location-status')).toBeNull();
  });

  it.each(Object.entries(COPY))('renders distinct copy for %s', async (status, text) => {
    await renderStatus(status as LocationTrackingStatus).view;

    expect(screen.getByText(text)).toBeOnTheScreen();
  });

  it('has a distinct line for every status', () => {
    expect(new Set(Object.values(COPY)).size).toBe(Object.keys(COPY).length);
  });

  it('offers "Enable location" for permission-denied, wired to onRequestAccess', async () => {
    const { view, onRequestAccess, onOpenSettings } = renderStatus('permission-denied');
    await view;

    await fireEvent.press(screen.getByText('Enable location'));

    expect(onRequestAccess).toHaveBeenCalledTimes(1);
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it('offers "Open settings" for permission-denied-permanently, wired to onOpenSettings', async () => {
    const { view, onRequestAccess, onOpenSettings } = renderStatus('permission-denied-permanently');
    await view;

    await fireEvent.press(screen.getByText('Open settings'));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onRequestAccess).not.toHaveBeenCalled();
  });

  it.each(['requesting', 'gps-unavailable', 'acquiring-fix', 'sampling'] as const)(
    'offers no action for %s',
    async (status) => {
      await renderStatus(status).view;

      expect(screen.queryByTestId('location-status-action')).toBeNull();
    },
  );
});
