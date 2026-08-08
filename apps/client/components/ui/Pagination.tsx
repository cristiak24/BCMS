import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';

/**
 * One pagination implementation for every player list.
 *
 * SINGLE SOURCE OF TRUTH
 * ----------------------
 * `rawPage` is the only state. The page actually rendered is CLAMPED during
 * render and never written back:
 *
 *     const page = Math.min(Math.max(1, rawPage), totalPages);
 *
 * Storing a second, corrected page in state (or repairing it from an effect
 * after the fact) is what produces the classic "shrink the result set and the
 * list goes blank for one frame" bug — the effect only runs after a render has
 * already been committed against an out-of-range page. Clamping at read time
 * means an out-of-range value can never be observed by anything.
 *
 * RESET ON RESULT-SET IDENTITY CHANGE
 * -----------------------------------
 * `resetKey` is a caller-supplied string identifying *which* result set is on
 * screen — filter + search + date range, whatever scopes that list. Any change
 * to it snaps back to page 1. Resetting on the item COUNT instead would be
 * wrong: two different filters can return the same number of rows, and the user
 * would be left stranded on page 3 of a list they just replaced.
 */
export function usePagination<T>(items: T[], pageSize: number, resetKey: string) {
  const [rawPage, setRawPage] = useState(1);

  useEffect(() => {
    setRawPage(1);
  }, [resetKey]);

  return useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    const page = Math.min(Math.max(1, rawPage), totalPages);
    const start = (page - 1) * pageSize;
    const pageItems = items.slice(start, start + pageSize);

    return {
      page,
      totalPages,
      pageItems,
      setPage: setRawPage,
      // 1-based inclusive range for "showing X-Y of Z" copy; 0-0 when empty.
      rangeStart: items.length ? start + 1 : 0,
      rangeEnd: Math.min(start + pageSize, items.length),
      total: items.length,
    };
  }, [items, pageSize, rawPage]);
}

function PageButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'chevron-left' | 'chevron-right';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className={`w-9 h-9 rounded-[10px] items-center justify-center border ${disabled ? 'opacity-40' : ''}`}
      style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}
    >
      <MaterialIcons name={icon} size={18} color={disabled ? 'var(--c-faint)' : 'var(--c-ink-soft)'} />
    </Pressable>
  );
}

/**
 * Renders nothing when there is only one page — a pager for a single page is
 * noise, and it kept the "Pagina 1 din 1" row on screens that had four rows.
 */
export default function Pagination({
  page,
  totalPages,
  onPageChange,
  rangeStart,
  rangeEnd,
  total,
  itemNoun = 'rezultate',
}: {
  page: number;
  totalPages: number;
  onPageChange: (updater: (current: number) => number) => void;
  rangeStart?: number;
  rangeEnd?: number;
  total?: number;
  itemNoun?: string;
}) {
  if (totalPages <= 1) return null;

  const summary =
    rangeStart != null && rangeEnd != null && total != null
      ? `Se afișează ${rangeStart}-${rangeEnd} din ${total} ${itemNoun}`
      : `Pagina ${page} din ${totalPages}`;

  return (
    <View className="flex-row items-center justify-between flex-wrap gap-3 mt-4">
      {/* role="status" makes this an ARIA live region, so moving pages is
          announced to a screen reader without stealing focus. */}
      <Text
        className="text-[12px] font-medium"
        style={{ color: 'var(--c-muted)' }}
        accessibilityRole={'status' as any}
      >
        {summary}
      </Text>

      <View className="flex-row items-center gap-2">
        <PageButton
          icon="chevron-left"
          label="Pagina anterioară"
          disabled={page <= 1}
          onPress={() => onPageChange((current) => Math.max(1, current - 1))}
        />
        <View
          className="h-9 min-w-[76px] px-3 rounded-[10px] border items-center justify-center"
          style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}
        >
          <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-ink)' }}>
            {page} / {totalPages}
          </Text>
        </View>
        <PageButton
          icon="chevron-right"
          label="Pagina următoare"
          disabled={page >= totalPages}
          onPress={() => onPageChange((current) => Math.min(totalPages, current + 1))}
        />
      </View>
    </View>
  );
}
