import { Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';

type FilterBarItem = {
  key: string;
  label: string;
  value: string;
  icon?: string;
  active?: boolean;
  loading?: boolean;
  onPress: () => void;
};

/**
 * Filter selectors (league / season / team / month).
 *
 * Phones: a 2×2 grid of full-width tiles — label over value, so a long team
 * name wraps to its own line instead of running off-screen. The old single
 * horizontal pill row was wider than the viewport and clipped "CS Dinamo" to
 * "CS Din" with no hint that it scrolled.
 * Desktop (lg+): the same tiles as one compact row.
 */
export default function FilterBar({ items }: { items: FilterBarItem[] }) {
  return (
    <View className="w-full lg:w-auto grid grid-cols-2 gap-2 lg:flex lg:flex-row lg:flex-wrap lg:gap-1.5">
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={item.onPress}
          accessibilityRole="button"
          accessibilityLabel={`${item.label}: ${item.loading ? 'se încarcă' : item.value}`}
          className="ui-press min-w-0 rounded-[12px] border pl-3.5 pr-2.5 py-2.5 lg:py-2 flex-row items-center gap-1.5 lg:gap-2.5 text-left"
          style={{
            backgroundColor: item.active ? 'var(--c-surface-tint)' : 'var(--c-surface)',
            borderColor: item.active ? 'var(--c-brand-border)' : 'var(--c-border)',
          } as any}
        >
          {item.icon ? (
            // Desktop only: on a ~165px phone tile the icon cost the value
            // its room ("2026-\n2027", "Septembrie" clipped).
            <View
              className="hidden lg:flex w-8 h-8 rounded-[9px] items-center justify-center shrink-0"
              style={{ backgroundColor: item.active ? 'var(--c-surface)' : 'var(--c-surface-2)' }}
            >
              <MaterialIcons name={item.icon} size={16} color={item.active ? 'var(--c-brand-fg)' : 'var(--c-muted)'} />
            </View>
          ) : null}
          <View className="flex-1 min-w-0">
            <Text className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--c-faint)' }} numberOfLines={1}>
              {item.label}
            </Text>
            <Text
              className="text-[13.5px] font-semibold mt-0.5 leading-tight lg:max-w-[180px]"
              style={{ color: 'var(--c-ink)' }}
              // Two lines on a phone tile: team names are long.
              numberOfLines={2}
            >
              {item.loading ? 'Se încarcă…' : item.value}
            </Text>
          </View>
          <MaterialIcons name="expand-more" size={16} color="var(--c-faint)" />
        </Pressable>
      ))}
    </View>
  );
}
