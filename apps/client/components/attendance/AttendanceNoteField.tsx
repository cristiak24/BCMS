import { Pressable, TextInput } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';

/**
 * The per-player feedback note of an attendance sheet: the chat toggle and the
 * text field. Shared by the admin sheet (app/(admin)/attendance/[id].tsx) and
 * the coach's Prezență (app/(coach)/attendance.tsx); a new or changed note
 * notifies the player's family (server: createFeedbackNotification).
 */

export function AttendanceNoteToggle({
  open,
  hasNote,
  onPress,
  className = '',
}: {
  open: boolean;
  hasNote: boolean;
  onPress: () => void;
  className?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={open ? 'Ascunde nota' : hasNote ? 'Vezi nota' : 'Adaugă notă'}
      accessibilityState={{ expanded: open }}
      className={`ui-press w-9 h-9 rounded-[10px] border items-center justify-center shrink-0 ${className}`}
      style={{
        borderColor: hasNote ? 'color-mix(in srgb, var(--c-brand-fg) 35%, transparent)' : 'var(--c-border)',
        backgroundColor: hasNote ? 'var(--c-surface-tint)' : 'var(--c-surface-2)',
      } as any}
    >
      <MaterialIcons name={hasNote ? 'chat' : 'chat-bubble-outline'} size={16} color={hasNote ? 'var(--c-brand-fg)' : 'var(--c-muted)'} />
    </Pressable>
  );
}

export function AttendanceNoteInput({
  value,
  onChange,
  playerName,
  onBlur,
  editable = true,
}: {
  value: string;
  onChange: (note: string) => void;
  playerName: string;
  onBlur?: () => void;
  editable?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      onBlur={onBlur}
      editable={editable}
      placeholder="Notă / feedback pentru jucător…"
      placeholderTextColor="var(--c-faint)"
      multiline
      maxLength={2000}
      accessibilityLabel={`Notă pentru ${playerName}`}
      className="w-full min-h-[40px] max-h-[140px] rounded-[10px] border px-3 py-2.5 text-[13px] font-medium outline-none"
      style={{
        backgroundColor: 'var(--c-surface-2)',
        borderColor: 'var(--c-border)',
        color: 'var(--c-ink)',
        resize: 'none',
        fieldSizing: 'content',
        lineHeight: '18px',
      } as any}
    />
  );
}
