import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import { eventsApi, CalendarEvent } from '../../../services/eventsApi';
import { teamsApi, Team } from '../../../services/teamsApi';
import { useHeader, DEFAULT_SEARCH_PLACEHOLDER } from '../../../components/HeaderContext';
import PageHero from '../../../components/admin/PageHero';
import PageContainer from '../../../components/ui/PageContainer';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ErrorState } from '../../../components/ui/ScreenState';
import { L12MatchLink } from '../../../components/l12/L12MatchLink';
import { EVENT_TYPE_META, buildICSCalendar, triggerFileDownload } from '../../../components/schedule/scheduleShared';

/**
 * Admin event detail.
 *
 * Rebuilt: the previous page was English-only, drew a fake "map" out of
 * absolutely positioned 1px lines whose container wasn't positioned — so the
 * grid spread across the whole page as a faint background — gave its back
 * button a shadow in the ink colour (a white halo in dark mode), and its back
 * button did nothing when the page was opened directly (no in-app history).
 * Now: token surfaces, Romanian copy, a real "open in Maps" link, a
 * scoreboard for finished matches, and back-with-fallback to the schedule.
 */

const SCHEDULE_PATH = '/admin/schedule';
const SCORE_RE = /score:\s*(\d{1,3})\s*[-:]\s*(\d{1,3})/i;

const TYPE_ICON: Record<string, string> = {
  training: 'fitness-center',
  match: 'sports-basketball',
  camp: 'terrain',
  medical: 'medical-services',
  admin: 'badge',
};

function formatDuration(startIso: string, endIso: string) {
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  if (!Number.isFinite(mins) || mins <= 0) return '';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function cleanDescription(description: string | null | undefined) {
  if (!description) return '';
  return description
    .replace(SCORE_RE, '')
    .replace(/(?:·\s*)?sincronizat din FRB\.?/gi, '')
    .replace(/Synced from FRB\.?\s*(Score:\s*\d+\s*-\s*\d+)?/gi, '')
    .replace(/^[\s·.-]+|[\s·.-]+$/g, '')
    .trim();
}

function Card({ title, children, trailing }: { title: string; children: ReactNode; trailing?: ReactNode }) {
  return (
    <View
      className="ui-rise rounded-[16px] border p-4 md:p-5"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
    >
      <View className="flex-row items-center justify-between gap-3 mb-3.5">
        <Text className="t-eyebrow" style={{ color: 'var(--c-faint)' }}>{title}</Text>
        {trailing}
      </View>
      {children}
    </View>
  );
}

function InfoRow({ icon, label, value, sub }: { icon: string; label: string; value: string; sub?: string }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="w-10 h-10 rounded-[11px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-2)' }}>
        <MaterialIcons name={icon} size={18} color="var(--c-brand-fg)" />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-[12px] font-medium" style={{ color: 'var(--c-faint)' }}>{label}</Text>
        <Text className="text-[15px] font-semibold mt-0.5" style={{ color: 'var(--c-ink)' }}>{value}</Text>
        {sub ? <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function ActionButton({
  icon, label, onPress, tone = 'neutral', disabled, loading,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  tone?: 'neutral' | 'danger' | 'brand';
  disabled?: boolean;
  loading?: boolean;
}) {
  const colors = tone === 'danger'
    ? { bg: 'var(--c-danger-bg)', border: 'var(--c-danger-border)', fg: 'var(--c-danger-fg)' }
    : tone === 'brand'
      ? { bg: 'var(--c-brand-surface)', border: 'var(--c-brand-surface)', fg: 'var(--c-on-brand)' }
      : { bg: 'var(--c-surface)', border: 'var(--c-border)', fg: 'var(--c-ink)' };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="ui-press h-11 rounded-[11px] border px-4 flex-row items-center justify-center gap-2"
      style={{ backgroundColor: colors.bg, borderColor: colors.border, opacity: disabled ? 0.55 : 1 } as any}
    >
      {loading ? <ActivityIndicator size="small" color={colors.fg} /> : <MaterialIcons name={icon} size={17} color={colors.fg} />}
      <Text className="text-[13.5px] font-semibold" style={{ color: colors.fg }}>{label}</Text>
    </Pressable>
  );
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [playerCount, setPlayerCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const { setSearchPlaceholder, setHeaderActions, setMobileFab } = useHeader();

  useEffect(() => {
    setSearchPlaceholder('Caută…');
    setHeaderActions(null);
    setMobileFab(null);
    return () => {
      setSearchPlaceholder(DEFAULT_SEARCH_PLACEHOLDER);
      setHeaderActions(null);
      setMobileFab(null);
    };
  }, [setHeaderActions, setMobileFab, setSearchPlaceholder]);

  const loadData = useCallback(async () => {
    const eventId = Number(id);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      setError('Evenimentul nu există.');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const eventData = await eventsApi.getEventById(eventId);
      setEvent(eventData);
      setNoteDraft(eventData.coachNote ?? '');

      if (eventData.teamId) {
        // Team + squad size in parallel; neither blocks the page.
        const [teams, players] = await Promise.all([
          teamsApi.getTeams().catch(() => [] as Team[]),
          teamsApi.getTeamPlayers(eventData.teamId).catch(() => null),
        ]);
        setTeam(teams.find((row) => row.id === eventData.teamId) ?? null);
        setPlayerCount(players ? players.length : null);
      }
    } catch (err) {
      console.error('Event detail load error:', err);
      setError(err instanceof Error ? err.message : 'Evenimentul nu a putut fi încărcat.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const goBack = () => router.back(SCHEDULE_PATH);

  const deleteEvent = async () => {
    if (!event || deleting) return;
    try {
      setDeleting(true);
      await eventsApi.deleteEvent(event.id);
      setConfirmDelete(false);
      router.replace(SCHEDULE_PATH as any);
    } catch (err) {
      console.error('Delete event error:', err);
      setConfirmDelete(false);
      setError(err instanceof Error ? err.message : 'Evenimentul nu a putut fi șters.');
    } finally {
      setDeleting(false);
    }
  };

  const saveNote = async () => {
    if (!event || savingNote) return;
    try {
      setSavingNote(true);
      setNoteError(null);
      const updated = await eventsApi.updateEvent(event.id, { coachNote: noteDraft.trim() || null });
      setEvent(updated);
      setNoteDraft(updated.coachNote ?? '');
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : 'Nota nu a putut fi salvată.');
    } finally {
      setSavingNote(false);
    }
  };

  const backButton = (
    <Pressable
      onPress={goBack}
      accessibilityRole="button"
      accessibilityLabel="Înapoi la program"
      className="ui-press self-start h-9 pl-2 pr-3 rounded-[10px] border flex-row items-center gap-1.5 mb-4"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
    >
      <MaterialIcons name="chevron-left" size={18} color="var(--c-ink-soft)" />
      <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>Program</Text>
    </Pressable>
  );

  if (loading) {
    return (
      <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-16">
        <PageContainer>
          <View className="max-w-[920px] w-full self-center gap-4" accessibilityRole="progressbar" accessibilityLabel="Se încarcă evenimentul">
            <Skeleton className="h-9 w-28 rounded-[10px]" />
            <Skeleton className="h-8 w-3/4 rounded-[10px]" />
            <Skeleton className="h-[180px] w-full rounded-[16px]" />
            <Skeleton className="h-[140px] w-full rounded-[16px]" />
          </View>
        </PageContainer>
      </ScrollView>
    );
  }

  if (!event) {
    return (
      <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-16">
        <PageContainer>
          <View className="max-w-[920px] w-full self-center">
            {backButton}
            <ErrorState
              title="Evenimentul nu a putut fi afișat"
              message={error ?? 'Evenimentul nu există sau a fost șters.'}
              actionLabel="Reîncearcă"
              onAction={loadData}
            />
          </View>
        </PageContainer>
      </ScrollView>
    );
  }

  const meta = EVENT_TYPE_META[event.type as keyof typeof EVENT_TYPE_META] ?? EVENT_TYPE_META.admin;
  const start = new Date(event.startTime);
  const now = Date.now();
  const isUpcoming = start.getTime() > now;
  const cancelled = String(event.status ?? '').toLowerCase() === 'cancelled';
  const scoreMatch = (event.description ?? '').match(SCORE_RE);
  const sides = event.type === 'match' ? event.title.split(/\s+vs\s+/i) : [];
  const description = cleanDescription(event.description);
  const fromFrb = /FRB/i.test(event.description ?? '');
  const dateLabel = start.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeLabel = `${start.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })} – ${new Date(event.endTime).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}`;
  const duration = formatDuration(event.startTime, event.endTime);
  const noteDirty = noteDraft.trim() !== (event.coachNote ?? '').trim();

  const statusChip = cancelled
    ? { label: 'Anulat', fg: 'var(--c-danger-fg)', bg: 'var(--c-danger-bg)', icon: 'cancel' }
    : isUpcoming
      ? { label: 'Programat', fg: 'var(--c-brand-fg)', bg: 'var(--c-surface-tint)', icon: 'schedule' }
      : { label: 'Încheiat', fg: 'var(--c-muted)', bg: 'var(--c-surface-3)', icon: 'check-circle' };

  const openMaps = () => {
    if (!event.location) return;
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`, '_blank', 'noopener');
  };

  const exportIcs = () => {
    const safe = event.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'eveniment';
    triggerFileDownload(`${safe}.ics`, buildICSCalendar([event], 'BCMS'), 'text/calendar;charset=utf-8');
  };

  return (
    <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-16">
      <PageContainer>
        <View className="max-w-[920px] w-full self-center">
          {backButton}

          <PageHero
            eyebrow="Eveniment"
            title={scoreMatch && sides.length === 2 ? `${sides[0]} – ${sides[1]}` : event.title}
            subtitle={description || undefined}
            className="mb-4"
            leading={(
              <View className="w-12 h-12 md:w-14 md:h-14 rounded-[14px] items-center justify-center shrink-0" style={{ backgroundColor: meta.soft }}>
                <MaterialIcons name={TYPE_ICON[event.type] ?? 'event'} size={24} color={meta.onSoft} />
              </View>
            )}
          >
            <View className="flex-row flex-wrap items-center gap-2">
              <View className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1" style={{ backgroundColor: meta.soft }}>
                <Text className="text-[12px] font-bold" style={{ color: meta.onSoft }}>{meta.label}</Text>
              </View>
              <View className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1" style={{ backgroundColor: statusChip.bg }}>
                <MaterialIcons name={statusChip.icon} size={13} color={statusChip.fg} />
                <Text className="text-[12px] font-bold" style={{ color: statusChip.fg }}>{statusChip.label}</Text>
              </View>
              {fromFrb ? (
                <View className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1" style={{ backgroundColor: 'var(--c-surface-3)' }}>
                  <MaterialIcons name="refresh" size={13} color="var(--c-muted)" />
                  <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-muted)' }}>Sincronizat FRB</Text>
                </View>
              ) : null}
            </View>

            {scoreMatch && sides.length === 2 ? (
              <View className="glass rounded-[14px] px-4 py-3 flex-row items-center gap-3" style={{ boxShadow: 'var(--e-sm)' } as any}>
                <Text className="f-display flex-1 text-[14px] md:text-[16px] font-bold text-right leading-tight" style={{ color: 'var(--c-ink-strong)' }}>{sides[0]}</Text>
                <View className="items-center">
                  <Text className="f-display t-num text-[28px] font-extrabold leading-none" style={{ color: 'var(--c-ink-strong)' }}>
                    {scoreMatch[1]}<Text style={{ color: 'var(--c-faint)' }}> : </Text>{scoreMatch[2]}
                  </Text>
                  <Text className="text-[10.5px] font-semibold mt-1 uppercase tracking-[0.06em]" style={{ color: 'var(--c-faint)' }}>Final</Text>
                </View>
                <Text className="f-display flex-1 text-[14px] md:text-[16px] font-bold leading-tight" style={{ color: 'var(--c-ink-strong)' }}>{sides[1]}</Text>
              </View>
            ) : null}
          </PageHero>

          {error ? (
            <View className="mb-4 rounded-[12px] border px-4 py-3 flex-row items-center gap-2.5" style={{ backgroundColor: 'var(--c-danger-bg)', borderColor: 'var(--c-danger-border)' } as any}>
              <MaterialIcons name="error-outline" size={17} color="var(--c-danger-fg)" />
              <Text className="text-[13px] font-semibold flex-1" style={{ color: 'var(--c-danger-fg)' }}>{error}</Text>
            </View>
          ) : null}

          <View className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <View className="gap-4 min-w-0">
              <Card title="Când">
                <View className="gap-3.5">
                  <InfoRow icon="calendar-today" label="Data" value={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)} />
                  <InfoRow icon="schedule" label="Ora" value={timeLabel} sub={duration ? `Durată: ${duration}` : undefined} />
                </View>
              </Card>

              <Card
                title="Unde"
                trailing={event.location ? (
                  <Pressable onPress={openMaps} accessibilityRole="link" accessibilityLabel="Deschide în Hărți" className="ui-press flex-row items-center gap-1">
                    <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Deschide în Hărți</Text>
                    <MaterialIcons name="chevron-right" size={16} color="var(--c-brand-fg)" />
                  </Pressable>
                ) : null}
              >
                <InfoRow icon="place" label="Locație" value={event.location || 'Nespecificată'} />
              </Card>

              <Card title="Notă pentru jucători">
                <Text className="t-meta mb-2.5" style={{ color: 'var(--c-muted)' }}>
                  Vizibilă tuturor jucătorilor de pe acest eveniment — feedback, puncte de focus sau un shoutout.
                </Text>
                <TextInput
                  value={noteDraft}
                  onChangeText={setNoteDraft}
                  placeholder="ex. Ritm foarte bun azi, continuăm cu pick-and-roll."
                  placeholderTextColor="var(--c-faint)"
                  multiline
                  maxLength={2000}
                  className="rounded-[11px] border px-3 py-2.5 text-[14px] font-medium min-h-[88px] resize-none leading-5"
                  style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)', color: 'var(--c-ink)' } as any}
                />
                {noteError ? <Text className="text-[12px] font-semibold mt-1.5" style={{ color: 'var(--c-danger-fg)' }}>{noteError}</Text> : null}
                <View className="flex-row justify-end mt-2.5">
                  <ActionButton
                    icon={noteDirty ? 'save' : 'check'}
                    label={noteDirty ? 'Salvează nota' : 'Salvat'}
                    onPress={saveNote}
                    tone={noteDirty ? 'brand' : 'neutral'}
                    disabled={!noteDirty}
                    loading={savingNote}
                  />
                </View>
              </Card>
            </View>

            <View className="gap-4 min-w-0">
              {event.type === 'match' && event.teamId && !cancelled ? (
                <L12MatchLink eventId={event.id} onOpen={(path) => router.push(path as any)} />
              ) : null}
              {event.type === 'match' && event.teamId && !cancelled ? (
                <Pressable
                  onPress={() => router.push(`/admin/stats/${event.id}` as any)}
                  accessibilityRole="button"
                  className="ui-lift ui-press rounded-[16px] border p-4 flex-row items-center gap-3 text-left"
                  style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
                >
                  <View className="w-10 h-10 rounded-[11px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-success-bg)' }}>
                    <MaterialIcons name="leaderboard" size={19} color="var(--c-success-fg)" />
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-[15px] font-semibold" style={{ color: 'var(--c-ink)' }}>Statistică live</Text>
                    <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>Scor, puncte și faulturi pe jucător · fișa meciului</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color="var(--c-faint)" />
                </Pressable>
              ) : null}

              <Card title="Echipă">
                {event.teamId ? (
                  <View className="gap-3.5">
                    <InfoRow
                      icon="shield"
                      label={team?.leagueName || 'Echipă'}
                      value={team?.name ?? event.teamName ?? 'Echipă'}
                      sub={playerCount != null ? `${playerCount} ${playerCount === 1 ? 'jucător' : 'jucători'} în lot` : undefined}
                    />
                    {event.coachName && event.coachName !== 'FRB' ? (
                      <InfoRow icon="person" label="Antrenor" value={event.coachName} />
                    ) : null}
                  </View>
                ) : (
                  <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>Eveniment la nivel de club, fără o echipă anume.</Text>
                )}
              </Card>

              <Card title="Acțiuni">
                <View className="gap-2.5">
                  {event.teamId && !cancelled ? (
                    <ActionButton
                      icon="fact-check"
                      label={isUpcoming ? 'Lista de prezență' : 'Marchează prezența'}
                      tone="brand"
                      onPress={() => router.push(`/admin/attendance/${event.id}` as any)}
                    />
                  ) : null}
                  {isUpcoming && !cancelled ? (
                    <ActionButton icon="event" label="Adaugă în calendar (.ics)" onPress={exportIcs} />
                  ) : null}
                  <ActionButton icon="delete" label="Șterge evenimentul" tone="danger" onPress={() => setConfirmDelete(true)} />
                </View>
              </Card>
            </View>
          </View>
        </View>
      </PageContainer>

      <ConfirmDialog
        visible={confirmDelete}
        destructive
        icon="delete"
        title="Ștergi evenimentul?"
        message={`„${event.title}” și lista lui de prezență vor fi șterse definitiv.`}
        confirmLabel="Șterge"
        cancelLabel="Anulează"
        loading={deleting}
        onConfirm={deleteEvent}
        onCancel={() => setConfirmDelete(false)}
      />
    </ScrollView>
  );
}
