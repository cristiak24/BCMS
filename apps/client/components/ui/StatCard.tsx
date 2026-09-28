import type { ReactNode } from 'react';
import { Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useCountUp } from '../../hooks/useCountUp';

/**
 * KPI card used on the coach and player home: tinted icon chip, label, a
 * counting-up figure and a one-line hint.
 *
 * Tones map onto the status token families so the same card reads correctly
 * in light and dark mode — the chip is `-bg` with `-fg` icon, never a raw hex.
 */

export type StatTone = 'brand' | 'success' | 'warning' | 'danger' | 'sky' | 'purple' | 'neutral';

export const STAT_TONES: Record<StatTone, { bg: string; fg: string }> = {
  brand: { bg: 'var(--c-surface-tint)', fg: 'var(--c-brand-fg)' },
  success: { bg: 'var(--c-success-bg)', fg: 'var(--c-success-fg)' },
  warning: { bg: 'var(--c-warning-bg)', fg: 'var(--c-warning-fg)' },
  danger: { bg: 'var(--c-danger-bg)', fg: 'var(--c-danger-fg)' },
  sky: { bg: 'var(--c-sky-bg)', fg: 'var(--c-sky-fg)' },
  purple: { bg: 'var(--c-purple-bg)', fg: 'var(--c-purple-fg)' },
  neutral: { bg: 'var(--c-surface-3)', fg: 'var(--c-ink-soft)' },
};

export default function StatCard({
  icon,
  label,
  value,
  suffix,
  hint,
  tone = 'brand',
  footer,
}: {
  icon: string;
  label: string;
  /** Numbers count up; strings render as-is. */
  value: number | string | null | undefined;
  suffix?: string;
  hint?: string;
  tone?: StatTone;
  footer?: ReactNode;
}) {
  const numeric = typeof value === 'number' ? value : null;
  const animated = useCountUp(numeric);
  const display = numeric != null ? animated : value;
  const colors = STAT_TONES[tone];

  return (
    <View
      className="ui-lift rounded-[16px] border p-4 min-w-0 h-full"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
    >
      {/* Icon stacks above the label below sm: in a 3-up grid at 375px the
          side-by-side layout left the label ~30px and cut it to "PREZ". */}
      <View className="flex-col items-start sm:flex-row sm:items-center gap-2 sm:gap-2.5 min-w-0">
        <View className="w-9 h-9 rounded-[10px] items-center justify-center shrink-0" style={{ backgroundColor: colors.bg }}>
          <MaterialIcons name={icon} size={18} color={colors.fg} />
        </View>
        <Text className="t-eyebrow w-full sm:w-auto sm:flex-1 min-w-0" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
          {label}
        </Text>
      </View>

      <View className="flex-row items-end gap-0.5 mt-3">
        <Text className="t-num text-[26px] md:text-[28px] font-bold leading-none" style={{ color: 'var(--c-ink-strong)' }} numberOfLines={1}>
          {display == null || display === '' ? '—' : display}
        </Text>
        {suffix && display != null ? (
          <Text className="text-[14px] font-bold mb-0.5" style={{ color: 'var(--c-muted)' }}>{suffix}</Text>
        ) : null}
      </View>

      {hint ? (
        <Text className="t-meta mt-1.5" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{hint}</Text>
      ) : null}
      {footer}
    </View>
  );
}
