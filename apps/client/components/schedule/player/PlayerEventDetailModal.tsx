import { parseApiDate } from '@/utils/dates';
import { useEffect, useState, type ReactNode } from 'react';
import { View, Text, Modal, Pressable, ActivityIndicator } from '@/src/web/reactNative';
import ModalBackdrop from '../../ui/ModalBackdrop';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { CalendarEvent, eventsApi } from '../../../services/eventsApi';
import { useSession } from '../../../context/AuthContext';
import { normalizeRole } from '../../../utils/authSession';
import { internalMatchResult, matchSheetPath, showMatchSheetLink } from '../../../utils/matchResult';
import { useRouter } from '@/src/web/expoRouter';
import {
  EVENT_TYPE_META,
  buildICSCalendar,
  formatTimeRange,
  isCancelledEvent,
  RO_LOCALE,
  triggerFileDownload,
} from '../scheduleShared';

/**
 * Read-only event sheet for the player/coach surfaces (Home + Schedule).
 * No management actions — those stay admin-only.
 *
 * Additions for players:
 *   • matches read as a scoreboard; FRB-synced rows no longer show their raw
 *     "score: 78-64 · sincronizat din FRB" description;
 *   • a past session shows the player's OWN attendance and the coach's note
 *     on them (GET /players/me/attendance — only their row);
 *   • "Adaugă în calendar" exports the event as .ics;
 *   • a match kept with the club's scorer shows its final score and links to
 *     "Fișa meciului" (every role, in its own shell — utils/matchResult.ts).
 */

const SCORE_RE = /score:\s*(\d{1,3})\s*[-:]\s*(\d{1,3})/i;

function cleanDescription(description: string | null | undefined) {
  if (!description) return '';
  return description
    .replace(SCORE_RE, '')
    .replace(/(?:·\s*)?sincronizat din FRB\.?/gi, '')
    .replace(/Synced from FRB\.?\s*(Score:\s*\d+\s*-\s*\d+)?/gi, '')
    .replace(/^[\s·.-]+|[\s·.-]+$/g, '')
    .trim();
}

function getScore(event: CalendarEvent) {
  const source = `${event.description ?? ''}`;
  const match = source.match(SCORE_RE) ?? source.match(/Score:\s*(\d{1,3})\s*-\s*(\d{1,3})/i);
  return match ? { home: match[1], away: match[2] } : null;
}

const STATUS_META: Record<string, { label: string; fg: string; bg: string; icon: string }> = {
  present: { label: 'Prezent', fg: 'var(--c-success-fg)', bg: 'var(--c-success-bg)', icon: 'check-circle' },
  prezent: { label: 'Prezent', fg: 'var(--c-success-fg)', bg: 'var(--c-success-bg)', icon: 'check-circle' },
  late: { label: 'Întârziat', fg: 'var(--c-warning-fg)', bg: 'var(--c-warning-bg)', icon: 'schedule' },
  absent: { label: 'Absent', fg: 'var(--c-danger-fg)', bg: 'var(--c-danger-bg)', icon: 'cancel' },
  medical: { label: 'Motivat', fg: 'var(--c-warning-fg)', bg: 'var(--c-warning-bg)', icon: 'medical-services' },
  excused: { label: 'Motivat', fg: 'var(--c-warning-fg)', bg: 'var(--c-warning-bg)', icon: 'medical-services' },
};

function DetailRow({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <View className="flex-row items-start gap-3">
      <View className="w-8 h-8 rounded-[9px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-2)' }}>
        <MaterialIcons name={icon} size={16} color="var(--c-muted)" />
      </View>
      <View className="flex-1 min-w-0 justify-center" style={{ minHeight: 32 }}>{children}</View>
    </View>
  );
}

export function PlayerEventDetailModal({
  event,
  isMobile,
  onClose,
  onEdit,
}: {
  event: CalendarEvent | null;
  isMobile: boolean;
  onClose: () => void;
  /** Shown to a coach on a session they manage: opens the edit form. */
  onEdit?: (event: CalendarEvent) => void;
}) {
  const { session } = useSession();
  const router = useRouter();
  const role = normalizeRole(session?.role);
  const isPlayer = role === 'player' || role === 'parent';

  const [myStatus, setMyStatus] = useState<{ status: string | null; note: string | null } | null>(null);
  const [loadingMine, setLoadingMine] = useState(false);

  const isPast = event ? parseApiDate(event.startTime).getTime() < Date.now() : false;
  const cancelled = event ? isCancelledEvent(event) : false;

  useEffect(() => {
    setMyStatus(null);
    if (!event || !isPlayer || !isPast || cancelled || event.id <= 0) return undefined;
    let active = true;
    setLoadingMine(true);
    eventsApi.getMyAttendance([event.id])
      .then((rows) => {
        if (!active) return;
        const row = rows.find((item) => item.eventId === event.id);
        setMyStatus({ status: row?.status ?? null, note: row?.note ?? null });
      })
      .catch(() => { if (active) setMyStatus(null); })
      .finally(() => { if (active) setLoadingMine(false); });
    return () => { active = false; };
  }, [event, isPlayer, isPast, cancelled]);

  const meta = event ? EVENT_TYPE_META[event.type] ?? EVENT_TYPE_META.admin : null;
  const own = event ? internalMatchResult(event) : null;
  const score = own
    ? { home: String(own.us), away: String(own.them) }
    : event && event.type === 'match' ? getScore(event) : null;
  const teams = own ? [own.ourName, own.theirName] : event && event.type === 'match' ? event.title.split(/\s+vs\s+/i) : [];
  const sheetLink = event ? showMatchSheetLink(event, role) : false;
  const openSheet = () => {
    if (!event) return;
    onClose();
    router.push(matchSheetPath(role, event.id) as any);
  };
  const description = cleanDescription(event?.description);
  const status = myStatus?.status ? STATUS_META[myStatus.status.toLowerCase()] : null;

  const addToCalendar = () => {
    if (!event) return;
    const safe = event.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'eveniment';
    triggerFileDownload(`${safe}.ics`, buildICSCalendar([event], 'BCMS'), 'text/calendar;charset=utf-8');
  };

  return (
    <Modal visible={event !== null} transparent animationType={isMobile ? 'slide' : 'fade'} onRequestClose={onClose}>
      <ModalBackdrop
        className={`flex-1 ${isMobile ? 'justify-end' : 'items-center justify-center p-5'}`}
        style={{ backgroundColor: 'rgba(10,15,28,0.55)' }}
        onDismiss={onClose}
      >
        <View
          className={`w-full overflow-hidden border flex-col ${isMobile ? 'rounded-t-[20px]' : 'rounded-[18px]'}`}
          style={{
            backgroundColor: 'var(--c-surface)',
            borderColor: 'var(--c-border)',
            maxWidth: isMobile ? undefined : 480,
            maxHeight: isMobile ? '88vh' : '80vh',
            boxShadow: 'var(--e-lg)',
          } as any}
        >
          {event && meta ? (
            <>
              <View className="px-5 pt-3 pb-4 border-b" style={{ borderColor: 'var(--c-border-soft)' } as any}>
                {isMobile ? <View className="self-center w-10 h-1 rounded-full mb-3" style={{ backgroundColor: 'var(--c-border-strong)' }} /> : null}
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1 min-w-0">
                    <View className="flex-row items-center gap-2 flex-wrap">
                      <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: meta.soft }}>
                        <Text className="text-[11.5px] font-bold" style={{ color: meta.onSoft }}>{meta.label}</Text>
                      </View>
                      {cancelled ? (
                        <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: 'var(--c-danger-bg)' }}>
                          <Text className="text-[11.5px] font-bold" style={{ color: 'var(--c-danger-fg)' }}>Anulat</Text>
                        </View>
                      ) : null}
                    </View>
                    {!score ? (
                      <Text className="text-[19px] font-bold mt-2.5 leading-tight" style={{ color: 'var(--c-ink-strong)' }}>{event.title}</Text>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel="Închide"
                    className="ui-press w-9 h-9 rounded-full items-center justify-center"
                    style={{ backgroundColor: 'var(--c-surface-2)' }}
                  >
                    <MaterialIcons name="close" size={18} color="var(--c-ink-soft)" />
                  </Pressable>
                </View>

                {score && teams.length === 2 ? (
                  // Scoreboard: the two sides with the result between them.
                  <View className="flex-row items-center gap-3 mt-4">
                    <Text className="flex-1 text-[14.5px] font-bold text-right leading-tight" style={{ color: 'var(--c-ink)' }} numberOfLines={2}>{teams[0]}</Text>
                    <View className="rounded-[12px] px-3.5 py-2 items-center" style={{ backgroundColor: 'var(--c-surface-2)' }}>
                      <Text className="t-num text-[24px] font-bold leading-none" style={{ color: 'var(--c-ink-strong)' }}>
                        {score.home}<Text style={{ color: 'var(--c-faint)' }}> : </Text>{score.away}
                      </Text>
                      <Text className="text-[10.5px] font-semibold mt-1 uppercase tracking-[0.06em]" style={{ color: 'var(--c-faint)' }}>Final</Text>
                    </View>
                    <Text className="flex-1 text-[14.5px] font-bold leading-tight" style={{ color: 'var(--c-ink)' }} numberOfLines={2}>{teams[1]}</Text>
                  </View>
                ) : null}
              </View>

              <View className="px-5 py-4 gap-3.5">
                <DetailRow icon="schedule">
                  <Text className="text-[14px] font-semibold capitalize" style={{ color: 'var(--c-ink)' }}>
                    {parseApiDate(event.startTime).toLocaleDateString(RO_LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })}
                  </Text>
                  <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>{formatTimeRange(event.startTime, event.endTime)}</Text>
                </DetailRow>

                {event.location ? (
                  <DetailRow icon="place">
                    <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }}>{event.location}</Text>
                  </DetailRow>
                ) : null}

                {event.teamName ? (
                  <DetailRow icon="groups">
                    <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }}>{event.teamName}</Text>
                  </DetailRow>
                ) : null}

                {description ? (
                  <DetailRow icon="info-outline">
                    <Text className="text-[13.5px] font-medium leading-5" style={{ color: 'var(--c-ink-soft)' }}>{description}</Text>
                  </DetailRow>
                ) : null}

                {event.coachNote ? (
                  <View className="flex-row items-start gap-3 rounded-[14px] px-4 py-3" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                    <MaterialIcons name="chat-bubble-outline" size={16} color="var(--c-brand-fg)" style={{ marginTop: 2 }} />
                    <View className="flex-1">
                      <Text className="t-eyebrow" style={{ color: 'var(--c-brand-fg)' }}>Notă antrenor</Text>
                      <Text className="text-[13.5px] font-medium mt-1 leading-5" style={{ color: 'var(--c-ink-soft)' }}>{event.coachNote}</Text>
                    </View>
                  </View>
                ) : null}

                {isPlayer && isPast && !cancelled ? (
                  <View className="rounded-[14px] border px-4 py-3 gap-2" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}>
                    <View className="flex-row items-center justify-between gap-3">
                      <Text className="t-eyebrow" style={{ color: 'var(--c-faint)' }}>Prezența ta</Text>
                      {loadingMine ? (
                        <ActivityIndicator size="small" color="var(--c-brand-fg)" />
                      ) : status ? (
                        <View className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1" style={{ backgroundColor: status.bg }}>
                          <MaterialIcons name={status.icon} size={13} color={status.fg} />
                          <Text className="text-[12px] font-bold" style={{ color: status.fg }}>{status.label}</Text>
                        </View>
                      ) : (
                        <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-muted)' }}>Nemarcată</Text>
                      )}
                    </View>
                    {myStatus?.note ? (
                      <Text className="text-[13.5px] font-medium leading-5" style={{ color: 'var(--c-ink-soft)' }}>
                        „{myStatus.note}”
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>

              {onEdit || sheetLink || (!isPast && !cancelled) ? (
                <View
                  className="px-5 pt-1 border-t flex-row flex-wrap gap-2.5"
                  style={{ borderColor: 'var(--c-border-soft)', paddingBottom: isMobile ? 'max(14px, env(safe-area-inset-bottom))' : 16, paddingTop: 12 } as any}
                >
                  {onEdit ? (
                    <Pressable
                      onPress={() => onEdit(event)}
                      accessibilityRole="button"
                      accessibilityLabel="Editează evenimentul"
                      className="ui-press flex-1 min-w-[136px] h-11 rounded-[11px] flex-row items-center justify-center gap-2 border"
                      style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}
                    >
                      <MaterialIcons name="edit" size={17} color="var(--c-brand-fg)" />
                      <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-ink)' }}>Editează</Text>
                    </Pressable>
                  ) : null}
                  {sheetLink ? (
                    <Pressable
                      onPress={openSheet}
                      accessibilityRole="button"
                      accessibilityLabel={`Fișa meciului: ${event.title}`}
                      className="ui-press flex-1 min-w-[136px] h-11 rounded-[11px] flex-row items-center justify-center gap-2 border"
                      style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}
                    >
                      <MaterialIcons name="leaderboard" size={17} color="var(--c-brand-fg)" />
                      <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-ink)' }}>
                        {event.game?.status === 'live' ? 'Fișa meciului · live' : 'Fișa meciului'}
                      </Text>
                    </Pressable>
                  ) : null}
                  {!isPast && !cancelled ? (
                  <Pressable
                    onPress={addToCalendar}
                    accessibilityRole="button"
                    accessibilityLabel="Adaugă în calendar"
                    className="ui-press flex-1 min-w-[136px] h-11 rounded-[11px] flex-row items-center justify-center gap-2 border"
                    style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}
                  >
                    <MaterialIcons name="event" size={17} color="var(--c-brand-fg)" />
                    <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-ink)' }}>Adaugă în calendar</Text>
                  </Pressable>
                  ) : null}
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      </ModalBackdrop>
    </Modal>
  );
}
