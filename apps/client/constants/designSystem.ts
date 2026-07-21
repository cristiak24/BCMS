import { Platform } from '@/src/web/reactNative';

export const theme = {
  colors: {
    ink: '#07152F',
    navy: '#0B1E3D',
    navy2: '#102B64',
    royal: '#1D3E90',
    blue: '#2563EB',
    sky: '#0EA5E9',
    accent: '#38BDF8',
    accentDark: '#0369A1',
    glow: '#7DD3FC',
    mint: '#10B981',
    red: '#DC2626',
    bg: '#EEF4FB',
    bgSoft: '#F7FAFE',
    card: '#FFFFFF',
    line: '#DCE7F5',
    lineSoft: '#E8EEF7',
    text: '#0E2041',
    muted: '#64748B',
    faint: '#94A3B8',
  },
  radius: {
    sm: 12,
    md: 18,
    lg: 24,
    xl: 28,
  },
  shadow: {
    card: Platform.select({
      web: {
        boxShadow: '0 18px 45px rgba(11, 30, 61, 0.08)',
      } as any,
      default: {
        shadowColor: '#0B1E3D',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.1,
        shadowRadius: 22,
        elevation: 4,
      },
    }),
    lift: Platform.select({
      web: {
        boxShadow: '0 22px 55px rgba(29, 62, 144, 0.16)',
      } as any,
      default: {
        shadowColor: '#1D3E90',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
        elevation: 8,
      },
    }),
  },
};

export type AppTheme = typeof theme;
