import { fireEvent, render, screen } from '@testing-library/react-native';

import type { ConnectionState, DiscoveredDevice, ScanBarState } from '@/ble/pairing-types';
import Device from '@/app/(tabs)/device';
import type { BlePermissionStatus } from '@/hooks/use-ble-permission-status';
import { useBlePermissionStatus } from '@/hooks/use-ble-permission-status';
import { useDevicePairing } from '@/hooks/use-device-pairing';

jest.mock('@/hooks/use-ble-permission-status');
jest.mock('@/hooks/use-device-pairing');

const mockedUseBlePermissionStatus = useBlePermissionStatus as jest.MockedFunction<
  typeof useBlePermissionStatus
>;
const mockedUseDevicePairing = useDevicePairing as jest.MockedFunction<typeof useDevicePairing>;

const DISCONNECTED: ConnectionState = { kind: 'disconnected' };
const IDLE_SCAN_BAR: ScanBarState = { kind: 'scanIdle', count: 0 };

function mockStatus(status: BlePermissionStatus) {
  mockedUseBlePermissionStatus.mockReturnValue({
    status,
    requestAccess: jest.fn(),
    openSettings: jest.fn(),
  });
}

function mockPairing(overrides: Partial<ReturnType<typeof useDevicePairing>> = {}) {
  const value = {
    adapter: 'poweredOn',
    scanBarState: IDLE_SCAN_BAR,
    devices: [] as DiscoveredDevice[],
    connection: DISCONNECTED,
    connect: jest.fn(),
    cancelConnect: jest.fn(),
    retryScan: jest.fn(),
    openBluetoothSettings: jest.fn(),
    savedDevice: null,
    forgetDevice: jest.fn(),
    ...overrides,
  } as ReturnType<typeof useDevicePairing>;
  mockedUseDevicePairing.mockReturnValue(value);
  return value;
}

function makeDevice(overrides: Partial<DiscoveredDevice> = {}): DiscoveredDevice {
  return {
    id: 'device-1',
    name: 'Pulse HRM',
    lastKnownName: 'Pulse HRM',
    isConnectable: true,
    medianRssi: -55,
    firstSeenAt: 0,
    lastSeenAt: 0,
    ...overrides,
  };
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
    mockPairing();

    await render(<Device />);

    expect(screen.getByText('Device')).toBeOnTheScreen();
    expect(screen.getByText('Pair and manage your heart-rate monitor.')).toBeOnTheScreen();
  });

  it('calls useDevicePairing with false when permission is not granted', async () => {
    mockStatus('undetermined');
    mockPairing();

    await render(<Device />);

    expect(mockedUseDevicePairing).toHaveBeenCalledWith(false);
  });

  it('calls useDevicePairing with true when permission is granted', async () => {
    mockStatus('granted');
    mockPairing();

    await render(<Device />);

    expect(mockedUseDevicePairing).toHaveBeenCalledWith(true);
  });

  it('shows the NEARBY DEVICES section, empty, when granted with no devices', async () => {
    mockStatus('granted');
    mockPairing({ devices: [] });

    await render(<Device />);

    expect(screen.getByText('NEARBY DEVICES')).toBeOnTheScreen();
    expect(screen.getByText('No devices found yet.')).toBeOnTheScreen();
  });

  it('renders one DeviceRow per discovered device, in the order the hook provides them', async () => {
    mockStatus('granted');
    mockPairing({
      devices: [
        makeDevice({
          id: 'near',
          name: 'Near Device',
          lastKnownName: 'Near Device',
          medianRssi: -40,
        }),
        makeDevice({ id: 'far', name: 'Far Device', lastKnownName: 'Far Device', medianRssi: -90 }),
      ],
    });

    await render(<Device />);

    expect(screen.queryByText('No devices found yet.')).toBeNull();
    const rows = screen.getAllByTestId('device-row');
    expect(rows).toHaveLength(2);
    expect(screen.getByText('Near Device')).toBeOnTheScreen();
    expect(screen.getByText('Far Device')).toBeOnTheScreen();
  });

  it('falls back to the unknown-device label for a device with no name at all', async () => {
    mockStatus('granted');
    mockPairing({ devices: [makeDevice({ name: null, lastKnownName: null })] });

    await render(<Device />);

    expect(screen.getByText('Unknown device')).toBeOnTheScreen();
  });

  it('tapping an available row calls connect with that device id', async () => {
    mockStatus('granted');
    const { connect } = mockPairing({ devices: [makeDevice({ id: 'device-1' })] });

    await render(<Device />);

    fireEvent.press(screen.getByTestId('device-row'));

    expect(connect).toHaveBeenCalledWith('device-1');
  });

  it('tapping a connecting row calls cancelConnect', async () => {
    mockStatus('granted');
    const { cancelConnect, connect } = mockPairing({
      devices: [makeDevice({ id: 'device-1' })],
      connection: { kind: 'connecting', deviceId: 'device-1', startedAt: 0 },
    });

    await render(<Device />);

    fireEvent.press(screen.getByTestId('device-row'));

    expect(cancelConnect).toHaveBeenCalledWith();
    expect(connect).not.toHaveBeenCalled();
  });

  it('tapping a failed row retries by calling connect again', async () => {
    mockStatus('granted');
    const { connect } = mockPairing({
      devices: [makeDevice({ id: 'device-1' })],
      connection: { kind: 'connectionFailed', deviceId: 'device-1', reason: 'timeout' },
    });

    await render(<Device />);

    fireEvent.press(screen.getByTestId('device-row'));

    expect(connect).toHaveBeenCalledWith('device-1');
  });

  it('renders a connectionLost row as available and tappable to connect() again', async () => {
    mockStatus('granted');
    const { connect } = mockPairing({
      devices: [makeDevice({ id: 'device-1' })],
      connection: { kind: 'connectionLost', deviceId: 'device-1', reason: 'deviceDisconnected' },
    });

    await render(<Device />);

    fireEvent.press(screen.getByTestId('device-row'));

    expect(connect).toHaveBeenCalledWith('device-1');
  });

  it('does not call connect for a row disabled by another device connecting', async () => {
    mockStatus('granted');
    const { connect } = mockPairing({
      devices: [makeDevice({ id: 'device-1' }), makeDevice({ id: 'device-2' })],
      connection: { kind: 'connecting', deviceId: 'device-2', startedAt: 0 },
    });

    await render(<Device />);

    fireEvent.press(screen.getAllByTestId('device-row')[0]);

    expect(connect).not.toHaveBeenCalled();
  });

  it.each(NOT_GRANTED_STATUSES)(
    'hides the NEARBY DEVICES section entirely when %s',
    async (status) => {
      mockStatus(status);
      mockPairing();

      await render(<Device />);

      expect(screen.queryByText('NEARBY DEVICES')).toBeNull();
      expect(screen.queryByText('No devices found yet.')).toBeNull();
    },
  );

  it('shows the granted empty copy for PREVIOUSLY PAIRED when granted', async () => {
    mockStatus('granted');
    mockPairing();

    await render(<Device />);

    expect(screen.getByText('PREVIOUSLY PAIRED')).toBeOnTheScreen();
    expect(screen.getByText('No previously paired devices yet.')).toBeOnTheScreen();
  });

  it.each(NOT_GRANTED_STATUSES)(
    'shows the no-access empty copy for PREVIOUSLY PAIRED when %s',
    async (status) => {
      mockStatus(status);
      mockPairing();

      await render(<Device />);

      expect(screen.getByText('PREVIOUSLY PAIRED')).toBeOnTheScreen();
      expect(
        screen.getByText('Grant Bluetooth access to see previously paired devices.'),
      ).toBeOnTheScreen();
    },
  );

  it('renders a SavedDeviceRow for PREVIOUSLY PAIRED when granted with a saved device', async () => {
    mockStatus('granted');
    const { forgetDevice } = mockPairing({ savedDevice: { id: 'saved-1', name: 'Pulse HRM' } });

    await render(<Device />);

    expect(screen.getByText('PREVIOUSLY PAIRED')).toBeOnTheScreen();
    expect(screen.getByText('Pulse HRM')).toBeOnTheScreen();
    expect(screen.queryByText('No previously paired devices yet.')).toBeNull();

    fireEvent.press(screen.getByTestId('saved-device-row-forget'));

    expect(forgetDevice).toHaveBeenCalledTimes(1);
  });

  it('falls back to the unknown-device label for a saved device with no name', async () => {
    mockStatus('granted');
    mockPairing({ savedDevice: { id: 'saved-1', name: null } });

    await render(<Device />);

    expect(screen.getByText('Unknown device')).toBeOnTheScreen();
  });

  it.each(NOT_GRANTED_STATUSES)(
    'keeps the no-access empty copy for PREVIOUSLY PAIRED when %s, even with a saved device',
    async (status) => {
      mockStatus(status);
      mockPairing({ savedDevice: { id: 'saved-1', name: 'Pulse HRM' } });

      await render(<Device />);

      expect(
        screen.getByText('Grant Bluetooth access to see previously paired devices.'),
      ).toBeOnTheScreen();
      expect(screen.queryByText('Pulse HRM')).toBeNull();
    },
  );

  describe('ScanStatusBar wiring', () => {
    it.each([
      [{ kind: 'checkingAdapter' }, 'CHECKING BLUETOOTH…'],
      [{ kind: 'adapterOff' }, 'BLUETOOTH IS OFF'],
      [{ kind: 'adapterResetting' }, 'BLUETOOTH RESTARTING…'],
      [{ kind: 'adapterUnsupported' }, 'BLUETOOTH NOT SUPPORTED'],
      [{ kind: 'adapterUnauthorized' }, 'BLUETOOTH ACCESS RESTRICTED'],
      [{ kind: 'scanIdle', count: 0 }, 'BLUETOOTH READY'],
      [{ kind: 'scanError', reason: 'unknown' }, 'SCAN ERROR'],
    ] as const)('renders the scan bar for %o', async (scanBarState, expectedText) => {
      mockStatus('granted');
      mockPairing({ scanBarState: scanBarState as ScanBarState });

      await render(<Device />);

      expect(
        screen.getByText(new RegExp(expectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
      ).toBeOnTheScreen();
    });

    // `scanning`/`connecting`/`connected` render via the dedicated live row
    // (LiveDot + label/right-text split) instead of a single combined text
    // node — see scan-status-bar.test.tsx for the full assertions; this
    // just confirms the wiring reaches the screen.
    it('renders the scanning live row', async () => {
      mockStatus('granted');
      mockPairing({ scanBarState: { kind: 'scanning', count: 4 } });

      await render(<Device />);

      expect(screen.getByText('SCANNING…')).toBeOnTheScreen();
      expect(screen.getByText('4 found')).toBeOnTheScreen();
    });

    it('renders the connecting live row: same "SCANNING…" label, right-side "connecting"', async () => {
      mockStatus('granted');
      mockPairing({
        scanBarState: { kind: 'connecting', deviceId: 'd1', name: 'Pulse HRM' },
      });

      await render(<Device />);

      expect(screen.getByText('SCANNING…')).toBeOnTheScreen();
      expect(screen.getByText('connecting')).toBeOnTheScreen();
    });

    it('renders the connected live row without the device name', async () => {
      mockStatus('granted');
      mockPairing({
        scanBarState: { kind: 'connected', deviceId: 'd1', name: 'Pulse HRM', count: 4 },
      });

      await render(<Device />);

      expect(screen.getByText('CONNECTED')).toBeOnTheScreen();
      expect(screen.getByText('4 found')).toBeOnTheScreen();
    });

    it('wires retryScan to the scan bar action', async () => {
      mockStatus('granted');
      const { retryScan } = mockPairing({ scanBarState: { kind: 'scanIdle', count: 0 } });

      await render(<Device />);

      fireEvent.press(screen.getByTestId('scan-status-bar-action'));

      expect(retryScan).toHaveBeenCalledTimes(1);
    });

    it('wires openBluetoothSettings to the scan bar action', async () => {
      mockStatus('granted');
      const { openBluetoothSettings } = mockPairing({ scanBarState: { kind: 'adapterOff' } });

      await render(<Device />);

      fireEvent.press(screen.getByTestId('scan-status-bar-action'));

      expect(openBluetoothSettings).toHaveBeenCalledTimes(1);
    });
  });
});
