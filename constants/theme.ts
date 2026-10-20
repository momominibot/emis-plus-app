export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

export const type = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '700' as const },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
  headline: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const },
  body: { fontSize: 17, lineHeight: 25, fontWeight: '400' as const },
  bodyStrong: { fontSize: 17, lineHeight: 25, fontWeight: '600' as const },
  callout: { fontSize: 16, lineHeight: 22, fontWeight: '500' as const },
  footnote: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' as const },
};

export const shadow = {
  0: {},
  1: { shadowColor: '#1B2B2A', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  2: { shadowColor: '#1B2B2A', shadowOpacity: 0.10, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  3: { shadowColor: '#1B2B2A', shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
};

export const screenGutter = 20;
export const minTouchTarget = 48;
