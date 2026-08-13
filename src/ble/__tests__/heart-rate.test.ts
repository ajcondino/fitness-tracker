import { parseHeartRateMeasurement } from '@/ble/heart-rate';

describe('parseHeartRateMeasurement', () => {
  it('parses a UInt8-flagged reading (flags=0x00, bpm=75)', () => {
    // Buffer.from([0x00, 0x4B]).toString('base64')
    expect(parseHeartRateMeasurement('AEs=')).toBe(75);
  });

  it('parses a little-endian UInt16-flagged reading (flags=0x01, bpm=300)', () => {
    // Buffer.from([0x01, 0x2C, 0x01]).toString('base64')
    expect(parseHeartRateMeasurement('ASwB')).toBe(300);
  });

  it('parses a UInt8-flagged bpm of 0', () => {
    // Buffer.from([0x00, 0x00]).toString('base64')
    expect(parseHeartRateMeasurement('AAA=')).toBe(0);
  });

  it('parses the max UInt16 bpm value', () => {
    // Buffer.from([0x01, 0xFF, 0xFF]).toString('base64')
    expect(parseHeartRateMeasurement('Af//')).toBe(65535);
  });

  it('returns null for null input', () => {
    expect(parseHeartRateMeasurement(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseHeartRateMeasurement(undefined)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseHeartRateMeasurement('')).toBeNull();
  });

  it('returns null for a UInt8-flagged value truncated to just the flags byte', () => {
    // Buffer.from([0x00]).toString('base64')
    expect(parseHeartRateMeasurement('AA==')).toBeNull();
  });

  it('returns null for a UInt16-flagged value truncated to flags + one byte', () => {
    // Buffer.from([0x01, 0x2C]).toString('base64')
    expect(parseHeartRateMeasurement('ASw=')).toBeNull();
  });

  it('never throws on garbage input', () => {
    expect(() => parseHeartRateMeasurement('not-valid-base64!!!')).not.toThrow();
  });
});
