// Jest mock for `react-native-maps` (a native module). Renders MapView /
// Polyline / Marker as plain Views and surfaces their props via testID-style
// queries: tests read `props` off the found element.
import type { ReactNode } from 'react';
import { View } from 'react-native';

type AnyProps = Record<string, unknown> & { children?: ReactNode };

function MapView({ children, ...props }: AnyProps) {
  return (
    <View testID="mock-map-view" {...props}>
      {children}
    </View>
  );
}

function Polyline(props: AnyProps) {
  return <View testID="mock-polyline" {...props} />;
}

function Marker({ children, ...props }: AnyProps) {
  return (
    <View testID="mock-marker" {...props}>
      {children}
    </View>
  );
}

export default MapView;
export { MapView, Polyline, Marker };
