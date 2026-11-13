import {
  MIN_REGION_DELTA,
  deriveRouteRegion,
  isRouteUsable,
  splitRouteIntoSegments,
} from '@/workout/route-geometry';
import type { RoutePoint } from '@/workout/workout-record';

const GAP = 20_000;
const pt = (t: number, latitude = 10 + t / 1e6, longitude = 20 + t / 1e6): RoutePoint => ({
  latitude,
  longitude,
  timestamp: t,
});

describe('isRouteUsable', () => {
  it('requires at least 2 points', () => {
    expect(isRouteUsable([])).toBe(false);
    expect(isRouteUsable([pt(0)])).toBe(false);
    expect(isRouteUsable([pt(0), pt(5000)])).toBe(true);
  });
});

describe('splitRouteIntoSegments', () => {
  it('returns [] for an empty route', () => {
    expect(splitRouteIntoSegments([], [], GAP)).toEqual([]);
  });

  it('keeps a healthy route as one segment, including a gap exactly at the threshold', () => {
    const route = [pt(0), pt(5000), pt(5000 + GAP)];
    expect(splitRouteIntoSegments(route, [], GAP)).toEqual([route]);
  });

  it('splits when the time gap exceeds the threshold', () => {
    const route = [pt(0), pt(5000), pt(5000 + GAP + 1), pt(30_000)];
    const segs = splitRouteIntoSegments(route, [], GAP);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toEqual([route[0], route[1]]);
  });

  it('splits on a pause between points, even a short one', () => {
    const route = [pt(0), pt(5000), pt(10_000), pt(15_000)];
    const segs = splitRouteIntoSegments(route, [{ startedAt: 6000, endedAt: 8000 }], GAP);
    expect(segs).toHaveLength(2);
    expect(segs[1][0]).toBe(route[2]);
  });

  it('does not split for a pause with no points around it', () => {
    const route = [pt(0), pt(5000)];
    expect(splitRouteIntoSegments(route, [{ startedAt: 100_000, endedAt: 120_000 }], GAP)).toEqual([
      route,
    ]);
  });

  it('produces N+1 segments for N gaps and partitions the input', () => {
    const route = [pt(0), pt(100_000), pt(200_000), pt(205_000)];
    const segs = splitRouteIntoSegments(route, [], GAP);
    expect(segs).toHaveLength(3);
    expect(segs.flat()).toEqual(route);
  });

  it('does not mutate its inputs', () => {
    const route = [pt(0), pt(100_000)];
    const pauses = [{ startedAt: 1, endedAt: 2 }];
    const routeCopy = JSON.parse(JSON.stringify(route));
    const pausesCopy = JSON.parse(JSON.stringify(pauses));
    splitRouteIntoSegments(route, pauses, GAP);
    expect(route).toEqual(routeCopy);
    expect(pauses).toEqual(pausesCopy);
  });
});

describe('deriveRouteRegion', () => {
  it('returns null for no points', () => {
    expect(deriveRouteRegion([])).toBeNull();
  });

  it('centres on the bounding box and pads the span', () => {
    const r = deriveRouteRegion([pt(0, 10, 20), pt(1, 10.1, 20.2)])!;
    expect(r.latitude).toBeCloseTo(10.05);
    expect(r.longitude).toBeCloseTo(20.1);
    expect(r.latitudeDelta).toBeCloseTo(0.13);
    expect(r.longitudeDelta).toBeCloseTo(0.26);
  });

  it.each([
    ['1 point', [pt(0, 5, 5)]],
    ['2 identical points', [pt(0, 5, 5), pt(1, 5, 5)]],
    ['a straight N-S line', [pt(0, 5, 5), pt(1, 5.5, 5)]],
  ])('yields finite deltas >= MIN_REGION_DELTA for %s', (_n, points) => {
    const r = deriveRouteRegion(points)!;
    for (const v of Object.values(r)) expect(Number.isFinite(v)).toBe(true);
    expect(r.latitudeDelta).toBeGreaterThanOrEqual(MIN_REGION_DELTA);
    expect(r.longitudeDelta).toBeGreaterThanOrEqual(MIN_REGION_DELTA);
  });
});
