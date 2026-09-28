import type { ReactNode } from 'react';
import { Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';

/**
 * Greeting panel at the top of the coach and player home.
 *
 * It is an indigo field in BOTH themes, so everything inside uses the fixed
 * `--c-hero-*` tokens rather than the theme-flipping ink tokens — a
 * `--c-ink` title here would turn near-black in light mode on a dark panel.
 */

export function getGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return 'Noapte bună';
  if (hour < 12) return 'Bună dimineața';
  if (hour < 18) return 'Bună ziua';
  return 'Bună seara';
}

export function formatToday(date = new Date()) {
  const text = new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Court lines — decorative, sits behind the content at low opacity. */
function CourtArt() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 240 240"
      width="240"
      height="240"
      className="ui-spin-slow"
      style={{ position: 'absolute', right: -60, top: -70, opacity: 0.16, pointerEvents: 'none' }}
    >
      <g fill="none" stroke="#FFFFFF" strokeWidth="2">
        <circle cx="120" cy="120" r="110" />
        <path d="M10 120h220M120 10v220" />
        <path d="M42 42c28 28 28 128 0 156M198 42c-28 28-28 128 0 156" />
      </g>
    </svg>
  );
}

export function HeroChip({ icon, label }: { icon?: string; label: string }) {
  return (
    <View
      className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1 border"
      style={{ backgroundColor: 'var(--c-hero-chip)', borderColor: 'var(--c-hero-chip-border)' } as any}
    >
      {icon ? <MaterialIcons name={icon} size={13} color="var(--c-hero-fg)" /> : null}
      <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-hero-fg)' }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function HeroButton({
  label,
  icon,
  onPress,
  variant = 'solid',
  className,
}: {
  label: string;
  icon?: string;
  onPress: () => void;
  variant?: 'solid' | 'ghost';
  className?: string;
}) {
  const solid = variant === 'solid';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`ui-press h-10 rounded-[11px] px-4 flex-row items-center justify-center gap-2 border ${className ?? ''}`}
      style={{
        backgroundColor: solid ? '#FFFFFF' : 'var(--c-hero-chip)',
        borderColor: solid ? '#FFFFFF' : 'var(--c-hero-chip-border)',
      } as any}
    >
      {icon ? <MaterialIcons name={icon} size={17} color={solid ? '#312E81' : 'var(--c-hero-fg)'} /> : null}
      <Text className="text-[13px] font-bold" style={{ color: solid ? '#312E81' : 'var(--c-hero-fg)' }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function HeroBanner({
  eyebrow,
  title,
  subtitle,
  chips,
  actions,
  aside,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  chips?: ReactNode;
  actions?: ReactNode;
  /** Right-hand widget on desktop (ring, countdown…); stacks below on mobile. */
  aside?: ReactNode;
}) {
  return (
    <View
      className="ui-rise relative overflow-hidden rounded-[20px] mb-4"
      style={{
        background: 'linear-gradient(135deg, var(--c-hero-from) 0%, var(--c-hero-via) 55%, var(--c-hero-to) 100%)',
        boxShadow: '0 10px 30px -12px rgba(49, 46, 129, 0.55)',
      } as any}
    >
      <View className="ui-hero-sheen absolute inset-0" style={{ pointerEvents: 'none' } as any} />
      <CourtArt />

      <View className="relative px-5 py-5 md:px-7 md:py-6 flex-col md:flex-row md:items-center gap-5">
        <View className="flex-1 min-w-0">
          {eyebrow ? (
            <Text className="t-eyebrow" style={{ color: 'var(--c-hero-muted)' }}>{eyebrow}</Text>
          ) : null}
          <Text
            className="text-[24px] md:text-[28px] font-bold mt-1.5 leading-tight"
            style={{ color: 'var(--c-hero-fg)', letterSpacing: '-0.6px' } as any}
            numberOfLines={2}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-[14px] font-medium mt-1.5 leading-5" style={{ color: 'var(--c-hero-muted)' }}>
              {subtitle}
            </Text>
          ) : null}
          {chips ? <View className="flex-row flex-wrap gap-2 mt-3.5">{chips}</View> : null}
          {actions ? <View className="flex-row flex-wrap gap-2 mt-4">{actions}</View> : null}
        </View>

        {aside ? <View className="shrink-0 md:max-w-[320px] w-full md:w-auto">{aside}</View> : null}
      </View>
    </View>
  );
}
