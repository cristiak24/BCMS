#!/usr/bin/env node
/*
 * Generates `src/theme/palette.css`.
 *
 * WHY THIS EXISTS
 * ---------------
 * ~1,500 hardcoded hex colours are baked into Tailwind arbitrary utilities
 * across the app (`bg-[#1D3E90]`, `text-[#0E2041]`, `border-[#DDE7F5]`, …).
 * Rewriting every call site is a mechanical change with a large blast radius
 * and no way to review it meaningfully. Instead we let the utilities keep
 * their legacy names and repoint them at semantic tokens:
 *
 *     .bg-\[\#1D3E90\] { background-color: var(--c-brand-surface); }
 *
 * The selector is (0,1,0) — same specificity as Tailwind's own rule — so
 * source order decides, and palette.css is imported after the Tailwind build.
 * Unlike dark.css (which only fires under [data-theme="dark"]) this layer
 * applies in BOTH themes: it is the light palette too.
 *
 * Net effect: the product's colours live in tokens.css. This file is the
 * adapter that lets legacy markup reach them.
 *
 * Colours are classified by HSL — hue family, lightness, saturation — into a
 * semantic bucket, with an explicit override table for hexes whose role can't
 * be inferred from the value alone (e.g. #0E2041 is both a text ink and a
 * dark panel fill depending on the property it lands on, which is why the
 * bucket is chosen per CSS property, not per colour).
 *
 * Run: node scripts/build-palette.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['app', 'components', 'src', 'hooks'].map((d) => join(ROOT, d));
const OUT = join(ROOT, 'src/theme/palette.css');

/* ── hex → HSL ─────────────────────────────────────────────────────────── */

function toHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s: s * 100, l: l * 100 };
}

/* ── Explicit roles ────────────────────────────────────────────────────────
 * Hexes whose semantic job is known and shouldn't be guessed. Keyed by hex,
 * valued by { bg, text, border } token names — any omitted key falls through
 * to the classifier. */

const EXPLICIT = {
  // The old primary navy. Filled backgrounds become the brand action colour;
  // as text/icon it is the brand foreground.
  '#1D3E90': { bg: 'brand-surface', text: 'brand-fg', border: 'brand-border' },
  '#123A97': { bg: 'brand-surface', text: 'brand-fg', border: 'brand-border' },
  '#123B95': { bg: 'brand-surface', text: 'brand-fg', border: 'brand-border' },
  '#173AA8': { bg: 'brand-surface', text: 'brand-fg', border: 'brand-border' },
  '#0A2C93': { bg: 'brand-surface', text: 'brand-fg', border: 'brand-border' },
  '#2B3FA8': { bg: 'brand-surface', text: 'brand-fg', border: 'brand-border' },
  '#102A72': { bg: 'brand-strong', text: 'brand-fg', border: 'brand-border' },
  '#2563EB': { bg: 'blue', text: 'blue', border: 'blue' },
  '#1D4ED8': { bg: 'blue-deep', text: 'blue-deep', border: 'blue-deep' },

  // Near-black navies: dark panels as a fill, primary ink as text.
  '#0E2041': { bg: 'surface-inverse', text: 'ink', border: 'surface-inverse' },
  '#07152F': { bg: 'surface-inverse', text: 'ink-strong', border: 'surface-inverse' },
  '#0B1E3D': { bg: 'brand-surface-deep', text: 'ink-strong', border: 'brand-surface-deep' },
  '#0D2040': { bg: 'brand-surface-deep', text: 'ink-strong', border: 'brand-surface-deep' },
  '#050817': { bg: 'brand-surface-deep', text: 'ink-strong', border: 'brand-surface-deep' },
  '#28345E': { bg: 'ink-soft', text: 'ink-soft', border: 'border-strong' },

  // Grey ink ramp (Tailwind slate, which the app used directly).
  '#1E293B': { bg: 'surface-inverse', text: 'ink-soft', border: 'border-strong' },
  '#334155': { bg: 'ink-soft', text: 'ink-soft', border: 'border-strong' },
  '#475569': { bg: 'ink-soft', text: 'ink-soft', border: 'border-strong' },
  '#56627F': { bg: 'muted', text: 'muted', border: 'border-strong' },
  '#64748B': { bg: 'muted', text: 'muted', border: 'border-strong' },
  '#6B7AA6': { bg: 'muted', text: 'muted', border: 'border-strong' },
  '#7483A6': { bg: 'faint', text: 'muted', border: 'border-strong' },
  '#8EA1B8': { bg: 'faint', text: 'faint', border: 'border-strong' },
  '#94A3B8': { bg: 'faint', text: 'faint', border: 'border-strong' },
  '#CBD5E1': { bg: 'border-strong', text: 'faint', border: 'border-strong' },

  // Status colours — keep their meaning, take the new hues.
  '#10B981': { bg: 'success', text: 'success-fg', border: 'success' },
  '#059669': { bg: 'success', text: 'success-fg', border: 'success' },
  '#047857': { bg: 'success-fg', text: 'success-fg', border: 'success-fg' },
  '#0B7A55': { bg: 'success-fg', text: 'success-fg', border: 'success-fg' },
  '#16A34A': { bg: 'success', text: 'success-fg', border: 'success' },
  '#22C55E': { bg: 'success', text: 'success-fg', border: 'success' },
  '#DC2626': { bg: 'danger', text: 'danger-fg', border: 'danger' },
  '#EF4444': { bg: 'danger', text: 'danger-fg', border: 'danger' },
  '#B42318': { bg: 'danger-fg', text: 'danger-fg', border: 'danger-fg' },
  '#BE123C': { bg: 'danger-fg', text: 'danger-fg', border: 'danger-fg' },
  '#F59E0B': { bg: 'warning', text: 'warning-fg', border: 'warning' },
  '#FDBA2D': { bg: 'warning', text: 'warning-fg', border: 'warning' },
  '#D97706': { bg: 'warning', text: 'warning-fg', border: 'warning' },
  '#B45309': { bg: 'warning-fg', text: 'warning-fg', border: 'warning-fg' },
  '#F97316': { bg: 'warning', text: 'warning-fg', border: 'warning' },

  // Sky / cyan accents.
  '#0EA5E9': { bg: 'sky', text: 'sky', border: 'sky' },
  '#38BDF8': { bg: 'sky', text: 'sky', border: 'sky' },
  '#38BAF8': { bg: 'sky', text: 'sky', border: 'sky' },
  '#0369A1': { bg: 'sky', text: 'sky', border: 'sky' },
  '#006092': { bg: 'sky', text: 'sky', border: 'sky' },
  '#635BFF': { bg: 'purple', text: 'purple', border: 'purple' },
  '#7C3AED': { bg: 'purple', text: 'purple', border: 'purple' },
  '#8B5CF6': { bg: 'purple', text: 'purple', border: 'purple' },

  // Page backgrounds. These were the pale-blue washes that made the product
  // look clinical; they all collapse onto the neutral page/surface ramp.
  '#EAF1F8': { bg: 'bg-alt', text: 'faint', border: 'border' },
  '#EDF4FB': { bg: 'bg', text: 'faint', border: 'border' },
  '#EEF4FB': { bg: 'bg', text: 'faint', border: 'border' },
  '#F5F7FB': { bg: 'bg', text: 'faint', border: 'border' },
  '#F1F5F9': { bg: 'surface-3', text: 'faint', border: 'border' },
};

/* ── Classifier ───────────────────────────────────────────────────────────
 * For anything not named above. `prop` is 'bg' | 'text' | 'border'. */

function classify(hex, prop) {
  const { h, s, l } = toHsl(hex);
  const blueish = h >= 195 && h <= 265;
  const violet = h > 245 && h <= 285;

  // Status hues keep their family regardless of lightness. Borders get their
  // own weight: a status *border* is a hairline, so mapping it to the solid
  // fill (--c-danger) would turn a soft outline into a loud one.
  if (s > 18) {
    const family =
      h >= 95 && h < 165 ? 'success'
      : h >= 340 || h < 14 ? 'danger'
      : h >= 14 && h < 55 ? 'warning'
      : null;
    if (family) {
      if (prop === 'border') return l > 78 ? `${family}-border` : family;
      if (prop === 'bg') return l > 88 ? `${family}-bg` : l > 55 ? family : `${family}-fg`;
      // Pale status text only appears on a dark/filled surface of the same
      // family, where the light tint is the point.
      return l > 78 ? family : `${family}-fg`;
    }
    if (h >= 165 && h < 200) return l > 88 ? 'surface-tint' : 'sky';
    if (violet && l < 70) return 'purple';
    // Saturated blue at any lightness is an accent, not a neutral. Without
    // this, blue-500 (#3B82F6, L=60) fell through to the grey ramp.
    if (blueish && s > 48 && l < 70) return prop === 'bg' ? 'blue' : 'blue';
  }

  // Pale blue TEXT is never a faint grey — it's a tint sitting on a dark or
  // brand-filled surface (hero subtitles, stat-card labels). Mapping it to
  // --c-faint made those labels vanish into their own background.
  if (prop === 'text' && l >= 70 && s > 12) return 'tint-fg';

  // Neutral / blue-grey ramp, split by lightness. Borders never fall back to
  // an ink token — a hairline that renders as mid-grey reads as a hard rule.
  if (prop === 'border') {
    if (l >= 93) return 'border-soft';
    if (l >= 82) return 'border';
    if (l >= 30) return 'border-strong';
    return 'surface-inverse'; // dark border matching a dark fill
  }

  if (l >= 97) return prop === 'bg' ? 'surface' : 'faint';
  if (l >= 94) return prop === 'bg' ? (s > 25 && blueish ? 'surface-tint' : 'surface-2') : 'faint';
  if (l >= 88) return prop === 'bg' ? (s > 30 ? 'surface-tint' : 'surface-3') : 'faint';
  if (l >= 78) return prop === 'bg' ? 'surface-3' : 'faint';
  if (l >= 55) return 'faint';
  if (l >= 38) return blueish && s > 35 ? (prop === 'bg' ? 'brand-surface' : 'brand-fg') : 'muted';
  if (l >= 22) return blueish && s > 35 ? (prop === 'bg' ? 'brand-surface' : 'brand-fg') : 'ink-soft';
  return prop === 'bg' ? 'surface-inverse' : 'ink-strong';
}

function tokenFor(hex, prop) {
  const explicit = EXPLICIT[hex];
  if (explicit && explicit[prop]) return explicit[prop];
  return classify(hex, prop);
}

/* ── Scan sources for arbitrary-hex utilities ─────────────────────────── */

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry)) out.push(full);
  }
  return out;
}

// bg-[#hex] / text-[#hex] / border-[#hex], optionally behind a variant prefix
// (hover:, lg:, dark:) and optionally with a directional border suffix.
const UTIL = /(?:^|[\s"'`])((?:[a-z-]+:)*)(bg|text|border)(-[trbl]|-[xy])?-\[(#[0-9A-Fa-f]{6})\]/g;

const PROP_CSS = {
  bg: 'background-color',
  text: 'color',
  border: 'border-color',
};

const found = new Map(); // "prop|hex" -> Set of full class names

for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    const src = readFileSync(file, 'utf8');
    let m;
    while ((m = UTIL.exec(src)) !== null) {
      const [, variants, prop, side = '', hexRaw] = m;
      // Variant-prefixed utilities (hover:, lg:) carry their own selector
      // machinery; remapping those generically is unsafe, so we only take the
      // bare form. The variant form still resolves to the legacy hex, which is
      // why the hover palette is handled by hand in palette-extras.css.
      if (variants) continue;
      const hex = hexRaw.toUpperCase();
      const key = `${prop}|${hex}`;
      if (!found.has(key)) found.set(key, new Set());
      found.get(key).add(`${prop}${side}-[${hexRaw}]`);
    }
  }
}

/* ── Emit ─────────────────────────────────────────────────────────────── */

const escape = (cls) => `.${cls.replace(/([[\]#().\\/])/g, '\\$1')}`;

const sides = {
  '': [''],
  '-t': ['-top'],
  '-r': ['-right'],
  '-b': ['-bottom'],
  '-l': ['-left'],
  '-x': ['-left', '-right'],
  '-y': ['-top', '-bottom'],
};

const lines = [];
const byProp = { bg: [], text: [], border: [] };

for (const [key, classes] of [...found.entries()].sort()) {
  const [prop, hex] = key.split('|');
  const token = tokenFor(hex, prop);
  for (const cls of [...classes].sort()) {
    const sideMatch = cls.match(/^(?:bg|text|border)(-[trblxy])?-\[/);
    const side = sideMatch?.[1] ?? '';
    const decls = (sides[side] ?? ['']).map((s) =>
      prop === 'border'
        ? `border${s}-color:var(--c-${token})`
        : `${PROP_CSS[prop]}:var(--c-${token})`,
    );
    byProp[prop].push(`${escape(cls)}{${decls.join(';')}}`);
  }
}

lines.push(`/* AUTO-GENERATED by scripts/build-palette.mjs — do not edit.
 *
 * Repoints every legacy Tailwind arbitrary-hex utility at a semantic token
 * from tokens.css, in BOTH light and dark. Regenerate after adding new
 * hardcoded colours: \`node scripts/build-palette.mjs\`.
 *
 * Same specificity as Tailwind's own utilities — import order decides, so
 * this must load after the Tailwind bundle.
 */
`);

lines.push('/* ── backgrounds ───────────────────────────────────────── */');
lines.push(...byProp.bg);
lines.push('\n/* ── text ──────────────────────────────────────────────── */');
lines.push(...byProp.text);
lines.push('\n/* ── borders ───────────────────────────────────────────── */');
lines.push(...byProp.border);

writeFileSync(OUT, lines.join('\n') + '\n');

const total = byProp.bg.length + byProp.text.length + byProp.border.length;
console.log(
  `palette.css: ${total} rules (${byProp.bg.length} bg, ${byProp.text.length} text, ${byProp.border.length} border) from ${found.size} colour/property pairs`,
);
