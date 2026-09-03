/**
 * Pure unit conversion + formatting — the single place any unit conversion
 * happens in the app. No imports: this module is a leaf with no dependency
 * on the rest of the codebase, so any future caller (GPS distance in
 * meters, a scale reading in kilograms) can use it standalone. See
 * SPEC.md's Interfaces/API.
 */

export type UnitSystem = 'metric' | 'imperial';
export type UnitQuantity = 'distance' | 'weight';

// `value` is always expressed in the quantity's canonical base unit —
// meters for 'distance', kilograms for 'weight'. The base unit *is* the
// metric display unit for both quantities chosen here, so metric is a
// passthrough; only imperial applies a conversion factor.
const IMPERIAL_FACTOR: Record<UnitQuantity, number> = {
  distance: 1 / 1609.344, // meters -> miles
  weight: 2.2046226218, // kilograms -> pounds
};

// Decimal precision per quantity, chosen for plausible display precision at
// the magnitudes each quantity is used at — not configurable, since no
// caller has asked for a different precision yet.
const DECIMALS: Record<UnitQuantity, number> = {
  distance: 2,
  weight: 1,
};

const UNIT_SUFFIX: Record<UnitQuantity, Record<UnitSystem, string>> = {
  distance: { metric: 'km', imperial: 'mi' },
  weight: { metric: 'kg', imperial: 'lb' },
};

// Assumes a finite, non-negative `value` — the caller's responsibility.
// No NaN/Infinity guard: deliberate, see SPEC.md's Constraints.
export function convertUnit(value: number, quantity: UnitQuantity, system: UnitSystem): number {
  if (system === 'metric') {
    return value;
  }
  return value * IMPERIAL_FACTOR[quantity];
}

export function formatUnit(value: number, quantity: UnitQuantity, system: UnitSystem): string {
  const converted = convertUnit(value, quantity, system);
  return `${converted.toFixed(DECIMALS[quantity])} ${UNIT_SUFFIX[quantity][system]}`;
}
