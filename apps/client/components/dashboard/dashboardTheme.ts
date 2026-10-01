import { Platform } from '@/src/web/reactNative';

const web = (style: Record<string, unknown>) =>
  Platform.select({ web: style as any, default: {} });

/** Shared visual tokens for the admin dashboard — premium SaaS aesthetic
 *  (inspired by Stripe, Linear, Vercel, Notion & Supabase). */
export const dash = {
  // ── Surfaces & neutrals ────────────────────────────────
  bg: 'var(--c-bg)',
  bgAlt: 'var(--c-bg-alt)',
  surface: 'var(--c-surface)',
  surfaceMuted: 'var(--c-surface-2)',
  surfaceSubtle: 'var(--c-surface-2)',

  // ── Ink scale ──────────────────────────────────────────
  ink: 'var(--c-ink)',
  inkSoft: 'var(--c-ink-soft)',
  muted: 'var(--c-muted)',
  faint: 'var(--c-faint)',
  line: 'var(--c-border)',
  lineSoft: 'var(--c-surface-3)',
  hairline: 'var(--c-border-soft)',
  hairlineStrong: 'var(--c-border)',

  // ── Accents ────────────────────────────────────────────
  accent: 'var(--c-purple)',
  accentDeep: 'var(--c-brand-surface)',
  accentBlue: 'var(--c-blue)',
  accentSky: 'var(--c-sky)',
  success: 'var(--c-success)',
  successDeep: 'var(--c-success-fg)',
  warning: 'var(--c-warning)',
  warningDeep: 'var(--c-warning-fg)',
  danger: 'var(--c-danger)',
  dangerDeep: 'var(--c-danger)',

  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 22,
    '2xl': 28,
  },

  // ── Layered, diffuse shadows (Stripe/Linear feel) ──────
  // Built on the --e-* elevation tokens (tokens.css) instead of literal
  // rgba(15,23,42,x) so shadows repoint automatically in dark mode — a
  // near-black shadow is invisible against a near-black dark surface.
  shadow: {
    sm: web({ boxShadow: 'var(--e-xs)' }),
    card: web({
      boxShadow: '0 0 0 1px var(--c-border-soft), var(--e-sm)',
    }),
    lift: web({
      boxShadow: '0 0 0 1px var(--c-border), var(--e-lg), 0 28px 56px color-mix(in srgb, var(--c-purple) 8%, transparent)',
    }),
    glow: web({
      boxShadow: '0 0 0 1px color-mix(in srgb, var(--c-purple) 10%, transparent), var(--e-brand)',
    }),
    inset: web({
      boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--c-surface) 70%, white), inset 0 0 0 1px var(--c-border-soft)',
    }),
  },

  // ── Gradients ──────────────────────────────────────────
  gradients: {
    hero: 'linear-gradient(135deg, color-mix(in srgb, var(--c-purple) 8%, transparent) 0%, color-mix(in srgb, var(--c-brand-surface) 5%, transparent) 42%, transparent 72%)',
    // Indigo-tinted near-black to match the new brand (was slate-blue #0B1220).
    heroInk: 'linear-gradient(135deg, #17163A 0%, #201E52 52%, #14161F 100%)',
    cardGreen: 'linear-gradient(135deg, color-mix(in srgb, var(--c-success) 10%, transparent) 0%, transparent 62%)',
    cardBlue: 'linear-gradient(135deg, color-mix(in srgb, var(--c-blue) 10%, transparent) 0%, transparent 62%)',
    cardCyan: 'linear-gradient(135deg, color-mix(in srgb, var(--c-sky) 10%, transparent) 0%, transparent 62%)',
    cardPurple: 'linear-gradient(135deg, color-mix(in srgb, var(--c-purple) 10%, transparent) 0%, transparent 62%)',
    cardOrange: 'linear-gradient(135deg, color-mix(in srgb, var(--c-warning) 10%, transparent) 0%, transparent 62%)',
    sheen: 'linear-gradient(120deg, transparent 0%, color-mix(in srgb, var(--c-surface) 55%, white) 48%, transparent 100%)',
    ring: ['var(--c-purple)', 'var(--c-blue)'],
    ringSky: ['var(--c-sky)', 'var(--c-blue)'],
  },

  // ── Trend indicator tones ──────────────────────────────
  trend: {
    up: { fg: 'var(--c-success)', bg: 'color-mix(in srgb, var(--c-success) 10%, transparent)', icon: 'trending-up' as const },
    down: { fg: 'var(--c-danger)', bg: 'color-mix(in srgb, var(--c-danger) 9%, transparent)', icon: 'trending-down' as const },
    flat: { fg: 'var(--c-muted)', bg: 'color-mix(in srgb, var(--c-muted) 10%, transparent)', icon: 'show-chart' as const },
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
    iconBg: 'color-mix(in srgb, var(--c-blue) 10%, transparent)',
    iconFg: 'var(--c-blue)',
    badgeBg: 'color-mix(in srgb, var(--c-blue) 8%, transparent)',
    badgeFg: 'var(--c-blue-deep)',
    glow: 'color-mix(in srgb, var(--c-blue) 16%, transparent)',
    bar: 'linear-gradient(90deg, #2563EB, #60A5FA)',
    accent: 'var(--c-blue)',
  },
  cyan: {
    gradient: dash.gradients.cardCyan,
    iconBg: 'color-mix(in srgb, var(--c-sky) 10%, transparent)',
    iconFg: 'var(--c-sky)',
    badgeBg: 'color-mix(in srgb, var(--c-sky) 8%, transparent)',
    badgeFg: 'var(--c-sky)',
    glow: 'color-mix(in srgb, var(--c-sky) 16%, transparent)',
    bar: 'linear-gradient(90deg, #0EA5E9, #38BDF8)',
    accent: 'var(--c-sky)',
  },
  green: {
    gradient: dash.gradients.cardGreen,
    iconBg: 'color-mix(in srgb, var(--c-success) 10%, transparent)',
    iconFg: 'var(--c-success)',
    badgeBg: 'color-mix(in srgb, var(--c-success) 8%, transparent)',
    badgeFg: 'var(--c-success-fg)',
    glow: 'color-mix(in srgb, var(--c-success) 16%, transparent)',
    bar: 'linear-gradient(90deg, #10B981, #34D399)',
    accent: 'var(--c-success)',
  },
  purple: {
    gradient: dash.gradients.cardPurple,
    iconBg: 'color-mix(in srgb, var(--c-purple) 10%, transparent)',
    iconFg: 'var(--c-purple)',
    badgeBg: 'color-mix(in srgb, var(--c-purple) 8%, transparent)',
    badgeFg: 'var(--c-brand-surface)',
    glow: 'color-mix(in srgb, var(--c-purple) 16%, transparent)',
    bar: 'linear-gradient(90deg, #635BFF, #A78BFA)',
    accent: 'var(--c-purple)',
  },
  orange: {
    gradient: dash.gradients.cardOrange,
    iconBg: 'color-mix(in srgb, var(--c-warning) 12%, transparent)',
    iconFg: 'var(--c-warning)',
    badgeBg: 'color-mix(in srgb, var(--c-warning) 10%, transparent)',
    badgeFg: 'var(--c-warning-fg)',
    glow: 'color-mix(in srgb, var(--c-warning) 16%, transparent)',
    bar: 'linear-gradient(90deg, #F59E0B, #FBBF24)',
    accent: 'var(--c-warning)',
  },
};
