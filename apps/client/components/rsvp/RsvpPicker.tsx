import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import type { CalendarEvent } from '../../services/eventsApi';
import type { ResponseStatus } from '../../services/eventResponsesApi';
import { saveMyResponse, useMyResponses } from '../../hooks/useMyResponses';
import { REASON_MAX_LENGTH, RESPONSE_META, RESPONSE_ORDER, responseLabel, responseQuestion, responsesOpen } from '../../utils/rsvp';
import { appLocale, tr } from '../../i18n';
import { parseApiDate } from '../../utils/dates';
import { announce } from '../ui/LiveRegion';
import Button from '../ui/Button';

function formatDeadline(startTime: string) {
  const date = parseApiDate(startTime);
  const day = date.toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'short' });
  const time = date.toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' });
  return tr('{0}, la {1}', { '0': day, '1': time });
}

function formatAnsweredAt(value: string | null) {
  if (!value) return '';
  const date = parseApiDate(value);
  return date.toLocaleString(appLocale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * „Participi?” in the event sheet (player, or parent for the selected child):
 * three large answers that save on tap, an optional reason with „Nu vin”, and
 * the deadline in words. After the start the answer is read-only.
 *
 * Keyboard: one Tab stop (the current answer), arrows move, Space/Enter picks —
 * the same radiogroup pattern as AttendanceMarkButtons.
 */
export default function RsvpPicker({ event, childFirstName, selfName }: {
  event: CalendarEvent;
  /** A parent's selected child: „Participă Matei?”, „Vine / Nu vine”. */
  childFirstName?: string | null;
  /** The signed-in account's name, to tell whether someone else answered. */
  selfName?: string | null;
}) {
  const answers = useMyResponses();
  const answer = answers.get(event.id);
  const open = responsesOpen(event.startTime);
  const voice = childFirstName ? 'third' as const : 'self' as const;

  const [saving, setSaving] = useState<ResponseStatus | 'reason' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState(answer?.reason ?? '');
  const [savedFlash, setSavedFlash] = useState(false);
  const groupRef = useRef<HTMLElement | null>(null);

  // A new event in the same sheet, or the stored reason changed elsewhere.
  useEffect(() => { setReasonDraft(answer?.reason ?? ''); setError(null); }, [event.id, answer?.reason]);
  useEffect(() => {
    if (!savedFlash) return undefined;
    const timer = setTimeout(() => setSavedFlash(false), 2500);
    return () => clearTimeout(timer);
  }, [savedFlash]);

  const save = async (status: ResponseStatus, reason: string | null, kind: ResponseStatus | 'reason') => {
    setSaving(kind);
    setError(null);
    try {
      await saveMyResponse(event.id, status, status === 'not_going' ? (reason?.trim() || null) : null);
      setSavedFlash(true);
      announce(tr('Răspuns salvat: {0}', { '0': responseLabel(status, voice) }));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : tr('Nu s-a trimis. Reîncearcă.'));
    } finally {
      setSaving(null);
    }
  };

  const onKeyDown = (keyEvent: { key: string; preventDefault: () => void }) => {
    const radios = Array.from(groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []);
    const at = radios.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    const last = radios.length - 1;
    const next = keyEvent.key === 'ArrowRight' || keyEvent.key === 'ArrowDown' ? (at === last ? 0 : at + 1)
      : keyEvent.key === 'ArrowLeft' || keyEvent.key === 'ArrowUp' ? (at === 0 ? last : at - 1)
        : keyEvent.key === 'Home' ? 0 : keyEvent.key === 'End' ? last : null;
    if (next === null) return;
    keyEvent.preventDefault();
    radios[next]?.focus();
  };

  const question = responseQuestion(childFirstName);
  const answeredByOther = answer?.respondedByName && selfName && answer.respondedByName.trim() !== selfName.trim();
  const reasonDirty = answer?.status === 'not_going' && (reasonDraft.trim() || '') !== (answer.reason ?? '');
  const tabStop = Math.max(0, RESPONSE_ORDER.findIndex((status) => status === answer?.status));

  if (!open) {
    return (
      <View className="rounded-[14px] border px-4 py-3 gap-2" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}>
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-[14.5px] font-bold" style={{ color: 'var(--c-ink)' }}>{question}</Text>
          <View className="flex-row items-center gap-1">
            <MaterialIcons name="lock-outline" size={13} color="var(--c-muted)" />
            <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-muted)' }}>{tr('Închis')}</Text>
          </View>
        </View>
        <Text className="text-[13px] font-medium" style={{ color: 'var(--c-ink-soft)' }}>
          {answer ? tr('Răspuns: {0}', { '0': responseLabel(answer.status, voice) }) : tr('Fără răspuns')}
          {answer?.reason ? ` · „${answer.reason}”` : ''}
        </Text>
        <Text className="text-[12px] font-medium" style={{ color: 'var(--c-faint)' }}>{tr('Confirmările s-au închis la începutul evenimentului.')}</Text>
      </View>
    );
  }

  return (
    <View className="rounded-[14px] border p-3.5 gap-2.5" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}>
      <View className="flex-row items-center justify-between gap-3">
        <Text accessibilityRole="header" className="text-[15px] font-bold" style={{ color: 'var(--c-ink)' }}>{question}</Text>
        {savedFlash ? (
          <View className="flex-row items-center gap-1">
            <MaterialIcons name="check" size={13} color="var(--c-success-fg)" />
            <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-success-fg)' }}>{tr('Salvat')}</Text>
          </View>
        ) : null}
      </View>

      <View
        ref={groupRef}
        className="flex-row gap-2"
        accessibilityRole={'radiogroup' as any}
        accessibilityLabel={question}
        onKeyDown={onKeyDown}
      >
        {RESPONSE_ORDER.map((status, index) => {
          const selected = answer?.status === status;
          const meta = RESPONSE_META[status];
          const label = responseLabel(status, voice);
          return (
            <Pressable
              key={status}
              onPress={() => { if (!selected && saving == null) void save(status, reasonDraft, status); }}
              accessibilityRole={'radio' as any}
              accessibilityState={{ checked: selected, disabled: saving != null }}
              accessibilityLabel={label}
              {...({ tabIndex: index === tabStop ? 0 : -1 } as any)}
              className="ui-press flex-1 min-w-0 h-12 rounded-[12px] flex-row items-center justify-center gap-1.5"
              style={{
                backgroundColor: selected ? meta.bg : 'var(--c-surface)',
                border: selected ? `1.5px solid ${meta.solid}` : '1px solid var(--c-border)',
              } as any}
            >
              {saving === status ? (
                <ActivityIndicator size="small" color={meta.fg} />
              ) : (
                <MaterialIcons name={meta.icon} size={16} color={selected ? meta.fg : 'var(--c-ink-soft)'} />
              )}
              <Text className="text-[14px] font-bold" style={{ color: selected ? meta.fg : 'var(--c-ink-soft)' }} numberOfLines={1}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {answer?.status === 'not_going' ? (
        <View className="gap-1.5 mt-1">
          <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>{tr('Motiv (opțional)')}</Text>
          <TextInput
            value={reasonDraft}
            onChangeText={(value: string) => setReasonDraft(value.slice(0, REASON_MAX_LENGTH))}
            accessibilityLabel={tr('Motiv (opțional)')}
            placeholder={childFirstName ? tr('ex. Are școală până la 19:00') : tr('ex. Am școală până la 19:00')}
            placeholderTextColor="var(--c-faint)"
            maxLength={REASON_MAX_LENGTH}
            onSubmitEditing={() => { if (reasonDirty) void save('not_going', reasonDraft, 'reason'); }}
            className="h-11 rounded-[11px] border px-3 text-[14px] font-medium"
            style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)', color: 'var(--c-ink)' } as any}
          />
          <View className="flex-row items-center justify-between gap-2 flex-wrap">
            <Text className="text-[12px] font-medium flex-1 min-w-[180px]" style={{ color: 'var(--c-faint)' }}>
              {tr('Îl văd doar antrenorul și administratorul clubului.')}
            </Text>
            {reasonDirty ? (
              <Button size="sm" label={tr('Salvează motivul')} loading={saving === 'reason'} onPress={() => void save('not_going', reasonDraft, 'reason')} />
            ) : null}
          </View>
        </View>
      ) : null}

      {error ? (
        <View className="flex-row items-center gap-1.5" accessibilityRole="alert">
          <MaterialIcons name="error-outline" size={14} color="var(--c-danger-fg)" />
          <Text className="text-[12.5px] font-semibold flex-1" style={{ color: 'var(--c-danger-fg)' }}>{error}</Text>
        </View>
      ) : null}

      {answeredByOther ? (
        <Text className="text-[12px] font-medium" style={{ color: 'var(--c-muted)' }}>
          {tr('Răspuns dat de {0} · {1}', { '0': answer!.respondedByName!, '1': formatAnsweredAt(answer!.updatedAt) })}
        </Text>
      ) : null}
      <View className="flex-row items-center gap-1.5">
        <MaterialIcons name="info-outline" size={14} color="var(--c-faint)" />
        <Text className="text-[12px] font-medium flex-1" style={{ color: 'var(--c-faint)' }}>
          {tr('Poți schimba răspunsul până {0}.', { '0': formatDeadline(event.startTime) })}
        </Text>
      </View>
    </View>
  );
}
