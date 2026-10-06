import type { ReactNode } from 'react';
import { Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import type { StatTone } from '../ui/StatCard';
import { STAT_TONES } from '../ui/StatCard';

/**
 * Shared pieces for the profile screen.
 *
 * The profile used `AuraInput` (52px fields, 12px black uppercase labels, a
 * hard-coded white field on a dark card) and two cards titled in 12px
 * uppercase — so a form with four fields was taller than the viewport and
 * nothing on the page read as a heading. These are the admin-density
 * equivalents, entirely token-driven.
 */

export function ProfileCard({
  icon,
  tone = 'brand',
  title,
  description,
  trailing,
  children,
  className,
}: {
  icon: string;
  tone?: StatTone;
  title: string;
  description?: string;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const colors = STAT_TONES[tone];
  return (
    <View
      className={`ui-rise rounded-[16px] border ${className ?? ''}`}
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
    >
      <View className="flex-row items-start gap-3 px-4 pt-4 pb-3.5 border-b" style={{ borderColor: 'var(--c-border-soft)' } as any}>
        <View className="w-8 h-8 rounded-[10px] items-center justify-center shrink-0" style={{ backgroundColor: colors.bg }}>
          <MaterialIcons name={icon} size={18} color={colors.fg} />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="f-display text-[16px] font-bold" style={{ color: 'var(--c-ink-strong)', letterSpacing: '-0.015em' } as any}>{title}</Text>
          {description ? (
            <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>{description}</Text>
          ) : null}
        </View>
        {trailing ? <View className="shrink-0">{trailing}</View> : null}
      </View>
      <View className="px-4 py-4">{children}</View>
    </View>
  );
}

// The labelled text field moved to components/ui/FormField so non-profile
// forms (e.g. the schedule's "Eveniment nou") use the same control.
export { FormField as ProfileField } from '../ui/FormField';

/** Inline success / error banner under a form. */
export function FormNotice({ tone, message }: { tone: 'success' | 'danger'; message: string }) {
  const success = tone === 'success';
  return (
    <View
      className="ui-rise flex-row items-center gap-2.5 rounded-[12px] border px-3.5 py-2.5"
      style={{
        backgroundColor: success ? 'var(--c-success-bg)' : 'var(--c-danger-bg)',
        borderColor: success ? 'var(--c-success-border)' : 'var(--c-danger-border)',
      } as any}
      accessibilityRole="alert"
    >
      <MaterialIcons name={success ? 'check-circle' : 'error-outline'} size={17} color={success ? 'var(--c-success-fg)' : 'var(--c-danger-fg)'} />
      <Text className="text-[13px] font-semibold flex-1" style={{ color: success ? 'var(--c-success-fg)' : 'var(--c-danger-fg)' }}>
        {message}
      </Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  icon,
  onPress,
  loading,
  disabled,
  loadingLabel,
}: {
  label: string;
  icon: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  loadingLabel?: string;
}) {
  const inactive = Boolean(disabled || loading);
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: Boolean(loading) }}
      className="ui-press h-11 rounded-[11px] px-5 flex-row items-center justify-center gap-2"
      style={{
        backgroundColor: 'var(--c-brand-surface)',
        boxShadow: inactive ? 'none' : 'var(--e-brand)',
        opacity: disabled && !loading ? 0.5 : 1,
        cursor: inactive ? 'not-allowed' : 'pointer',
      } as any}
    >
      {loading ? (
        <View className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(255,255,255,0.35)', borderTopColor: '#FFFFFF' } as any} />
      ) : (
        <MaterialIcons name={icon} size={17} color="var(--c-on-brand)" />
      )}
      <Text className="text-[13.5px] font-bold" style={{ color: 'var(--c-on-brand)' }}>{loading && loadingLabel ? loadingLabel : label}</Text>
    </Pressable>
  );
}
