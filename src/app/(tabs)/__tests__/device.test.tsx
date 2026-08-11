import { render, screen } from '@testing-library/react-native';

import Device from '@/app/(tabs)/device';
import type { BlePermissionStatus } from '@/hooks/use-ble-permission-status';
import { useBlePermissionStatus } from '@/hooks/use-ble-permission-status';

jest.mock('@/hooks/use-ble-permission-status');

const mockedUseBlePermissionStatus = useBlePermissionStatus as jest.MockedFunction<
  typeof useBlePermissionStatus
>;

function mockStatus(status: BlePermissionStatus) {
  mockedUseBlePermissionStatus.mockReturnValue({
    status,
    requestAccess: jest.fn(),
    openSettings: jest.fn(),
  });
}

const NOT_GRANTED_STATUSES: BlePermissionStatus[] = [
  'undetermined',
  'requesting',
  'partial-scan-only',
  'partial-connect-only',
  'denied',
  'blocked',
];

describe('<Device />', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('keeps the existing header copy', async () => {
    mockStatus('undetermined');

    await render(<Device />);

    expect(screen.getByText('Device')).toBeOnTheScreen();
    expect(screen.getByText('Pair and manage your heart-rate monitor.')).toBeOnTheScreen();
  });

  it('shows the NEARBY DEVICES section, empty, only when granted', async () => {
    mockStatus('granted');

    await render(<Device />);

    expect(screen.getByText('NEARBY DEVICES')).toBeOnTheScreen();
    expect(screen.getByText('No devices found yet.')).toBeOnTheScreen();
  });

  it.each(NOT_GRANTED_STATUSES)(
    'hides the NEARBY DEVICES section entirely when %s',
    async (status) => {
      mockStatus(status);

      await render(<Device />);

      expect(screen.queryByText('NEARBY DEVICES')).toBeNull();
      expect(screen.queryByText('No devices found yet.')).toBeNull();
    },
  );

  it('shows the granted empty copy for PREVIOUSLY PAIRED when granted', async () => {
    mockStatus('granted');

    await render(<Device />);

    expect(screen.getByText('PREVIOUSLY PAIRED')).toBeOnTheScreen();
    expect(screen.getByText('No previously paired devices yet.')).toBeOnTheScreen();
  });

  it.each(NOT_GRANTED_STATUSES)(
    'shows the no-access empty copy for PREVIOUSLY PAIRED when %s',
    async (status) => {
      mockStatus(status);

      await render(<Device />);

      expect(screen.getByText('PREVIOUSLY PAIRED')).toBeOnTheScreen();
      expect(
        screen.getByText('Grant Bluetooth access to see previously paired devices.'),
      ).toBeOnTheScreen();
    },
  );
});
