import type { TextStyle } from 'react-native';

/**
 * Design tokens for Pulse, sourced from DESIGN.md's YAML front matter.
 * The app is dark-only (see app.json's `userInterfaceStyle: "dark"`) so
 * there is a single flat token set — no light/dark pairs.
 */

export const colors = {
  // Accent — the only chromatic color in the product
  primary: '#F5C518',
  onPrimary: '#141414',
  primaryDim: '#8A7A20',
  primaryWash: '#4A4326',

  // Ground
  background: '#0F0F10',
  backgroundDeep: '#0A0A0B',
  surface: '#141415',
  surfaceRaised: '#191919',
  surfaceMuted: '#151516',
  surfaceTrack: '#1B1B1C',
  surfaceTrackIdle: '#262627',

  // Outlines — the primary tool for separating surfaces
  outline: '#242424',
  outlineSoft: '#282828',
  outlineStrong: '#333333',
  outlineEmphasis: '#3E3E40',

  // Ink ramp
  onSurface: '#F2F3F5',
  onSurfaceSoft: '#E4E7EA',
  onSurfaceChip: '#BCBCBE',
  onSurfaceMuted: '#8A9099',
  onSurfaceFaint: '#6E747D',
  onSurfaceDim: '#5C626B',
  onSurfaceGhost: '#4A5057',

  // Status
  success: '#3ECF8E',
  successOutline: '#2E5C45',
  danger: '#FF5A52',
} as const;

type TypographyToken = {
  fontFamily: string;
  fontSize: number;
  fontWeight: TextStyle['fontWeight'];
  lineHeight?: number;
  letterSpacing?: number;
};

type TypographyKey =
  | 'displayXl'
  | 'displayLg'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'statMd'
  | 'statSm'
  | 'titleMd'
  | 'titleSm'
  | 'bodyMd'
  | 'bodySm'
  | 'caption'
  | 'actionLg'
  | 'actionMd'
  | 'actionSm'
  | 'dataMd'
  | 'dataSm'
  | 'labelCaps'
  | 'labelMicro'
  | 'wordmark'
  | 'tabLabel';

export const typography: Record<TypographyKey, TypographyToken> = {
  displayXl: {
    fontFamily: 'Archivo',
    fontSize: 132,
    fontWeight: 800,
    lineHeight: 138,
    letterSpacing: -6,
  },
  displayLg: {
    fontFamily: 'Archivo',
    fontSize: 56,
    fontWeight: 800,
    lineHeight: 60,
    letterSpacing: -2,
  },
  h1: {
    fontFamily: 'Archivo',
    fontSize: 34,
    fontWeight: 800,
    lineHeight: 38,
    letterSpacing: -0.8,
  },
  h2: {
    fontFamily: 'Archivo',
    fontSize: 32,
    fontWeight: 800,
    lineHeight: 36,
    letterSpacing: -0.7,
  },
  h3: {
    fontFamily: 'Archivo',
    fontSize: 26,
    fontWeight: 800,
    letterSpacing: -0.6,
  },
  statMd: {
    fontFamily: 'Archivo',
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: -0.5,
  },
  statSm: {
    fontFamily: 'Archivo',
    fontSize: 20,
    fontWeight: 800,
  },
  titleMd: {
    fontFamily: 'Archivo',
    fontSize: 17,
    fontWeight: 700,
  },
  titleSm: {
    fontFamily: 'Archivo',
    fontSize: 15,
    fontWeight: 700,
  },
  bodyMd: {
    fontFamily: 'Archivo',
    fontSize: 15,
    fontWeight: 400,
    lineHeight: 22,
  },
  bodySm: {
    fontFamily: 'Archivo',
    fontSize: 14,
    fontWeight: 400,
  },
  caption: {
    fontFamily: 'Archivo',
    fontSize: 12,
    fontWeight: 400,
    lineHeight: 19,
  },
  actionLg: {
    fontFamily: 'JetBrains Mono',
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 2.4,
  },
  actionMd: {
    fontFamily: 'JetBrains Mono',
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 2.2,
  },
  actionSm: {
    fontFamily: 'JetBrains Mono',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1.4,
  },
  dataMd: {
    fontFamily: 'JetBrains Mono',
    fontSize: 12,
    fontWeight: 400,
  },
  dataSm: {
    fontFamily: 'JetBrains Mono',
    fontSize: 11,
    fontWeight: 400,
  },
  labelCaps: {
    fontFamily: 'JetBrains Mono',
    fontSize: 11,
    fontWeight: 400,
    letterSpacing: 2,
  },
  labelMicro: {
    fontFamily: 'JetBrains Mono',
    fontSize: 10,
    fontWeight: 400,
    letterSpacing: 1.6,
  },
  wordmark: {
    fontFamily: 'JetBrains Mono',
    fontSize: 12,
    fontWeight: 400,
    letterSpacing: 3.4,
  },
  tabLabel: {
    fontFamily: 'JetBrains Mono',
    fontSize: 9,
    fontWeight: 400,
    letterSpacing: 1,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const rounded = {
  sm: 12,
  md: 16,
  lg: 18,
  xl: 22,
  full: 999,
} as const;

export const theme = { colors, typography, spacing, rounded } as const;

export type Theme = typeof theme;
export type ColorToken = keyof typeof colors;
export type TypographyVariant = keyof typeof typography;
