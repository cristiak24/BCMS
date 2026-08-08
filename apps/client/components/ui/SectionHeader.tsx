import type { ReactNode } from 'react';
import { View, Text, Pressable } from '@/src/web/reactNative';

/**
 * Promoted verbatim (in geometry) from the local copy inside
 * `app/(tabs)/index.tsx`, which was the only screen that had one.
 *
 * Two changes on promotion:
 *   • its three hard-coded hexes (orange eyebrow, navy title, slate subtitle)
 *     became tokens, so the header now follows the theme instead of staying
 *     orange-on-navy in dark mode;
 *   • the action became a real Pressable with an accessible name — it was a
 *     bare Text before, so it was neither focusable nor announced.
 *
 * 17px / 700 matches admin's section title (measured on the schedule rail).
 */
export default function SectionHeader({
  eyebrow,
  title,
  subtitle,
  actionLabel,
  onAction,
  trailing,
  isMobile = false,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  trailing?: ReactNode;
  isMobile?: boolean;
}) {
  return (
    <View className={`${isMobile ? 'gap-3' : 'flex-row items-end justify-between gap-4'} mb-4`}>
      <View className="flex-1 min-w-0">
        {eyebrow ? (
          <Text
            className="text-[10px] font-bold uppercase tracking-[0.09em] mb-1.5"
            style={{ color: 'var(--c-brand-fg)' }}
          >
            {eyebrow}
          </Text>
        ) : null}
        <Text className="text-[17px] font-bold leading-tight" style={{ color: 'var(--c-ink)' }}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-[13px] font-medium mt-1 leading-5" style={{ color: 'var(--c-muted)' }}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {trailing ?? (actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          // self-start: on mobile the wrapper is a column, so without it the
          // button stretched to the full row width and read as a form field
          // rather than a link.
          className="h-8 px-3 rounded-[9px] justify-center border shrink-0 self-start"
          style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}
        >
          <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null)}
    </View>
  );
}
