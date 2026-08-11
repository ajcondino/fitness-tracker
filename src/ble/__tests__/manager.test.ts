import { BleManager } from 'react-native-ble-plx';

import { bleManager } from '@/ble/manager';

describe('bleManager', () => {
  it('is constructed via BleManager', () => {
    expect(bleManager).toBeInstanceOf(BleManager);
  });

  it('is the same instance on every import', () => {
    const { bleManager: reImported } = require('@/ble/manager');

    expect(reImported).toBe(bleManager);
  });
});
