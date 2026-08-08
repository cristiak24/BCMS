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
 * `actions` is right-aligned on desktop and wraps below the title on mobile so
 * a long club name can never push a button off-screen.
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
    <View className={`flex-col md:flex-row md:items-start md:justify-between gap-3 mb-4 ${className ?? ''}`}>
      <View className="flex-1 min-w-0">
        <Text
          className="text-[28px] font-bold"
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
