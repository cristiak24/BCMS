import { parseApiDate } from '@/utils/dates';
import { Text, View } from '@/src/web/reactNative';

function getDateParts(value: string, dayFirst: boolean) {
  const date = parseApiDate(value);
  if (Number.isNaN(date.getTime())) return { month: '—', day: '--' };
  const month = new Intl.DateTimeFormat('ro-RO', { month: 'short' }).format(date);
  return {
    month: dayFirst ? month : month.replace('.', '').toUpperCase(),
    day: String(date.getDate()),
  };
}

/**
 * Stacked "SEPT / 29" tile that leads every session row (coach and player).
 * `fg`/`bg` carry the event type's accent so a list can be scanned by colour.
 * `dayFirst` (admin): "29 / sept." — the day leads, the month in sentence case under it.
 */
export default function DateTile({ value, fg, bg, size = 48, dayFirst = false }: { value: string; fg: string; bg: string; size?: number; dayFirst?: boolean }) {
  const parts = getDateParts(value, dayFirst);
  if (dayFirst) {
    return (
      <View
        className="items-center justify-center rounded-[12px] shrink-0"
        style={{ width: size, height: size, backgroundColor: bg }}
      >
        <Text className="t-num text-[18px] font-bold leading-none" style={{ color: 'var(--c-ink-strong)' }}>{parts.day}</Text>
        <Text className="text-[11px] font-semibold leading-none mt-1" style={{ color: fg }}>{parts.month}</Text>
      </View>
    );
  }
  return (
    <View
      className="items-center justify-center rounded-[12px] shrink-0"
      style={{ width: size, height: size, backgroundColor: bg }}
    >
      <Text className="text-[10.5px] font-bold tracking-[0.06em] leading-none" style={{ color: fg }}>{parts.month}</Text>
      <Text className="t-num text-[18px] font-bold leading-none mt-1" style={{ color: 'var(--c-ink-strong)' }}>{parts.day}</Text>
    </View>
  );
}
