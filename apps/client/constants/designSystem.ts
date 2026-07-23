import { Platform } from '@/src/web/reactNative';

export const theme = {
  colors: {
    ink: 'var(--c-ink-strong)',
    navy: 'var(--c-brand-surface-deep)',
    navy2: 'var(--c-brand-strong)',
    royal: 'var(--c-brand-fg)',
    blue: 'var(--c-blue)',
    sky: 'var(--c-sky)',
    accent: 'var(--c-sky)',
    accentDark: '#0369A1',
    glow: '#7DD3FC',
    mint: 'var(--c-success)',
    red: 'var(--c-danger)',
    bg: 'var(--c-bg)',
    bgSoft: 'var(--c-surface-2)',
    card: 'var(--c-surface)',
    line: 'var(--c-border)',
    lineSoft: 'var(--c-border-soft)',
    text: 'var(--c-ink)',
    muted: 'var(--c-muted)',
    faint: 'var(--c-faint)',
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
