import { Platform } from 'react-native';

/**
 * Brand colours sampled from the KBH Construction logo
 * (deep navy #0C142C and the steel blue #0B6493) blended with the
 * finance palette: green money in, red money out, navy balance.
 */
export const colors = {
  navy: '#0E2340',
  navyDeep: '#0B1628',
  navySoft: '#1B3557',
  navyTint: '#E8EDF4',

  blue: '#0B6493',
  blueSoft: '#E6F1F7',

  amber: '#F2A900',
  amberDark: '#C98B00',
  amberSoft: '#FFF5DF',

  green: '#1E9E5A',
  greenSoft: '#E6F6ED',
  red: '#D64545',
  redSoft: '#FCEBEB',

  bg: '#F5F7FA',
  card: '#FFFFFF',
  line: '#E3E8EF',
  lineStrong: '#CBD5E1',

  text: '#0E2340',
  textMuted: '#5B6B7F',
  textFaint: '#8A99AB',
  onDark: '#FFFFFF',
  onDarkMuted: '#A9BBD0',

  white: '#FFFFFF',
  black: '#000000',
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const spacing = (n: number) => n * 4;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/** Soft, premium card shadow that behaves on all three platforms. */
export const shadow = {
  card: Platform.select({
    ios: {
      shadowColor: '#0E2340',
      shadowOpacity: 0.07,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
    },
    android: { elevation: 2 },
    default: { boxShadow: '0 5px 18px rgba(14, 35, 64, 0.08)' },
  }) as object,
  raised: Platform.select({
    ios: {
      shadowColor: '#0E2340',
      shadowOpacity: 0.14,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
    },
    android: { elevation: 6 },
    default: { boxShadow: '0 10px 28px rgba(14, 35, 64, 0.16)' },
  }) as object,
} as const;

/** Anything wider than this gets the desktop sidebar layout. */
export const WIDE_BREAKPOINT = 900;
export const CONTENT_MAX_WIDTH = 1080;
