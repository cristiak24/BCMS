import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { eventResponsesApi, type EventResponsesSummary, type StaffResponseRow } from '../../services/eventResponsesApi';
import { RESPONSE_META, goingWord, groupStaffRows, responseLabel } from '../../utils/rsvp';
import { appLocale, tr } from '../../i18n';
import { parseApiDate } from '../../utils/dates';
import { plural } from '../../utils/plural';
import Button from '../ui/Button';
import ConfirmDialog from '../ui/ConfirmDialog';
import { Skeleton } from '../ui/Skeleton';
import { announce } from '../ui/LiveRegion';

function formatWhen(value: string | null, withDay = true) {
  if (!value) return '';
  const date = parseApiDate(value);
  const time = date.toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' });
  if (!withDay) return time;
  const day = date.toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'short' });
  return tr('{0}, la {1}', { '0': day, '1': time });
}

/** The thin four-part bar: Vin, Nu vin, Poate, Fără răspuns (track). */
export function ResponseMeter({ summary }: { summary: EventResponsesSummary }) {
  const { going, notGoing, maybe, none } = summary.counts;
  const total = going + notGoing + maybe + none;
  if (!total) return null;
  return (
    <View className="flex-row h-1.5 rounded-full overflow-hidden gap-[2px]" style={{ backgroundColor: 'var(--c-surface-3)' }} accessibilityElementsHidden>
      {going ? <View style={{ flex: going, backgroundColor: RESPONSE_META.going.solid }} /> : null}
      {notGoing ? <View style={{ flex: notGoing, backgroundColor: RESPONSE_META.not_going.solid }} /> : null}
      {maybe ? <View style={{ flex: maybe, backgroundColor: RESPONSE_META.maybe.solid }} /> : null}
      {none ? <View style={{ flex: none }} /> : null}
    </View>
  );
}

export function ResponseCountsRow({ summary }: { summary: EventResponsesSummary }) {
  const cells = [
    { label: goingWord(), value: summary.counts.going, dot: { backgroundColor: RESPONSE_META.going.solid } },
    { label: tr('Nu vin'), value: summary.counts.notGoing, dot: { backgroundColor: RESPONSE_META.not_going.solid } },
    { label: tr('Poate'), value: summary.counts.maybe, dot: { backgroundColor: RESPONSE_META.maybe.solid } },
    { label: tr('Fără răspuns'), value: summary.counts.none, dot: { boxShadow: 'inset 0 0 0 1.5px var(--c-faint)' } },
  ];
  return (
    <View className="flex-row gap-2">
      {cells.map((cell) => (
        // Labels may wrap at 375 px („Fără răspuns”): the figures stay on one line.
        <View key={cell.label} className="flex-1 min-w-0 justify-between" accessible accessibilityLabel={`${cell.label}: ${cell.value}`}>
          <View className="flex-row items-center gap-1.5">
            <View className="w-2 h-2 rounded-full shrink-0" style={cell.dot as any} />
            <Text className="text-[11.5px] font-semibold" style={{ color: 'var(--c-muted)' }}>{cell.label}</Text>
          </View>
          <Text className="f-display t-num text-[22px] font-bold leading-none mt-1.5" style={{ color: 'var(--c-ink-strong)' }}>{cell.value}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Loads GET /events/:id/responses for the team's coach or the admin. `null`
 * while loading; a refusal (another squad) or an error hides the block.
 */
export function useEventResponses(eventId: number | null | undefined, enabled = true) {
  const [summary, setSummary] = useState<EventResponsesSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    if (!eventId || !enabled) return;
    try {
      const data = await eventResponsesApi.forEvent(eventId);
      setSummary(data);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [eventId, enabled]);
  useEffect(() => {
    setSummary(null);
    setFailed(false);
    void load();
  }, [load]);
  return { summary, failed, reload: load };
}

/** „Amintește-le (N)” with its confirmation. */
export function RemindButton({ summary, onSent, size = 'md', className }: {
  summary: EventResponsesSummary;
  onSent: () => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = summary.counts.none;
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!summary.canRemind || (pending === 0 && !notice)) return null;

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const result = await eventResponsesApi.remind(summary.eventId);
      const message = result.notifications > 0
        ? tr('Amintire trimisă pentru {0}.', { '0': plural(result.players, tr('jucător'), tr('jucători')) })
        : tr('Niciunul dintre ei nu are cont în aplicație.');
      setNotice(message);
      announce(message);
      setConfirming(false);
      onSent();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : tr('Nu s-a trimis. Reîncearcă.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {notice ? (
        <View className={`flex-row items-center gap-1.5 min-h-8 ${className ?? ''}`}>
          <MaterialIcons name="check" size={14} color="var(--c-success-fg)" />
          <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>{notice}</Text>
        </View>
      ) : (
        <Button
          size={size}
          icon="notifications-none"
          label={tr('Amintește-le ({0})', { '0': pending })}
          onPress={() => { setError(null); setConfirming(true); }}
          className={className}
        />
      )}
      <ConfirmDialog
        visible={confirming}
        title={tr('Trimiți o amintire?')}
        message={tr('{0} fără răspuns și părinții lor primesc o notificare în aplicație. Se poate trimite o dată la 12 ore.', { '0': plural(pending, tr('jucător'), tr('jucători')) })}
        confirmLabel={tr('Trimite amintirea')}
        icon="notifications-none"
        loading={sending}
        focusCancel
        footerNote={error ?? undefined}
        onConfirm={() => void send()}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

function relationLabel(row: StaffResponseRow) {
  if (!row.respondedByName || row.respondedByRelation !== 'parent') return null;
  return tr('de {0} (părinte)', { '0': row.respondedByName });
}

const GROUP_TITLE: Record<'not_going' | 'maybe' | 'none' | 'going', string> = {
  not_going: tr('Nu vin'),
  maybe: tr('Poate'),
  none: tr('Fără răspuns'),
  going: goingWord(),
};

/** The roster grouped by what needs attention (admin event page). */
function ResponseList({ summary }: { summary: EventResponsesSummary }) {
  const [showAllGoing, setShowAllGoing] = useState(false);
  const groups = groupStaffRows(summary.players);
  if (!groups.length) return null;
  return (
    <View className="rounded-[12px] border overflow-hidden mt-3.5" style={{ borderColor: 'var(--c-border)' } as any}>
      {groups.map((group) => {
        const rows = group.key === 'going' && !showAllGoing ? group.rows.slice(0, 3) : group.rows;
        return (
          <View key={group.key}>
            <Text
              accessibilityRole="header"
              className="t-label px-3 pt-2.5 pb-1.5 border-t first:border-t-0"
              style={{ color: 'var(--c-muted)', backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border-soft)' } as any}
            >
              {`${GROUP_TITLE[group.key]} · ${group.rows.length}`}
            </Text>
            {rows.map((row) => {
              const by = relationLabel(row);
              const name = `${row.firstName} ${row.lastName}`.trim();
              return (
                <View key={row.playerId} className="flex-row items-center gap-2.5 px-3 py-2.5 border-t min-h-[48px]" style={{ borderColor: 'var(--c-border-soft)' } as any}>
                  <View className="flex-1 min-w-0">
                    <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
                      {name}{row.number != null ? <Text style={{ color: 'var(--c-faint)' }}>{` #${row.number}`}</Text> : null}
                    </Text>
                    {row.reason || by || (row.status === 'not_going' && !row.reason) ? (
                      <Text className="text-[12.5px] font-medium mt-0.5" style={{ color: 'var(--c-muted)', overflowWrap: 'anywhere' } as any}>
                        {[row.reason ? `„${row.reason}”` : row.status === 'not_going' ? tr('fără motiv') : null, by].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                  {row.status ? (
                    <View className="h-6 px-2 rounded-full flex-row items-center gap-1 shrink-0" style={{ backgroundColor: RESPONSE_META[row.status].bg }}>
                      <MaterialIcons name={RESPONSE_META[row.status].icon} size={12} color={RESPONSE_META[row.status].fg} />
                      <Text className="text-[11.5px] font-bold" style={{ color: RESPONSE_META[row.status].fg }}>{responseLabel(row.status, 'third')}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
            {group.key === 'going' && group.rows.length > 3 ? (
              <Pressable
                onPress={() => setShowAllGoing((value) => !value)}
                accessibilityRole="button"
                className="ui-press px-3 py-2.5 border-t text-left"
                style={{ borderColor: 'var(--c-border-soft)' } as any}
              >
                <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>
                  {showAllGoing ? tr('Arată mai puțini') : tr('Arată toți cei {0}', { '0': group.rows.length })}
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * „Răspunsuri” for staff: the bar, four counts and the actions. `variant`
 * `sheet` (the coach's event sheet in Program) links to the list in Prezență;
 * `card` (the admin event page) shows the grouped list itself.
 */
export default function RsvpStaffSummary({ eventId, variant, onOpenList }: {
  eventId: number;
  variant: 'sheet' | 'card';
  onOpenList?: () => void;
}) {
  const { summary, failed, reload } = useEventResponses(eventId);
  if (failed) return null;
  if (!summary) {
    return <Skeleton className={variant === 'card' ? 'h-[150px] w-full rounded-[14px]' : 'h-[132px] w-full rounded-[14px]'} />;
  }
  if (!summary.enabled) return null;
  // A session that started without a single answer has nothing to say.
  const answered = summary.counts.going + summary.counts.notGoing + summary.counts.maybe;
  if (!summary.open && answered === 0) return null;

  const deadline = summary.open
    ? tr('Se închid {0}', { '0': formatWhen(summary.closesAt) })
    : tr('Închise la începutul evenimentului');
  const reminded = summary.lastReminderAt ? tr('ultima amintire: {0}', { '0': formatWhen(summary.lastReminderAt) }) : null;

  const body = (
    <>
      <ResponseMeter summary={summary} />
      <View className="mt-3"><ResponseCountsRow summary={summary} /></View>
    </>
  );

  if (variant === 'card') {
    return (
      <View
        className="rounded-[14px] border p-4"
        style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
      >
        <View className="flex-row items-start justify-between gap-3 mb-1">
          <Text accessibilityRole="header" className="f-display text-[15px] font-bold" style={{ color: 'var(--c-ink)' }}>Răspunsuri</Text>
          <RemindButton summary={summary} onSent={reload} size="sm" />
        </View>
        <Text className="t-meta mb-3" style={{ color: 'var(--c-muted)' }}>{[deadline, reminded].filter(Boolean).join(' · ')}</Text>
        {body}
        <ResponseList summary={summary} />
      </View>
    );
  }

  return (
    <View className="rounded-[14px] border p-3.5" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}>
      <View className="flex-row items-baseline justify-between gap-3 mb-2.5 flex-wrap">
        <Text accessibilityRole="header" className="text-[15px] font-bold" style={{ color: 'var(--c-ink)' }}>{tr('Răspunsuri')}</Text>
        <Text className="text-[12px] font-medium" style={{ color: 'var(--c-muted)' }}>{deadline}</Text>
      </View>
      {body}
      <View className="flex-row gap-2 mt-3.5 flex-wrap">
        {onOpenList ? <Button icon="fact-check" label={tr('Vezi lista')} onPress={onOpenList} className="flex-1 min-w-[160px]" /> : null}
        <RemindButton summary={summary} onSent={reload} className="flex-1 min-w-[160px]" />
      </View>
      {reminded ? <Text className="text-[12px] font-medium mt-2" style={{ color: 'var(--c-faint)' }}>{reminded.charAt(0).toUpperCase() + reminded.slice(1)}</Text> : null}
    </View>
  );
}
