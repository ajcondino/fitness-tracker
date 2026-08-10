export enum State {
  Unknown = 'Unknown',
  Resetting = 'Resetting',
  Unsupported = 'Unsupported',
  Unauthorized = 'Unauthorized',
  PoweredOff = 'PoweredOff',
  PoweredOn = 'PoweredOn',
}

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
