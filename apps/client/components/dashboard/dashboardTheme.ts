import { Platform } from '@/src/web/reactNative';

const web = (style: Record<string, unknown>) =>
  Platform.select({ web: style as any, default: {} });

/** Shared visual tokens for the admin dashboard — premium SaaS aesthetic
 *  (inspired by Stripe, Linear, Vercel, Notion & Supabase). */
export const dash = {
  // ── Surfaces & neutrals ────────────────────────────────
  bg: '#F5F7FB',
  bgAlt: '#EEF2F9',
  surface: '#FFFFFF',
  surfaceMuted: 'rgba(255,255,255,0.72)',
  surfaceSubtle: '#FBFCFE',

  // ── Ink scale ──────────────────────────────────────────
  ink: '#0A0F1C',
  inkSoft: '#1E293B',
  muted: '#64748B',
  faint: '#94A3B8',
  line: '#E2E8F0',
  lineSoft: '#F1F5F9',
  hairline: 'rgba(15,23,42,0.06)',
  hairlineStrong: 'rgba(15,23,42,0.09)',

  // ── Accents ────────────────────────────────────────────
  accent: '#635BFF',
  accentDeep: '#4F46E5',
  accentBlue: '#2563EB',
  accentSky: '#0EA5E9',
  success: '#10B981',
  successDeep: '#059669',
  warning: '#F59E0B',
  warningDeep: '#B45309',
  danger: '#EF4444',
  dangerDeep: '#DC2626',

  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 22,
    '2xl': 28,
  },

  // ── Layered, diffuse shadows (Stripe/Linear feel) ──────
  shadow: {
    sm: web({
      boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 3px 8px rgba(15,23,42,0.03)',
    }),
    card: web({
      boxShadow:
        '0 0 0 1px rgba(15,23,42,0.04), 0 1px 2px rgba(15,23,42,0.03), 0 8px 24px rgba(15,23,42,0.05), 0 2px 6px rgba(15,23,42,0.03)',
    }),
    lift: web({
      boxShadow:
        '0 0 0 1px rgba(15,23,42,0.05), 0 12px 28px rgba(15,23,42,0.09), 0 28px 56px rgba(99,91,255,0.08)',
    }),
    glow: web({
      boxShadow: '0 0 0 1px rgba(99,91,255,0.1), 0 6px 20px rgba(99,91,255,0.14)',
    }),
    inset: web({
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 1px rgba(15,23,42,0.04)',
    }),
  },

  // ── Gradients ──────────────────────────────────────────
  gradients: {
    hero: 'linear-gradient(135deg, rgba(99,91,255,0.08) 0%, rgba(37,99,235,0.05) 42%, rgba(255,255,255,0) 72%)',
    heroInk: 'linear-gradient(135deg, #0B1220 0%, #172033 52%, #1E293B 100%)',
    cardGreen: 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(255,255,255,0) 62%)',
    cardBlue: 'linear-gradient(135deg, rgba(37,99,235,0.1) 0%, rgba(255,255,255,0) 62%)',
    cardCyan: 'linear-gradient(135deg, rgba(14,165,233,0.1) 0%, rgba(255,255,255,0) 62%)',
    cardPurple: 'linear-gradient(135deg, rgba(99,91,255,0.1) 0%, rgba(255,255,255,0) 62%)',
    cardOrange: 'linear-gradient(135deg, rgba(245,158,11,0.1) 0%, rgba(255,255,255,0) 62%)',
    sheen: 'linear-gradient(120deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.55) 48%, rgba(255,255,255,0) 100%)',
    ring: ['#635BFF', '#2563EB'],
    ringSky: ['#0EA5E9', '#2563EB'],
  },

  // ── Trend indicator tones ──────────────────────────────
  trend: {
    up: { fg: '#059669', bg: 'rgba(16,185,129,0.1)', icon: 'trending-up' as const },
    down: { fg: '#DC2626', bg: 'rgba(239,68,68,0.09)', icon: 'trending-down' as const },
    flat: { fg: '#64748B', bg: 'rgba(100,116,139,0.1)', icon: 'show-chart' as const },
  },
} as const;

export type StatTone = 'blue' | 'cyan' | 'green' | 'purple' | 'orange';

export const statToneMap: Record<
  StatTone,
  {
    gradient: string;
    iconBg: string;
    iconFg: string;
    badgeBg: string;
    badgeFg: string;
    glow: string;
    bar: string;
    accent: string;
  }
> = {
  blue: {
    gradient: dash.gradients.cardBlue,
    iconBg: 'rgba(37,99,235,0.1)',
    iconFg: '#2563EB',
    badgeBg: 'rgba(37,99,235,0.08)',
    badgeFg: '#1D4ED8',
    glow: 'rgba(37,99,235,0.16)',
    bar: 'linear-gradient(90deg, #2563EB, #60A5FA)',
    accent: '#2563EB',
  },
  cyan: {
    gradient: dash.gradients.cardCyan,
    iconBg: 'rgba(14,165,233,0.1)',
    iconFg: '#0284C7',
    badgeBg: 'rgba(14,165,233,0.08)',
    badgeFg: '#0369A1',
    glow: 'rgba(14,165,233,0.16)',
    bar: 'linear-gradient(90deg, #0EA5E9, #38BDF8)',
    accent: '#0EA5E9',
  },
  green: {
    gradient: dash.gradients.cardGreen,
    iconBg: 'rgba(16,185,129,0.1)',
    iconFg: '#059669',
    badgeBg: 'rgba(16,185,129,0.08)',
    badgeFg: '#047857',
    glow: 'rgba(16,185,129,0.16)',
    bar: 'linear-gradient(90deg, #10B981, #34D399)',
    accent: '#10B981',
  },
  purple: {
    gradient: dash.gradients.cardPurple,
    iconBg: 'rgba(99,91,255,0.1)',
    iconFg: '#635BFF',
    badgeBg: 'rgba(99,91,255,0.08)',
    badgeFg: '#4F46E5',
    glow: 'rgba(99,91,255,0.16)',
    bar: 'linear-gradient(90deg, #635BFF, #A78BFA)',
    accent: '#635BFF',
  },
  orange: {
    gradient: dash.gradients.cardOrange,
    iconBg: 'rgba(245,158,11,0.12)',
    iconFg: '#D97706',
    badgeBg: 'rgba(245,158,11,0.1)',
    badgeFg: '#B45309',
    glow: 'rgba(245,158,11,0.16)',
    bar: 'linear-gradient(90deg, #F59E0B, #FBBF24)',
    accent: '#F59E0B',
  },
};
