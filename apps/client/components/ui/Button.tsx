import { ActivityIndicator, Pressable, Text } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';

/**
 * The admin's one button. Pages used to hand-roll their own — 12px black
 * uppercase "NEW ENTRY", 44px pills, hardcoded navy — so two buttons on the
 * same screen rarely matched. Geometry follows the Documents "Încarcă PDF"
 * action: 40px (md) / 32px (sm), radius 10, 13px semibold, sentence case.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: 'var(--c-brand-surface)', fg: 'var(--c-on-brand)', border: 'transparent' },
  secondary: { bg: 'var(--c-surface)', fg: 'var(--c-ink-soft)', border: 'var(--c-border)' },
  danger: { bg: 'var(--c-danger-bg)', fg: 'var(--c-danger-fg)', border: 'transparent' },
  ghost: { bg: 'transparent', fg: 'var(--c-brand-fg)', border: 'transparent' },
};

export default function Button({
  label,
  onPress,
  icon,
  variant = 'secondary',
  size = 'md',
  disabled,
  loading,
  iconOnlyOnMobile,
  accessibilityLabel,
  className,
}: {
  label: string;
  onPress?: () => void;
  icon?: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  disabled?: boolean;
  loading?: boolean;
  /** Collapse to a square icon button below sm (header actions on phones). */
  iconOnlyOnMobile?: boolean;
  accessibilityLabel?: string;
  className?: string;
}) {
  const colors = VARIANTS[variant];
  const inactive = Boolean(disabled || loading);
  const height = size === 'sm' ? 'h-8' : 'h-10';
  const pad = iconOnlyOnMobile && icon
    ? (size === 'sm' ? 'w-8 sm:w-auto sm:px-2.5' : 'w-10 sm:w-auto sm:px-3.5')
    : (size === 'sm' ? 'px-2.5' : 'px-3.5');

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: Boolean(loading) }}
      className={`ui-press ${height} ${pad} rounded-[10px] border flex-row items-center justify-center gap-1.5 shrink-0 ${className ?? ''}`}
      style={{ backgroundColor: colors.bg, borderColor: colors.border, opacity: inactive ? 0.55 : 1 } as any}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.fg} />
      ) : icon ? (
        <MaterialIcons name={icon} size={size === 'sm' ? 15 : 17} color={colors.fg} />
      ) : null}
      <Text
        className={`${size === 'sm' ? 'text-[12.5px]' : 'text-[13px]'} font-semibold ${iconOnlyOnMobile && icon ? 'hidden sm:flex' : ''}`}
        style={{ color: colors.fg }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}
