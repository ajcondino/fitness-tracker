import type { ReactNode } from 'react';
import Svg, { Path } from 'react-native-svg';

/**
 * Tab bar glyphs, per DESIGN.md > Shapes > Ancillary shapes and
 * Components > Tab bar: outline-only, no fill, drawn on a 24px grid at
 * 1.9px stroke with round caps and joins, rendered at 20px. Any icon added
 * later must match this grid, weight, and cap style rather than arriving
 * from an icon font (see DESIGN.md > Do's and Don'ts).
 *
 * `color` is the caller's responsibility — DESIGN.md ties the icon to the
 * same token as its label (`primary` active, `onSurfaceFaint` inactive), so
 * these components take a plain color string rather than resolving a token
 * themselves.
 */

const DEFAULT_SIZE = 20;

export type IconProps = {
  color: string;
  size?: number;
};

function IconBase({ color, size = DEFAULT_SIZE, children }: IconProps & { children: ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <Path d="M4 11 12 4l8 7" />
      <Path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
    </IconBase>
  );
}

export function HistoryIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <Path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" />
      <Path d="M3 3v5h5" />
      <Path d="M12 7v5l4 2" />
    </IconBase>
  );
}

export function DeviceIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      <Path d="M4 12.5h2.5l1.8-3.2 2.6 6.4 1.8-4.4 1.6 1.2h3.7" />
    </IconBase>
  );
}
