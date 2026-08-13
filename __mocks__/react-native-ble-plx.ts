export enum State {
  Unknown = 'Unknown',
  Resetting = 'Resetting',
  Unsupported = 'Unsupported',
  Unauthorized = 'Unauthorized',
  PoweredOff = 'PoweredOff',
  PoweredOn = 'PoweredOn',
}

// Only the codes this ticket's code actually reads — the real module exports
// far more.
export const BleErrorCode = {
  BluetoothPoweredOff: 102,
  DeviceConnectionFailed: 200,
  DeviceNotFound: 204,
  ScanStartFailed: 600,
  LocationServicesDisabled: 601,
} as const;

export class BleManager {
  state = jest.fn().mockResolvedValue(State.PoweredOn);
  onStateChange = jest.fn();
  startDeviceScan = jest.fn();
  stopDeviceScan = jest.fn();
  connectToDevice = jest.fn();
  cancelDeviceConnection = jest.fn();
  isDeviceConnected = jest.fn().mockResolvedValue(false);
  discoverAllServicesAndCharacteristicsForDevice = jest.fn();
  monitorCharacteristicForDevice = jest.fn();
  destroy = jest.fn();
}
