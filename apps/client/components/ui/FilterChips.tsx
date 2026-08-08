import { View, Text, Pressable, ScrollView } from '@/src/web/reactNative';

/**
 * Admin's filter chip, extracted so the player screens stop inventing their own.
 *
 * Geometry measured from `components/schedule/admin/ScheduleToolbar.tsx`:
 * h32, px 10-12, radius 9, 6px gap, 12px/600 label, 7x7 type dot, count in
 * `--c-faint`. The player screens were using 44px-tall, 20px-radius pills with
 * 13px/800 text — twice the visual weight for the same job.
 *
 * MOBILE OVERFLOW
 * ---------------
 * Chips scroll inside their own container rather than wrapping. Wrapping five
 * chips onto three lines on a 375px phone makes every row below jump each time
 * a filter changes; a horizontal scroller keeps the page height stable and,
 * critically, never introduces horizontal scroll on the PAGE itself.
 *
 * ACCESSIBILITY
 * -------------
 * Each chip is a real button with `accessibilityState.selected`, so the active
 * filter is announced rather than being conveyed by colour alone. The dot is
 * decorative — the label always carries the meaning.
 */
export type FilterChipOption<T extends string> = {
  key: T;
  label: string;
  /** Optional colour for the leading dot — pass a token or a meta colour. */
  dot?: string;
  count?: number;
};

export default function FilterChips<T extends string>({
  options,
  value,
  onChange,
  scrollOnMobile = true,
  label = 'Filtre',
}: {
  options: FilterChipOption<T>[];
  value: T;
  onChange: (next: T) => void;
  scrollOnMobile?: boolean;
  label?: string;
}) {
  const row = (
    <View className="flex-row items-center gap-1.5" accessibilityRole={'group' as any} accessibilityLabel={label}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: active }}
            className={`flex-row items-center gap-1.5 h-8 ${option.dot ? 'px-2.5' : 'px-3'} rounded-[9px] justify-center border shrink-0`}
            style={
              active
                ? ({ backgroundColor: 'var(--c-brand-surface)', borderColor: 'transparent' } as any)
                : ({ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any)
            }
          >
            {option.dot ? (
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  backgroundColor: active ? 'var(--c-on-brand)' : option.dot,
                }}
              />
            ) : null}
            <Text
              className="text-[12px] font-semibold"
              style={{ color: active ? 'var(--c-on-brand)' : 'var(--c-ink-soft)' }}
              numberOfLines={1}
            >
              {option.label}
            </Text>
            {option.count != null && option.count > 0 ? (
              <Text
                className="text-[11px] font-semibold"
                style={{ color: active ? 'rgba(255,255,255,0.75)' : 'var(--c-faint)' }}
              >
                {option.count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );

  if (!scrollOnMobile) return row;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-3 sm:mx-0">
      <View className="px-3 sm:px-0">{row}</View>
    </ScrollView>
  );
}
