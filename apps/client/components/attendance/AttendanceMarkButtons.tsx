import { useRef } from 'react';
import { ActivityIndicator, Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { ATTENDANCE_MARKS, toAttendanceMark, type AttendanceMark } from '../../utils/attendanceStatus';

/**
 * The four marks as one segmented control, shared by the coach "Prezență"
 * screen and the admin sheet. The filled segment is the row's only status
 * indicator. Icons only where there is room: not in a phone's quarters
 * (below `sm`), nor beside the player's name in the md–2xl row, where four
 * icon pills squeezed the name to "Luca …".
 *
 * Keyboard: one Tab stop per player (the current mark, or the first), arrows /
 * Home / End move between the four, Space or Enter sets the mark. Arrows only
 * move focus — each mark saves at once, so walking past one mustn't record it.
 */
export default function AttendanceMarkButtons({
  value,
  playerName,
  busy = false,
  disabled = false,
  onMark,
}: {
  value: string | null | undefined;
  playerName: string;
  busy?: boolean;
  disabled?: boolean;
  onMark: (mark: AttendanceMark) => void;
}) {
  const current = toAttendanceMark(value);
  const inactive = busy || disabled;
  const groupRef = useRef<HTMLElement | null>(null);
  const tabStop = Math.max(0, ATTENDANCE_MARKS.findIndex((option) => option.status === current));

  const onKeyDown = (event: { key: string; preventDefault: () => void }) => {
    const radios = Array.from(groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []);
    const at = radios.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    const last = radios.length - 1;
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (at === last ? 0 : at + 1)
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (at === 0 ? last : at - 1)
        : event.key === 'Home' ? 0
          : event.key === 'End' ? last
            : null;
    if (next === null) return;
    event.preventDefault();
    radios[next]?.focus();
  };

  return (
    <View
      ref={groupRef}
      className="flex-row gap-1.5 shrink-0"
      accessibilityRole={'radiogroup' as any}
      accessibilityLabel={`Prezență ${playerName}`}
      onKeyDown={onKeyDown}
    >
      {ATTENDANCE_MARKS.map((option, index) => {
        const selected = current === option.status;
        return (
          <Pressable
            key={option.status}
            tabIndex={index === tabStop ? 0 : -1}
            disabled={inactive}
            onPress={() => onMark(option.status)}
            accessibilityRole={'radio' as any}
            accessibilityState={{ selected, checked: selected, disabled: inactive } as any}
            accessibilityLabel={`${option.label}: ${playerName}`}
            className="ui-press flex-1 md:flex-none min-w-0 h-11 rounded-[11px] border px-1 sm:px-3 flex-row items-center justify-center gap-1.5"
            style={{
              borderColor: selected ? option.fg : 'var(--c-border)',
              backgroundColor: selected ? option.bg : 'var(--c-surface-2)',
              boxShadow: selected ? `inset 0 0 0 1px ${option.fg}` : 'none',
              opacity: disabled && !selected ? 0.55 : busy ? 0.7 : 1,
              cursor: disabled ? 'not-allowed' : undefined,
              transition: 'background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
            } as any}
          >
            {busy && selected ? (
              <ActivityIndicator size="small" color={option.fg} />
            ) : (
              <View className="hidden sm:flex md:hidden 2xl:flex">
                <MaterialIcons name={option.icon} size={16} color={selected ? option.fg : 'var(--c-muted)'} />
              </View>
            )}
            <Text className="text-[12.5px] font-bold" style={{ color: selected ? option.fg : 'var(--c-muted)' }} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
