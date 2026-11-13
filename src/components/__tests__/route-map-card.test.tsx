import { render, screen } from '@testing-library/react-native';

import { RouteMapCard } from '@/components/route-map-card';
import { deriveRouteRegion } from '@/workout/route-geometry';
import type { RoutePoint } from '@/workout/workout-record';

const pt = (t: number, latitude: number, longitude: number): RoutePoint => ({
  latitude,
  longitude,
  timestamp: t,
});

describe('<RouteMapCard />', () => {
  it('renders nothing for an empty or single-point route', async () => {
    const { rerender } = await render(<RouteMapCard route={[]} pauses={[]} testID="card" />);
    expect(screen.queryByTestId('card')).toBeNull();
    expect(screen.queryByTestId('mock-map-view')).toBeNull();
    await rerender(<RouteMapCard route={[pt(0, 1, 1)]} pauses={[]} testID="card" />);
    expect(screen.queryByTestId('card')).toBeNull();
    expect(screen.queryByTestId('mock-map-view')).toBeNull();
  });

  it('renders for two identical points without throwing, with a finite region', async () => {
    await render(<RouteMapCard route={[pt(0, 1, 1), pt(5000, 1, 1)]} pauses={[]} />);
    const region = screen.getByTestId('mock-map-view').props.region;
    expect(Number.isFinite(region.latitudeDelta)).toBe(true);
    expect(region.latitudeDelta).toBeGreaterThan(0);
  });

  it('draws one Polyline for a continuous route and matches the derived region', async () => {
    const route = [pt(0, 1, 1), pt(5000, 1.001, 1.001), pt(10_000, 1.002, 1.001)];
    await render(<RouteMapCard route={route} pauses={[]} />);
    expect(screen.getAllByTestId('mock-polyline')).toHaveLength(1);
    expect(screen.getByTestId('mock-map-view').props.region).toEqual(deriveRouteRegion(route));
  });

  it('breaks the line at a pause and at a time gap', async () => {
    const route = [
      pt(0, 1, 1),
      pt(5000, 1.001, 1),
      pt(10_000, 1.002, 1), // pause 6000–9000 splits before this
      pt(15_000, 1.003, 1),
      pt(60_000, 1.004, 1), // >20 s gap
      pt(65_000, 1.005, 1),
    ];
    await render(<RouteMapCard route={route} pauses={[{ startedAt: 6000, endedAt: 9000 }]} />);
    expect(screen.getAllByTestId('mock-polyline')).toHaveLength(3);
  });

  it('draws no Polyline for a one-point segment but keeps the markers', async () => {
    const route = [pt(0, 1, 1), pt(5000, 1.001, 1), pt(60_000, 1.002, 1)];
    await render(<RouteMapCard route={route} pauses={[]} />);
    expect(screen.getAllByTestId('mock-polyline')).toHaveLength(1);
    expect(screen.getByTestId('route-start-marker')).toBeOnTheScreen();
    expect(screen.getByTestId('route-end-marker')).toBeOnTheScreen();
  });

  it('disables every map gesture', async () => {
    await render(<RouteMapCard route={[pt(0, 1, 1), pt(5000, 1.001, 1)]} pauses={[]} />);
    const props = screen.getByTestId('mock-map-view').props;
    expect(props.scrollEnabled).toBe(false);
    expect(props.zoomEnabled).toBe(false);
    expect(props.rotateEnabled).toBe(false);
    expect(props.pitchEnabled).toBe(false);
    expect(props.toolbarEnabled).toBe(false);
  });

  it('exposes one accessibility label', async () => {
    await render(<RouteMapCard route={[pt(0, 1, 1), pt(5000, 1.001, 1)]} pauses={[]} />);
    expect(screen.getByLabelText(/Map of your route/)).toBeOnTheScreen();
  });
});
