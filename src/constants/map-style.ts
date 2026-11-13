import type { MapStyleElement } from 'react-native-maps';

import { colors } from '@/constants/theme';

// Dark Google Maps style built from theme tokens, so route-map tiles sit on
// the dark-only app and the `primary` polyline stays legible. Labels and
// points of interest are muted/hidden: the route is the subject, not the map.
export const darkMapStyle: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: colors.surface }] },
  { elementType: 'labels.text.fill', stylers: [{ color: colors.onSurfaceDim }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: colors.backgroundDeep }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: colors.outlineStrong }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: colors.surface }],
  },
  {
    featureType: 'landscape',
    elementType: 'geometry',
    stylers: [{ color: colors.surfaceMuted }],
  },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: colors.backgroundDeep }] },
];
