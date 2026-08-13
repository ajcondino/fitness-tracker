/**
 * Framework-free types, constants, and pure parsing for the Bluetooth GATT
 * Heart Rate Service (`0x180D`) / Heart Rate Measurement characteristic
 * (`0x2A37`). No BLE, Zustand, or React import — matching
 * `pairing-types.ts`'s "framework-free, pure derivations" layer.
 */

export const HEART_RATE_SERVICE_UUID = '180D';
export const HEART_RATE_MEASUREMENT_UUID = '2A37';

/** How long since the last valid HR notification before the screen reports
 * "signal lost." Not specified by the ticket brief — this spec's own
 * default, chosen from typical HR monitor broadcast behavior: chest-strap
 * monitors implementing the standard BLE HRM profile notify at ~1 Hz;
 * optical wrist units are commonly slower and less regular (up to ~1 per
 * 1-2s). 3000ms absorbs one or two missed/delayed notifications (radio
 * jitter, a connection-interval hiccup) without a false "signal lost" flash,
 * while still surfacing a genuine drop well within a few seconds of it
 * happening — the same "spec picks a working default, flagged as a
 * decision, trivially retunable" treatment `ble-device-scanning` gave
 * `SCAN_TIMEOUT_MS`/`CONNECT_TIMEOUT_MS`. */
export const HR_STALE_THRESHOLD_MS = 3_000;

/** How often the hook polls elapsed-time-since-last-reading to decide
 * staleness. Cheap, and frequent enough that "signal lost" appears within
 * half a second of crossing the threshold. */
export const HR_STALE_CHECK_INTERVAL_MS = 500;

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Standard base64 (`A–Z`, `a–z`, `0–9`, `+`, `/`, `=` padding) to a byte
 * array. Stops at the first `=` padding character (or the end of input) and
 * discards any leftover bits that don't complete a full byte — the same
 * effect as the spec's "4 chars -> 3 bytes, one `=` -> 2 bytes, two `=` ->
 * 1 byte" rule, without needing to special-case group boundaries. Unknown
 * characters (whitespace, corruption) are skipped rather than throwing, so
 * malformed input degrades to "fewer decoded bytes," not an exception.
 */
function decodeBase64(input: string): number[] {
  const bytes: number[] = [];
  let buffer = 0;
  let bitsCollected = 0;

  for (const char of input) {
    if (char === '=') break;
    const value = BASE64_ALPHABET.indexOf(char);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bitsCollected += 6;
    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      bytes.push((buffer >> bitsCollected) & 0xff);
    }
  }

  return bytes;
}

/**
 * Parses the Heart Rate Measurement characteristic (`0x2A37`) per the
 * Bluetooth GATT spec: byte 0 is a Flags field; bit 0 of Flags is the Heart
 * Rate Value Format bit — `0` means the BPM value is a single `UInt8` at
 * byte offset 1, `1` means it's a little-endian `UInt16` across byte
 * offsets 1–2. The remaining Flags bits (Sensor Contact Status, Energy
 * Expended Status present, RR-Interval present) are not parsed — they only
 * affect where fields *after* the BPM field start, never the BPM field's
 * own offset or width, and this ticket reads only the BPM.
 *
 * Never throws: returns `null` for `null`/`undefined` input, or if the
 * decoded byte array is too short to contain the BPM field its own flags
 * byte claims.
 */
export function parseHeartRateMeasurement(value: string | null | undefined): number | null {
  if (value == null) return null;

  const bytes = decodeBase64(value);
  if (bytes.length < 1) return null;

  const isUint16 = (bytes[0] & 0x01) === 1;

  if (isUint16) {
    if (bytes.length < 3) return null;
    return bytes[1] | (bytes[2] << 8);
  }

  if (bytes.length < 2) return null;
  return bytes[1];
}
