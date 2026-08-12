import { fireEvent, render, screen } from '@testing-library/react-native';

import type { ScanBarState } from '@/ble/pairing-types';
import { ScanStatusBar } from '@/components/scan-status-bar';
import { colors } from '@/constants/theme';
import type { BlePermissionStatus } from '@/hooks/use-ble-permission-status';

type Row = {
  status: BlePermissionStatus;
  text: string;
  color: string;
  detail?: string;
  actionLabel?: string;
  actionTarget?: 'requestAccess' | 'openSettings';
};

// Mirrors SPEC.md's screen-states-and-copy table verbatim, including the
// `granted` row's deliberate placeholder text.
const ROWS: Row[] = [
  {
    status: 'undetermined',
    text: '○ BLUETOOTH ACCESS NEEDED',
    color: colors.onSurfaceFaint,
    actionLabel: 'GRANT ACCESS',
    actionTarget: 'requestAccess',
  },
  {
    status: 'requesting',
    text: '○ REQUESTING ACCESS…',
    color: colors.onSurfaceFaint,
  },
  {
    status: 'granted',
    text: '● BLUETOOTH ACCESS GRANTED',
    color: colors.success,
  },
  {
    status: 'partial-scan-only',
    text: "● CAN'T CONNECT TO DEVICES",
    color: colors.danger,
    detail: 'Bluetooth connect access is off.',
    actionLabel: 'TRY AGAIN',
    actionTarget: 'requestAccess',
  },
  {
    status: 'partial-connect-only',
    text: "● CAN'T SEE NEARBY DEVICES",
    color: colors.danger,
    detail: 'Bluetooth scan access is off.',
    actionLabel: 'TRY AGAIN',
    actionTarget: 'requestAccess',
  },
  {
    status: 'denied',
    text: '● BLUETOOTH ACCESS DENIED',
    color: colors.danger,
    actionLabel: 'TRY AGAIN',
    actionTarget: 'requestAccess',
  },
  {
    status: 'blocked',
    text: '● BLUETOOTH ACCESS BLOCKED',
    color: colors.danger,
    detail: 'Turn it on in system settings to continue.',
    actionLabel: 'OPEN SETTINGS',
    actionTarget: 'openSettings',
  },
];

describe('<ScanStatusBar />', () => {
  it.each(ROWS)('renders $status with its copy, color, and detail', async (row) => {
    await render(
      <ScanStatusBar status={row.status} onRequestAccess={jest.fn()} onOpenSettings={jest.fn()} />,
    );

    const node = screen.getByText(row.text);
    expect(node.props.style).toEqual(expect.arrayContaining([{ color: row.color }]));

    if (row.detail) {
      expect(screen.getByText(row.detail)).toBeOnTheScreen();
    }
  });

  it.each(ROWS.filter((row) => row.actionLabel))(
    'renders and wires the $actionLabel action for $status',
    async (row) => {
      const onRequestAccess = jest.fn();
      const onOpenSettings = jest.fn();
      await render(
        <ScanStatusBar
          status={row.status}
          onRequestAccess={onRequestAccess}
          onOpenSettings={onOpenSettings}
        />,
      );

      fireEvent.press(screen.getByTestId('scan-status-bar-action'));

      expect(screen.getByText(row.actionLabel!)).toBeOnTheScreen();
      if (row.actionTarget === 'openSettings') {
        expect(onOpenSettings).toHaveBeenCalledTimes(1);
        expect(onRequestAccess).not.toHaveBeenCalled();
      } else {
        expect(onRequestAccess).toHaveBeenCalledTimes(1);
        expect(onOpenSettings).not.toHaveBeenCalled();
      }
    },
  );

  it.each(ROWS.filter((row) => !row.actionLabel))('renders no action for $status', async (row) => {
    await render(
      <ScanStatusBar status={row.status} onRequestAccess={jest.fn()} onOpenSettings={jest.fn()} />,
    );

    expect(screen.queryByTestId('scan-status-bar-action')).toBeNull();
  });
});

type ScanBarRow = {
  scanBarState: ScanBarState;
  text: string;
  color: string;
  detail?: string;
  actionLabel?: string;
  actionTarget?: 'retryScan' | 'openBluetoothSettings';
};

// Mirrors SPEC.md's screen-states-and-copy table verbatim for every
// `ScanBarState.kind`, live once `status === 'granted'` and a `scanBarState`
// is supplied.
const SCAN_BAR_ROWS: ScanBarRow[] = [
  {
    scanBarState: { kind: 'checkingAdapter' },
    text: '○ CHECKING BLUETOOTH…',
    color: colors.onSurfaceFaint,
  },
  {
    scanBarState: { kind: 'adapterOff' },
    text: '● BLUETOOTH IS OFF',
    color: colors.danger,
    detail: 'Turn on Bluetooth to scan for devices.',
    actionLabel: 'TURN ON BLUETOOTH',
    actionTarget: 'openBluetoothSettings',
  },
  {
    scanBarState: { kind: 'adapterResetting' },
    text: '○ BLUETOOTH RESTARTING…',
    color: colors.onSurfaceFaint,
  },
  {
    scanBarState: { kind: 'adapterUnsupported' },
    text: '● BLUETOOTH NOT SUPPORTED',
    color: colors.danger,
    detail: "This device can't scan for Bluetooth peripherals.",
  },
  {
    scanBarState: { kind: 'adapterUnauthorized' },
    text: '● BLUETOOTH ACCESS RESTRICTED',
    color: colors.danger,
    detail: 'The system has restricted Bluetooth for this app.',
  },
  {
    scanBarState: { kind: 'scanning', count: 3 },
    text: '● SCANNING… / 3 FOUND',
    color: colors.success,
  },
  {
    scanBarState: { kind: 'scanIdle', count: 0 },
    text: '● BLUETOOTH READY',
    color: colors.onSurfaceMuted,
    actionLabel: 'SCAN AGAIN',
    actionTarget: 'retryScan',
  },
  {
    scanBarState: { kind: 'scanIdle', count: 2 },
    text: '● SCAN COMPLETE / 2 FOUND',
    color: colors.onSurfaceMuted,
    actionLabel: 'SCAN AGAIN',
    actionTarget: 'retryScan',
  },
  {
    scanBarState: { kind: 'scanError', reason: 'startFailed' },
    text: '● SCAN FAILED TO START',
    color: colors.danger,
    actionLabel: 'SCAN AGAIN',
    actionTarget: 'retryScan',
  },
  {
    scanBarState: { kind: 'scanError', reason: 'locationServicesDisabled' },
    text: '● LOCATION SERVICES OFF',
    color: colors.danger,
    detail: 'Turn on Location Services to scan for devices.',
    actionLabel: 'SCAN AGAIN',
    actionTarget: 'retryScan',
  },
  {
    scanBarState: { kind: 'scanError', reason: 'unknown' },
    text: '● SCAN ERROR',
    color: colors.danger,
    actionLabel: 'SCAN AGAIN',
    actionTarget: 'retryScan',
  },
  {
    scanBarState: { kind: 'connecting', deviceId: 'd1', name: 'Pulse HRM' },
    text: '○ CONNECTING TO Pulse HRM…',
    color: colors.primary,
  },
  {
    scanBarState: { kind: 'connected', deviceId: 'd1', name: 'Pulse HRM' },
    text: '● CONNECTED TO Pulse HRM',
    color: colors.success,
  },
];

describe('<ScanStatusBar /> granted / scanBarState', () => {
  it.each(SCAN_BAR_ROWS)(
    'renders $scanBarState.kind with its copy, color, and detail',
    async (row) => {
      await render(
        <ScanStatusBar
          status="granted"
          onRequestAccess={jest.fn()}
          onOpenSettings={jest.fn()}
          scanBarState={row.scanBarState}
          onRetryScan={jest.fn()}
          onOpenBluetoothSettings={jest.fn()}
        />,
      );

      const node = screen.getByText(row.text);
      expect(node.props.style).toEqual(expect.arrayContaining([{ color: row.color }]));

      if (row.detail) {
        expect(screen.getByText(row.detail)).toBeOnTheScreen();
      }
    },
  );

  it.each(SCAN_BAR_ROWS.filter((row) => row.actionLabel))(
    'renders and wires the $actionLabel action for $scanBarState.kind',
    async (row) => {
      const onRetryScan = jest.fn();
      const onOpenBluetoothSettings = jest.fn();
      await render(
        <ScanStatusBar
          status="granted"
          onRequestAccess={jest.fn()}
          onOpenSettings={jest.fn()}
          scanBarState={row.scanBarState}
          onRetryScan={onRetryScan}
          onOpenBluetoothSettings={onOpenBluetoothSettings}
        />,
      );

      fireEvent.press(screen.getByTestId('scan-status-bar-action'));

      expect(screen.getByText(row.actionLabel!)).toBeOnTheScreen();
      if (row.actionTarget === 'openBluetoothSettings') {
        expect(onOpenBluetoothSettings).toHaveBeenCalledTimes(1);
        expect(onRetryScan).not.toHaveBeenCalled();
      } else {
        expect(onRetryScan).toHaveBeenCalledTimes(1);
        expect(onOpenBluetoothSettings).not.toHaveBeenCalled();
      }
    },
  );

  it.each(SCAN_BAR_ROWS.filter((row) => !row.actionLabel))(
    'renders no action for $scanBarState.kind',
    async (row) => {
      await render(
        <ScanStatusBar
          status="granted"
          onRequestAccess={jest.fn()}
          onOpenSettings={jest.fn()}
          scanBarState={row.scanBarState}
        />,
      );

      expect(screen.queryByTestId('scan-status-bar-action')).toBeNull();
    },
  );

  it('falls back to the fixed granted copy when no scanBarState is passed', async () => {
    await render(
      <ScanStatusBar status="granted" onRequestAccess={jest.fn()} onOpenSettings={jest.fn()} />,
    );

    expect(screen.getByText('● BLUETOOTH ACCESS GRANTED')).toBeOnTheScreen();
    expect(screen.queryByTestId('scan-status-bar-action')).toBeNull();
  });
});
