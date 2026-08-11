import { fireEvent, render, screen } from '@testing-library/react-native';

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
