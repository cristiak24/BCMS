import { Text, View } from '@/src/web/reactNative';

function getDateParts(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { month: '—', day: '--' };
  return {
    month: new Intl.DateTimeFormat('ro-RO', { month: 'short' }).format(date).replace('.', '').toUpperCase(),
    day: String(date.getDate()),
  };
}

/**
 * Stacked "SEPT / 29" tile that leads every session row (coach and player).
 * `fg`/`bg` carry the event type's accent so a list can be scanned by colour.
 */
export default function DateTile({ value, fg, bg, size = 48 }: { value: string; fg: string; bg: string; size?: number }) {
  const parts = getDateParts(value);
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
