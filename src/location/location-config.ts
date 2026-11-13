// The ONE place the GPS sampling interval lives — see
// docs/specs/foreground-location-gps-sampling/SPEC.md's Interfaces/API for
// why 5 s. Retuning is a one-line change here.
export const LOCATION_SAMPLE_INTERVAL_MS = 5_000;
