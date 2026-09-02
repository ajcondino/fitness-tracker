import { convertUnit, formatUnit } from '@/units/units';

describe('convertUnit', () => {
  it('returns distance unchanged for metric (passthrough)', () => {
    expect(convertUnit(5000, 'distance', 'metric')).toBe(5000);
  });

  it('returns weight unchanged for metric (passthrough)', () => {
    expect(convertUnit(70, 'weight', 'metric')).toBe(70);
  });

  it('converts meters to miles for imperial distance', () => {
    // 1609.344 m is exactly one mile.
    expect(convertUnit(1609.344, 'distance', 'imperial')).toBe(1);
  });

  it('converts kilograms to pounds for imperial weight', () => {
    expect(convertUnit(100, 'weight', 'imperial')).toBeCloseTo(220.46226218, 6);
  });
});

describe('formatUnit', () => {
  it('formats metric distance with 2 decimals and the km suffix', () => {
    expect(formatUnit(5000, 'distance', 'metric')).toBe('5000.00 km');
  });

  it('formats imperial distance with 2 decimals and the mi suffix', () => {
    expect(formatUnit(5000, 'distance', 'imperial')).toBe('3.11 mi');
  });

  it('formats metric weight with 1 decimal and the kg suffix', () => {
    expect(formatUnit(70, 'weight', 'metric')).toBe('70.0 kg');
  });

  it('formats imperial weight with 1 decimal and the lb suffix', () => {
    expect(formatUnit(70, 'weight', 'imperial')).toBe('154.3 lb');
  });
});
