import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { SummaryCard } from '@/components/ui/summary-card';
import { darkMapStyle } from '@/constants/map-style';
import { ROUTE_GAP_THRESHOLD_MS } from '@/location/location-config';
import { useTheme } from '@/hooks/use-theme';
import { deriveRouteRegion, isRouteUsable, splitRouteIntoSegments } from '@/workout/route-geometry';
import type { RoutePoint, WorkoutPause } from '@/workout/workout-record';

export type RouteMapCardProps = {
  route: RoutePoint[];
  pauses: WorkoutPause[];
  testID?: string;
};

const MAP_HEIGHT = 200;
const POLYLINE_WIDTH = 4;
const MARKER_SIZE = 16;
const MARKER_BORDER = 3;

// The session summary's `course` route section: a fixed-height,
// non-interactive map with the route drawn as gap-broken polylines. Collapses
// to null without a usable route. See
// docs/specs/route-polyline-session-summary/SPEC.md.
export function RouteMapCard({ route, pauses, testID }: RouteMapCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  if (!isRouteUsable(route)) return null;

  const region = deriveRouteRegion(route);
  if (region == null) return null;

  const segments = splitRouteIntoSegments(route, pauses, ROUTE_GAP_THRESHOLD_MS);
  const start = route[0];
  const end = route[route.length - 1];

  return (
    <SummaryCard label={t('sessionSummary.course.route.label')} testID={testID}>
      <View
        accessible
        accessibilityLabel={t('sessionSummary.course.route.a11y')}
        style={[styles.mapWrap, { borderRadius: theme.rounded.md }]}
      >
        <MapView
          style={styles.map}
          region={region}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          customMapStyle={darkMapStyle}
        >
          {segments
            .filter((segment) => segment.length >= 2)
            .map((segment, i) => (
              <Polyline
                key={i}
                coordinates={segment.map(({ latitude, longitude }) => ({ latitude, longitude }))}
                strokeColor={theme.colors.primary}
                strokeWidth={POLYLINE_WIDTH}
                lineJoin="round"
                lineCap="round"
              />
            ))}
          <Marker
            testID="route-start-marker"
            coordinate={{ latitude: start.latitude, longitude: start.longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View
              style={[
                styles.marker,
                { borderColor: theme.colors.success, backgroundColor: 'transparent' },
              ]}
            />
          </Marker>
          <Marker
            testID="route-end-marker"
            coordinate={{ latitude: end.latitude, longitude: end.longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View
              style={[
                styles.marker,
                { borderColor: theme.colors.onPrimary, backgroundColor: theme.colors.primary },
              ]}
            />
          </Marker>
        </MapView>
      </View>
    </SummaryCard>
  );
}

const styles = StyleSheet.create({
  mapWrap: {
    height: MAP_HEIGHT,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  marker: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: MARKER_SIZE / 2,
    borderWidth: MARKER_BORDER,
  },
});
