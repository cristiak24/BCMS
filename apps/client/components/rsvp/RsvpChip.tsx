import { Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import type { ResponseStatus } from '../../services/eventResponsesApi';
import { RESPONSE_META, responseLabel, type ResponseVoice } from '../../utils/rsvp';
import { tr } from '../../i18n';
import type { CalendarEvent } from '../../services/eventsApi';
import { useRsvpState } from './useRsvpState';

/**
 * The answer on an agenda row (Acasă, Program): „Vin”, „Nu vin”, „Poate”, or
 * „Confirmă” in brand outline while an open event has no answer — the one thing
 * to do on the row. Visual only: the row itself opens the event sheet, where
 * the answer is given (no button inside a button).
 */
export default function RsvpChip({
  status,
  open,
  voice,
  compact = false,
}: {
  status: ResponseStatus | null | undefined;
  open: boolean;
  voice: ResponseVoice;
  compact?: boolean;
}) {
  const height = compact ? 'h-6 px-2' : 'h-[30px] px-2.5';
  if (!status) {
    if (!open) return null;
    return (
      <View
        className={`${height} rounded-full border flex-row items-center shrink-0`}
        style={{ borderColor: 'var(--c-brand-fg)', backgroundColor: 'var(--c-surface)' } as any}
      >
        <Text className="text-[12px] font-bold" style={{ color: 'var(--c-brand-fg)' }}>{tr('Confirmă')}</Text>
      </View>
    );
  }
  const meta = RESPONSE_META[status];
  return (
    <View className={`${height} rounded-full flex-row items-center gap-1 shrink-0`} style={{ backgroundColor: meta.bg }}>
      <MaterialIcons name={meta.icon} size={13} color={meta.fg} />
      <Text className="text-[12px] font-bold" style={{ color: meta.fg }}>{responseLabel(status, voice)}</Text>
    </View>
  );
}

/** A status dot for calendar pills, where a word doesn't fit. Hollow = still to answer. */
export function RsvpDot({ status, open, ring = 'var(--c-brand-fg)' }: {
  status: ResponseStatus | null | undefined;
  open: boolean;
  /** The hollow ring's colour: on a solid (match) pill the brand ring would vanish. */
  ring?: string;
}) {
  if (!status && !open) return null;
  const style = status
    ? { backgroundColor: RESPONSE_META[status].solid, boxShadow: '0 0 0 1px var(--c-surface)' }
    : { backgroundColor: 'transparent', boxShadow: `inset 0 0 0 1.5px ${ring}` };
  return <View className="w-1.5 h-1.5 rounded-full shrink-0" style={style as any} />;
}

/** The answer dot for one schedule pill, players and parents only. */
export function EventRsvpDot({ event, ring }: { event: CalendarEvent; ring?: string }) {
  const rsvp = useRsvpState(event);
  if (!rsvp.show) return null;
  return <RsvpDot status={rsvp.status} open={rsvp.open} ring={ring} />;
}
