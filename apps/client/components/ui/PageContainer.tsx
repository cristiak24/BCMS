import type { ReactNode } from 'react';
import { View } from '@/src/web/reactNative';

/**
 * The single page measure for every player screen.
 *
 * Before this existed the six player screens used six different max-widths
 * (1152 / 768 / 1024 / 1280 / 1440 / none), so no two pages lined up and
 * `team.tsx` threw away 268px of a 1280px viewport — nearly 900px on a wide
 * desktop.
 *
 * Admin solves this by NOT capping the measure at all: every admin page
 * (`dashboard`, `roster`, `finance`, `schedule`) computes `maxWidth: none` and
 * fills the shell, letting the responsive padding do the work. Measured:
 * 12 / 16 / 24 / 32px horizontal, 12 / 20px top. This mirrors that exactly, so
 * a player page and an admin page sitting at the same viewport share a gutter.
 */
export default function PageContainer({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  /** Escape hatch for safe-area insets only — do not use it to re-cap the measure. */
  style?: Record<string, unknown>;
}) {
  return (
    <View className={`w-full px-3 sm:px-4 lg:px-6 xl:px-8 pt-3 lg:pt-5 ${className ?? ''}`} style={style as any}>
      {children}
    </View>
  );
}
