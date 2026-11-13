import type { RoutePoint, WorkoutPause } from '@/workout/workout-record';

// Framework-free route geometry for the session summary's route map. See
// docs/specs/route-polyline-session-summary/SPEC.md.

export type RouteSegment = RoutePoint[]; // consecutive points with no gap between them; length >= 1

export type RouteRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export const ROUTE_MIN_POINTS = 2;
// ≈ 220 m of latitude: floor so a stationary / 2-identical-point route still
// frames a street rather than a point.
export const MIN_REGION_DELTA = 0.002;
// Bounding box × 1.3 so the line and markers never touch the card edge.
export const REGION_PADDING_FACTOR = 1.3;

export function isRouteUsable(route: RoutePoint[]): boolean {
  return route.length >= ROUTE_MIN_POINTS;
}

function isBroken(
  prev: RoutePoint,
  next: RoutePoint,
  pauses: WorkoutPause[],
  gapThresholdMs: number,
): boolean {
  if (next.timestamp - prev.timestamp > gapThresholdMs) return true;
  return pauses.some((p) => p.startedAt < next.timestamp && p.endedAt > prev.timestamp);
}

export function splitRouteIntoSegments(
  route: RoutePoint[],
  pauses: WorkoutPause[],
  gapThresholdMs: number,
): RouteSegment[] {
  if (route.length === 0) return [];
  const segments: RouteSegment[] = [[route[0]]];
  for (let i = 1; i < route.length; i++) {
    if (isBroken(route[i - 1], route[i], pauses, gapThresholdMs)) {
      segments.push([route[i]]);
    } else {
      segments[segments.length - 1].push(route[i]);
    }
  }
  return segments;
}

export function deriveRouteRegion(points: RoutePoint[]): RouteRegion | null {
  if (points.length === 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const p of points) {
    if (p.latitude < minLat) minLat = p.latitude;
    if (p.latitude > maxLat) maxLat = p.latitude;
    if (p.longitude < minLon) minLon = p.longitude;
    if (p.longitude > maxLon) maxLon = p.longitude;
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * REGION_PADDING_FACTOR, MIN_REGION_DELTA),
    longitudeDelta: Math.max((maxLon - minLon) * REGION_PADDING_FACTOR, MIN_REGION_DELTA),
  };
}
