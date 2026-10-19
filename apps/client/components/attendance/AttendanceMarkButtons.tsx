import { ActivityIndicator, Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { ATTENDANCE_MARKS, toAttendanceMark, type AttendanceMark } from '../../utils/attendanceStatus';

/**
 * The four marks as one segmented control, shared by the coach "Prezență"
 * screen and the admin sheet. The filled segment is the row's only status
 * indicator. On a phone the four share the row in quarters, so the icons
 * drop out below `sm` — four icon+label pills did not fit in 375px.
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

  return (
    <View className="flex-row gap-1.5 shrink-0" accessibilityRole={'radiogroup' as any} accessibilityLabel={`Prezență ${playerName}`}>
      {ATTENDANCE_MARKS.map((option) => {
        const selected = current === option.status;
        return (
          <Pressable
            key={option.status}
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
              <View className="hidden sm:flex">
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
