// The ONE place the GPS sampling interval lives — see
// docs/specs/foreground-location-gps-sampling/SPEC.md's Interfaces/API for
// why 5 s. Retuning is a one-line change here.
export const LOCATION_SAMPLE_INTERVAL_MS = 5_000;

// Two consecutive route points further apart in time than this are treated as
// a break in the route (GPS loss), not a continuous stretch — see
// docs/specs/route-polyline-session-summary/SPEC.md. 4× the interval: one or
// two late fixes don't fragment a healthy route, ~4 missed fixes do.
export const ROUTE_GAP_THRESHOLD_MS = 4 * LOCATION_SAMPLE_INTERVAL_MS;
