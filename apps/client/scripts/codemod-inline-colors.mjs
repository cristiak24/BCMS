#!/usr/bin/env node
/*
 * Rewrites hardcoded hex colours that live in JS values — not in Tailwind
 * class strings — into `var(--c-…)` token references.
 *
 * WHY A SEPARATE PASS
 * -------------------
 * palette.css can only reach colours that ended up as a CSS class. It cannot
 * touch these, which are just as common:
 *
 *     <MaterialIcons color="#1D3E90" />
 *     style={{ backgroundColor: '#0E2041' }}
 *     colors={['#2B3FA8', '#4A5FD9']}          // LinearGradient
 *
 * The app renders through the react-native-web shim, where these become plain
 * inline CSS values, so `var(--c-brand-fg)` resolves normally — the codebase
 * already does this in newer code (`color="var(--c-muted)"`).
 *
 * Only colours inside string literals are touched, and only exact matches
 * from the table below, so the transform can't corrupt non-colour strings.
 *
 * Run: node scripts/codemod-inline-colors.mjs [--dry]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['app', 'components', 'hooks', 'constants'].map((d) => join(ROOT, d));
const DRY = process.argv.includes('--dry');

/* Inline colours are almost always icons, borders or fills — i.e. a
 * foreground role — so the mapping here favours the *-fg tokens where the
 * legacy hex was ambiguous between a fill and a foreground. */
const MAP = {
  // Brand navy → brand foreground (icons/text) — the dominant inline use.
  '#1D3E90': 'var(--c-brand-fg)',
  '#123A97': 'var(--c-brand-fg)',
  '#123B95': 'var(--c-brand-fg)',
  '#173AA8': 'var(--c-brand-fg)',
  '#0A2C93': 'var(--c-brand-fg)',
  '#102A72': 'var(--c-brand-strong)',
  '#082A9B': 'var(--c-brand-fg)',
  '#12309A': 'var(--c-brand-fg)',
  '#143BB6': 'var(--c-brand-surface)',
  '#173EC1': 'var(--c-brand-surface)',
  '#2B3FA8': 'var(--c-brand-surface)',
  '#4A5FD9': 'var(--c-brand-strong)',

  // Ink ramp.
  '#0E2041': 'var(--c-ink)',
  '#07152F': 'var(--c-ink-strong)',
  '#050817': 'var(--c-ink-strong)',
  '#0D1F3A': 'var(--c-ink-strong)',
  '#111827': 'var(--c-ink-strong)',
  '#172033': 'var(--c-ink-strong)',
  '#1E293B': 'var(--c-ink-soft)',
  '#2D3345': 'var(--c-ink-soft)',
  '#334155': 'var(--c-ink-soft)',
  '#3F4657': 'var(--c-ink-soft)',
  '#475569': 'var(--c-ink-soft)',
  '#4B5563': 'var(--c-ink-soft)',
  '#53627A': 'var(--c-muted)',
  '#56627F': 'var(--c-muted)',
  '#64748B': 'var(--c-muted)',
  '#6B7280': 'var(--c-muted)',
  '#6B7AA6': 'var(--c-muted)',
  '#7483A6': 'var(--c-muted)',
  '#7C90B0': 'var(--c-faint)',
  '#8AA0D0': 'var(--c-faint)',
  '#8EA1B8': 'var(--c-faint)',
  '#94A3B8': 'var(--c-faint)',
  '#9AA7C2': 'var(--c-faint)',
  '#CBD5E1': 'var(--c-border-strong)',

  // Dark panel fills.
  '#0B1E3D': 'var(--c-brand-surface-deep)',
  '#0D2040': 'var(--c-brand-surface-deep)',

  // Surfaces / hairlines.
  '#FFFFFF': 'var(--c-surface)',
  '#F8FAFC': 'var(--c-surface-2)',
  '#F1F5F9': 'var(--c-surface-3)',
  '#F4F8FD': 'var(--c-surface-2)',
  '#F7F9FF': 'var(--c-surface-2)',
  '#F8FBFF': 'var(--c-surface-2)',
  '#FBFDFF': 'var(--c-surface-2)',
  '#EAF1F8': 'var(--c-bg-alt)',
  '#EDF4FB': 'var(--c-bg)',
  '#E2E8F0': 'var(--c-border)',
  '#E3E9F2': 'var(--c-border)',
  '#DDE7F5': 'var(--c-border)',
  '#DDE8F5': 'var(--c-border)',
  '#E3ECF6': 'var(--c-border)',
  '#E8EEF7': 'var(--c-border)',
  '#E5ECF6': 'var(--c-border)',
  '#CFE0EF': 'var(--c-border-strong)',
  '#E8EEFF': 'var(--c-surface-tint)',
  '#EEF3FF': 'var(--c-surface-tint)',
  '#EBF1FF': 'var(--c-surface-tint)',
  '#EAF2FF': 'var(--c-surface-tint)',
  '#DDE6FF': 'var(--c-surface-tint)',
  '#DCE6FF': 'var(--c-surface-tint)',
  '#E7EEFF': 'var(--c-surface-tint)',
  '#E0F2FE': 'var(--c-surface-tint)',
  '#F0F9FF': 'var(--c-surface-tint)',

  // Accents & status.
  '#2563EB': 'var(--c-blue)',
  '#1D4ED8': 'var(--c-blue-deep)',
  '#3B82F6': 'var(--c-blue)',
  '#0EA5E9': 'var(--c-sky)',
  '#38BDF8': 'var(--c-sky)',
  '#38BAF8': 'var(--c-sky)',
  '#0369A1': 'var(--c-sky)',
  '#006092': 'var(--c-sky)',
  '#635BFF': 'var(--c-purple)',
  '#7C3AED': 'var(--c-purple)',
  '#8B5CF6': 'var(--c-purple)',
  '#6D28D9': 'var(--c-purple)',
  '#10B981': 'var(--c-success)',
  '#059669': 'var(--c-success)',
  '#16A34A': 'var(--c-success)',
  '#22C55E': 'var(--c-success)',
  '#047857': 'var(--c-success-fg)',
  '#0B7A55': 'var(--c-success-fg)',
  '#087A2F': 'var(--c-success-fg)',
  '#DC2626': 'var(--c-danger)',
  '#EF4444': 'var(--c-danger)',
  '#D21717': 'var(--c-danger)',
  '#B42318': 'var(--c-danger-fg)',
  '#B91C1C': 'var(--c-danger-fg)',
  '#BE123C': 'var(--c-danger-fg)',
  '#B00000': 'var(--c-danger-fg)',
  '#F59E0B': 'var(--c-warning)',
  '#FDBA2D': 'var(--c-warning)',
  '#D97706': 'var(--c-warning)',
  '#F97316': 'var(--c-warning)',
  '#B45309': 'var(--c-warning-fg)',
  '#92400E': 'var(--c-warning-fg)',
  '#C2410C': 'var(--c-warning-fg)',

  '#0E2F82': 'var(--c-brand-fg)',
  '#4338CA': 'var(--c-brand-strong)',
  '#4F46E5': 'var(--c-brand-surface)',
  '#0B1B42': 'var(--c-brand-surface-deep)',
  '#8BA0BC': 'var(--c-faint)',
  '#E11D48': 'var(--c-danger)',
  '#991B1B': 'var(--c-danger-fg)',
  '#FCA5A5': 'var(--c-danger-bg)',
  '#E6F8F1': 'var(--c-success-bg)',
  '#A7F3D0': 'var(--c-success-bg)',
  '#FDE68A': 'var(--c-warning-bg)',
  '#0284C7': 'var(--c-sky)',
  '#0891B2': 'var(--c-sky)',
  '#0E7490': 'var(--c-sky)',
  '#007A99': 'var(--c-sky)',
  '#2EA6F2': 'var(--c-sky)',
  '#2BB6F6': 'var(--c-sky)',
  '#BED0E5': 'var(--c-border-strong)',

  // Light tints used as text/icon ON dark or brand-filled surfaces.
  '#D6E6FF': 'var(--c-tint-fg)',
  '#BFD0FF': 'var(--c-tint-fg)',
  '#CFE2FF': 'var(--c-tint-fg)',
  '#AFC4FF': 'var(--c-tint-fg)',
  '#BFEFFF': 'var(--c-tint-fg)',
};

// Case-insensitive lookup, since the codebase mixes #38BDF8 and #38bdf8.
const LOOKUP = new Map(Object.entries(MAP).map(([k, v]) => [k.toUpperCase(), v]));

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

// A hex inside a quoted string, where the string is EXACTLY the colour. This
// deliberately misses `'#1D3E90aa'` and `` `linear-gradient(#1D3E90,…)` ``,
// which need a human decision, and can never match a className string.
const LITERAL = /(['"])(#[0-9A-Fa-f]{6})\1/g;

let filesChanged = 0;
let replacements = 0;
const missed = new Map();

for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    const src = readFileSync(file, 'utf8');
    let hits = 0;
    const next = src.replace(LITERAL, (whole, quote, hex) => {
      const token = LOOKUP.get(hex.toUpperCase());
      if (!token) {
        missed.set(hex.toUpperCase(), (missed.get(hex.toUpperCase()) ?? 0) + 1);
        return whole;
      }
      hits += 1;
      return `${quote}${token}${quote}`;
    });
    if (hits > 0) {
      filesChanged += 1;
      replacements += hits;
      if (!DRY) writeFileSync(file, next);
    }
  }
}

console.log(
  `${DRY ? '[dry] ' : ''}${replacements} inline colours tokenised across ${filesChanged} files`,
);

const top = [...missed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
if (top.length) {
  console.log('\nUnmapped inline hexes (add to MAP if they matter):');
  for (const [hex, count] of top) console.log(`  ${hex}  ×${count}`);
}
