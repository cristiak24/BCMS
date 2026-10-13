import type { ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { initialsOf, monthLabel, roleLabel, roleVisual, statusVisual } from './format';

/**
 * Small building blocks of the super admin console. Neutral surfaces, hairline
 * borders, colour only as accents — same language as the admin home.
 */

export function Panel({
  title,
  subtitle,
  action,
  children,
  flush = false,
  className,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  /** No inner padding: for dense lists that draw their own row dividers. */
  flush?: boolean;
  className?: string;
}) {
  return (
    <View
      className={`rounded-[16px] border min-w-0 overflow-hidden ${className ?? ''}`}
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-xs)' } as any}
    >
      {title ? (
        <View className={`flex-row items-start justify-between gap-3 px-4 pt-4 ${flush ? 'pb-3 border-b' : 'pb-1'}`} style={{ borderColor: 'var(--c-border)' }}>
          <View className="flex-1 min-w-0">
            <Text className="text-[15px] font-bold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>{subtitle}</Text> : null}
          </View>
          {action ? <View className="shrink-0">{action}</View> : null}
        </View>
      ) : null}
      <View className={flush ? '' : 'p-4'}>{children}</View>
    </View>
  );
}

export function RolePill({ role }: { role: string }) {
  const visual = roleVisual(role);
  return (
    <View className="self-start rounded-full px-2.5 py-1" style={{ backgroundColor: visual.tint }}>
      <Text className="text-[11.5px] font-semibold" style={{ color: visual.fg }} numberOfLines={1}>{roleLabel(role)}</Text>
    </View>
  );
}

export function StatusLabel({ status }: { status: string }) {
  const visual = statusVisual(status);
  return (
    <View className="flex-row items-center gap-1.5 min-w-0">
      <View className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: visual.dot }} />
      <Text className="text-[13px] font-medium" style={{ color: visual.fg }} numberOfLines={1}>{visual.label}</Text>
    </View>
  );
}

export function Avatar({ name, email, role, invite }: { name: string; email?: string; role: string; invite?: boolean }) {
  const visual = roleVisual(role);
  return (
    <View
      className="w-9 h-9 rounded-full items-center justify-center shrink-0"
      style={{ backgroundColor: invite ? 'var(--c-warning-bg)' : visual.tint }}
    >
      {invite ? (
        <MaterialIcons name="mail-outline" size={17} color="var(--c-warning-fg)" />
      ) : (
        <Text className="text-[12px] font-bold" style={{ color: visual.fg }}>{initialsOf(name, email)}</Text>
      )}
    </View>
  );
}

export function DeltaPill({ value, suffix = '%' }: { value: number | null; suffix?: string }) {
  if (value == null) return null;
  const up = value > 0;
  const flat = value === 0;
  const fg = flat ? 'var(--c-muted)' : up ? 'var(--c-success-fg)' : 'var(--c-danger-fg)';
  const bg = flat ? 'var(--c-surface-3)' : up ? 'var(--c-success-bg)' : 'var(--c-danger-bg)';
  return (
    <View className="flex-row items-center self-start gap-0.5 rounded-full px-1.5 py-0.5" style={{ backgroundColor: bg }}>
      {!flat ? <MaterialIcons name={up ? 'trending-up' : 'trending-down'} size={13} color={fg} /> : null}
      <Text className="text-[11px] font-bold t-num" style={{ color: fg }}>{up ? '+' : ''}{value}{suffix}</Text>
    </View>
  );
}

/** Thin horizontal meter (share of a total). */
export function Meter({ value, max, tone = 'var(--c-brand-surface)' }: { value: number; max: number; tone?: string }) {
  const width = max > 0 ? Math.max(value > 0 ? 3 : 0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <View className="h-1.5 rounded-full overflow-hidden w-full" style={{ backgroundColor: 'var(--c-surface-3)' }}>
      <View className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: tone, animation: 'uiBarGrow 0.7s var(--ease-out) both', transformOrigin: 'left' } as any} />
    </View>
  );
}

/**
 * Monthly columns (last N months). Each column carries its value as a label
 * above it, so the chart reads without hovering — important on phones.
 */
export function MonthBars({
  points,
  format = (value) => String(value),
  highlightLast = true,
  emptyLabel = 'Fără date',
}: {
  points: Array<{ month: string; value: number | null }>;
  format?: (value: number) => string;
  highlightLast?: boolean;
  emptyLabel?: string;
}) {
  const max = Math.max(0, ...points.map((point) => point.value ?? 0));
  return (
    <View className="flex-row items-end gap-2 sm:gap-3 h-[150px] pt-2">
      {points.map((point, index) => {
        const value = point.value ?? 0;
        const last = highlightLast && index === points.length - 1;
        const height = max > 0 ? Math.max(value > 0 ? 6 : 2, (value / max) * 100) : 2;
        return (
          <View key={point.month} className="flex-1 min-w-0 h-full items-center justify-end gap-1.5" accessibilityLabel={`${monthLabel(point.month)}: ${point.value == null ? emptyLabel : format(value)}`}>
            <Text className="text-[11px] font-bold t-num" style={{ color: last ? 'var(--c-ink)' : 'var(--c-muted)' }} numberOfLines={1}>
              {point.value == null ? '—' : format(value)}
            </Text>
            <View className="w-full flex-1 justify-end">
              <View
                className="w-full rounded-t-[6px] rounded-b-[2px]"
                style={{
                  height: `${height}%`,
                  backgroundColor: last ? 'var(--c-brand-surface)' : 'color-mix(in srgb, var(--c-brand-surface) 28%, var(--c-surface-3))',
                } as any}
              />
            </View>
            <Text className="text-[11px] font-semibold uppercase" style={{ color: last ? 'var(--c-ink-soft)' : 'var(--c-faint)' }}>{monthLabel(point.month, true)}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Bordered list container whose rows draw their own top dividers. */
export function ListShell({ header, children }: { header?: ReactNode; children: ReactNode }) {
  return (
    <View className="rounded-[14px] border overflow-hidden" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-xs)' } as any}>
      {header ? (
        <View className="hidden md:flex flex-row items-center px-3 py-2 border-b" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' }}>
          {header}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function HeaderCell({ children, flex = 1, align = 'left' }: { children: string; flex?: number; align?: 'left' | 'right' }) {
  return (
    <Text className="t-eyebrow min-w-0" style={{ color: 'var(--c-faint)', flex, textAlign: align } as any} numberOfLines={1}>
      {children}
    </Text>
  );
}

export function RowMenuButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="ui-press w-8 h-8 rounded-[9px] items-center justify-center hover:bg-[var(--c-surface-3)]"
    >
      <MaterialIcons name="more-horiz" size={20} color="var(--c-muted)" />
    </Pressable>
  );
}

/** One-line explanatory note (billing rules, tracking start…). */
export function Notice({ tone = 'info', icon, children }: { tone?: 'info' | 'warning'; icon?: string; children: ReactNode }) {
  const colors = tone === 'warning'
    ? { bg: 'var(--c-warning-bg)', fg: 'var(--c-warning-fg)', border: 'var(--c-warning-border)' }
    : { bg: 'var(--c-surface-tint)', fg: 'var(--c-brand-fg)', border: 'var(--c-brand-border)' };
  return (
    <View className="flex-row items-start gap-2.5 rounded-[12px] border px-3 py-2.5" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
      <MaterialIcons name={icon ?? (tone === 'warning' ? 'warning-amber' : 'info-outline')} size={17} color={colors.fg} />
      <Text className="flex-1 text-[12.5px] leading-[18px] font-medium" style={{ color: 'var(--c-ink-soft)' }}>{children}</Text>
    </View>
  );
}

/** Compact in-page search (for lists that are not the header's target). */
export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (value: string) => void; placeholder: string; className?: string }) {
  return (
    <View
      className={`flex-row items-center gap-2 rounded-[10px] border px-3 h-9 ${className ?? ''}`}
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
    >
      <MaterialIcons name="search" size={16} color="var(--c-faint)" />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="var(--c-faint)"
        accessibilityLabel={placeholder}
        className="flex-1 min-w-0 bg-transparent text-[16px] sm:text-[13px] font-medium outline-none h-full"
        style={{ color: 'var(--c-ink)', border: 'none' } as any}
      />
      {value ? (
        <Pressable onPress={() => onChange('')} accessibilityLabel="Golește căutarea" className="w-6 h-6 items-center justify-center">
          <MaterialIcons name="close" size={15} color="var(--c-muted)" />
        </Pressable>
      ) : null}
    </View>
  );
}
