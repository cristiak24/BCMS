import type { ReactNode } from 'react';
import { View, Text } from '@/src/web/reactNative';

/**
 * Page title block at admin's type scale.
 *
 * Measured from `/admin/roster`: title 28px / 700 / -0.7px tracking, subtitle
 * 13px / 500. The player screens were running 30-36px black titles with a
 * 44px-tall icon tile beside them, which is what made them read as a different
 * product from admin.
 *
 * `actions` sits right of the title at every width; the title column is
 * min-w-0 and wraps, so a long name can never push the action off-screen.
 */
export default function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    // Actions share the title row at every width. Every caller passes one small
    // control (refresh / back); on phones it used to drop onto its own row,
    // spending ~50px of the screen on a lone icon. The title wraps instead.
    <View className={`flex-row items-start justify-between gap-3 mb-4 ${className ?? ''}`}>
      <View className="flex-1 min-w-0">
        <Text
          className="text-[24px] md:text-[28px] font-bold leading-tight"
          style={{ color: 'var(--c-ink)', letterSpacing: '-0.7px' } as any}
          numberOfLines={2}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-[13px] font-medium mt-1" style={{ color: 'var(--c-muted)' }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actions ? <View className="flex-row items-center flex-wrap gap-2 shrink-0">{actions}</View> : null}
    </View>
  );
}
