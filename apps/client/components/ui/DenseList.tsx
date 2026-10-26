import type { ReactNode } from 'react';
import { Text, View } from '@/src/web/reactNative';

/**
 * The app's list pattern: ONE bordered container with hairline separators
 * between rows, the way Conformitate and Conturi already render. Lot (phones),
 * Contacte, the team roster, Prezență and the L12 match list each drew a
 * separate card per row instead — gap-3 stacks with their own border and
 * shadow, ~2.300px for an 11-player squad on a phone.
 *
 * Separators come from the container (`[&>*+*]:border-t`), so rows don't need
 * their index. Rows are list items: put a Pressable inside a DenseRow, not the
 * other way round.
 */
export function DenseList({
  children,
  label,
  header,
  className,
}: {
  children: ReactNode;
  /** Accessible name of the list, e.g. "Jucători". */
  label?: string;
  /** Column titles; outside the separated rows, so hiding it on phones leaves no double line. */
  header?: ReactNode;
  className?: string;
}) {
  return (
    <View
      className={`rounded-[14px] border overflow-hidden ${className ?? ''}`}
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-xs)' } as any}
    >
      {header}
      <View
        accessibilityRole={'list' as any}
        accessibilityLabel={label}
        className="[&>*+*]:border-t [&>*+*]:border-t-[color:var(--c-border)]"
      >
        {children}
      </View>
    </View>
  );
}

/** Column titles over a DenseList, desktop only by default. */
export function DenseHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <View
      aria-hidden
      className={`hidden md:flex flex-row items-center gap-3 px-3 py-2 border-b ${className ?? ''}`}
      style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' }}
    >
      {children}
    </View>
  );
}

/** One column title in a DenseHeader. */
export function DenseHeading({ children, className }: { children: string; className?: string }) {
  return <Text className={`t-eyebrow ${className ?? ''}`} style={{ color: 'var(--c-faint)' }}>{children}</Text>;
}

/**
 * One row: 56px minimum, 12px sides. `selected` tints it like Conformitate's
 * rows. `stacked` is for a row whose detail sits under its header line (phone
 * numbers, an inline editor) — still a row of the list, not a card.
 */
export function DenseRow({
  children,
  selected,
  stacked,
  className,
}: {
  children: ReactNode;
  selected?: boolean;
  stacked?: boolean;
  className?: string;
}) {
  return (
    <View
      accessibilityRole={'listitem' as any}
      className={`${stacked ? 'flex-col gap-2.5' : 'flex-row items-center gap-3'} px-3 py-2.5 min-h-[56px] ${className ?? ''}`}
      // Only when selected: an inline background would beat a hover: class.
      style={selected ? { backgroundColor: 'var(--c-surface-tint)' } : undefined}
    >
      {children}
    </View>
  );
}

/** 36px initials disc for a person or team row. */
export function DenseAvatar({ initials, tone = 'neutral', className }: { initials: string; tone?: 'neutral' | 'brand'; className?: string }) {
  return (
    <View
      aria-hidden
      className={`w-9 h-9 rounded-full items-center justify-center shrink-0 ${className ?? ''}`}
      style={{ backgroundColor: tone === 'brand' ? 'var(--c-surface-tint)' : 'var(--c-surface-3)' }}
    >
      <Text className="text-[12px] font-bold" style={{ color: tone === 'brand' ? 'var(--c-brand-fg)' : 'var(--c-ink-soft)' }}>
        {initials}
      </Text>
    </View>
  );
}
