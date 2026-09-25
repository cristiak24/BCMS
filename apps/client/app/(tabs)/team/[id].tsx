import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import GlassCard from '../../../components/ui/GlassCard';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../../components/ui/ScreenState';
import PageContainer from '../../../components/ui/PageContainer';
import PageHeader from '../../../components/ui/PageHeader';
import { teamsApi, MyTeamDetail, MyTeamEvent, MyTeamPastEvent } from '../../../services/teamsApi';
import { GENDER_LABELS, LEVEL_LABELS } from '../../../components/myclub/teamDisplay';
import {
  attendanceRateColor,
  attendanceStatusTone,
  eventTypeMeta,
  formatEventDay,
  formatEventTime,
  getInitials,
} from '../../../components/team/playerTeamDisplay';

/**
 * One of the player's own teams: squad, coach, schedule and their own
 * attendance record for that squad.
 *
 * Backed by GET /players/me/teams/:teamId, which re-checks the membership
 * server-side — the id in the URL is never trusted on its own — and returns
 * teammate-safe fields only (name + shirt number, no contact/medical/payment
 * data belonging to anyone else).
 */

type TabKey = 'roster' | 'events' | 'attendance';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'roster', label: 'Lot', icon: 'groups' },
  { key: 'events', label: 'Evenimente', icon: 'event' },
  { key: 'attendance', label: 'Prezența mea', icon: 'fact-check' },
];

function StatTile({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <View
      className="rounded-[14px] border px-3 sm:px-4 py-3 flex-1 min-w-0"
      style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}
    >
      <Text className="text-[9.5px] sm:text-[10px] font-bold uppercase tracking-[0.06em] sm:tracking-[0.09em]" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{label}</Text>
      <Text className="text-[19px] sm:text-[22px] font-bold mt-1" style={{ color: color ?? 'var(--c-ink)' }} numberOfLines={1}>{value}</Text>
      {hint ? <Text className="text-[11px] sm:text-[11.5px] font-medium mt-0.5" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{hint}</Text> : null}
    </View>
  );
}

function EventRow({ event, trailing, note }: { event: MyTeamEvent; trailing?: React.ReactNode; note?: string | null }) {
  const meta = eventTypeMeta(event.type);

  return (
    <View
      className="rounded-[14px] border px-4 py-3 gap-2"
      style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)', boxShadow: 'var(--e-sm)' } as any}
    >
      <View className="flex-row items-center gap-3">
        {/* Date tile instead of a repeated icon: on a schedule, the day is what
            the eye is actually scanning for. */}
        <View className="w-11 items-center justify-center rounded-[11px] py-1.5 shrink-0" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
          <Text className="text-[11px] font-bold" style={{ color: 'var(--c-brand-fg)' }}>{formatEventDay(event.startTime)}</Text>
          <Text className="text-[10px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>{formatEventTime(event.startTime)}</Text>
        </View>

        <View className="flex-1 min-w-0">
          <Text className="text-[14px] font-bold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{event.title}</Text>
          <View className="flex-row items-center gap-1.5 mt-0.5">
            <MaterialIcons name={meta.icon} size={13} color="var(--c-faint)" />
            <Text className="text-[12px] font-medium flex-1 min-w-0" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
              {meta.label}{event.location ? ` · ${event.location}` : ''}
            </Text>
          </View>
        </View>

        {trailing ? <View className="shrink-0">{trailing}</View> : null}
      </View>

      {note ? (
        <View className="rounded-[10px] px-3 py-2" style={{ backgroundColor: 'var(--c-surface-2)' }}>
          <Text className="text-[12px] font-medium leading-5" style={{ color: 'var(--c-ink-soft)' }}>{note}</Text>
        </View>
      ) : null}
    </View>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const tone = attendanceStatusTone(status);
  return (
    <View className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ backgroundColor: tone.bg }}>
      <MaterialIcons name={tone.icon} size={13} color={tone.fg} />
      <Text className="text-[11px] font-bold" style={{ color: tone.fg }}>{tone.label}</Text>
    </View>
  );
}

function TeammateTile({ player }: { player: MyTeamDetail['roster'][number] }) {
  return (
    <View
      className="flex-row items-center gap-3 rounded-[12px] border px-3.5 py-3 min-w-0"
      style={{
        borderColor: player.isMe ? 'var(--c-brand-fg)' : 'var(--c-border)',
        backgroundColor: player.isMe ? 'var(--c-surface-tint)' : 'var(--c-surface-2)',
      } as any}
    >
      <View className="h-11 w-11 rounded-full items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
        <Text className="text-[13px] font-bold" style={{ color: 'var(--c-brand-fg)' }}>{getInitials(player.firstName, player.lastName)}</Text>
      </View>

      <View className="flex-1 min-w-0 flex-row items-center gap-2">
        <Text className="text-[14.5px] font-bold min-w-0" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
          {player.firstName} {player.lastName}
        </Text>
        {player.isMe ? (
          <View className="rounded-full px-2 py-0.5 shrink-0" style={{ backgroundColor: 'var(--c-brand-fg)' }}>
            <Text className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: 'var(--c-surface)' }}>Tu</Text>
          </View>
        ) : null}
      </View>

      {player.number != null ? (
        <View className="h-8 min-w-[34px] px-2 rounded-full items-center justify-center border shrink-0" style={{ borderColor: 'var(--c-border)' } as any}>
          <Text className="text-[12.5px] font-bold" style={{ color: 'var(--c-ink)' }}>#{player.number}</Text>
        </View>
      ) : null}
    </View>
  );
}

function DetailSkeleton() {
  return (
    <View className="gap-4" accessibilityRole="progressbar" accessibilityLabel="Se încarcă echipa">
      <Skeleton className="h-[168px] w-full rounded-[16px]" />
      <Skeleton className="h-11 w-full rounded-[12px]" />
      <View className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-[68px] w-full rounded-[12px]" />
        ))}
      </View>
    </View>
  );
}

export default function PlayerTeamDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const teamId = Number(id);

  const [team, setTeam] = useState<MyTeamDetail | null>(null);
  const [tab, setTab] = useState<TabKey>('roster');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      setTeam(await teamsApi.getMyTeamDetail(teamId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Echipa nu a putut fi încărcată.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (Number.isFinite(teamId)) loadData();
  }, [loadData, teamId]);

  const chips = useMemo(() => {
    if (!team) return [] as string[];
    return [
      team.level ? LEVEL_LABELS[team.level] : null,
      team.gender ? GENDER_LABELS[team.gender] : null,
      team.seasonName || null,
    ].filter(Boolean) as string[];
  }, [team]);

  const markedEvents = useMemo(
    () => (team?.recentEvents ?? []).filter((event: MyTeamPastEvent) => event.myStatus !== null),
    [team]
  );

  return (
    <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-16">
      <PageContainer>
        <Pressable
          onPress={() => router.push('/team')}
          accessibilityRole="button"
          accessibilityLabel="Înapoi la echipele mele"
          className="flex-row items-center gap-1.5 self-start mb-3 h-8 px-2 -ml-2 rounded-[9px]"
        >
          <MaterialIcons name="arrow-back" size={17} color="var(--c-muted)" />
          <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-muted)' }}>Echipele mele</Text>
        </Pressable>

        <PageHeader
          title={team?.name || 'Echipă'}
          subtitle={team ? [team.leagueName, team.seasonName].filter(Boolean).join(' · ') : 'Se încarcă...'}
          actions={
            <Pressable
              onPress={() => loadData(true)}
              className="w-9 h-9 rounded-[10px] border items-center justify-center"
              style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}
              accessibilityRole="button"
              accessibilityLabel="Reîmprospătează"
            >
              {refreshing ? <ActivityIndicator size="small" color="var(--c-brand-fg)" /> : <MaterialIcons name="refresh" size={17} color="var(--c-ink-soft)" />}
            </Pressable>
          }
        />

        {loading ? (
          <DetailSkeleton />
        ) : error ? (
          <ErrorState
            title="Nu am putut încărca echipa"
            message={error}
            actionLabel="Reîncearcă"
            onAction={() => loadData(true)}
          />
        ) : !team ? (
          <EmptyState icon="groups" title="Echipa nu este disponibilă" message="Întoarce-te la lista echipelor tale." />
        ) : (
          <View className="gap-4">
            {/* Coach + squad size + own attendance, the three things a player
                opens a squad for. */}
            <GlassCard className="gap-4">
              {/* Chips sit beside the coach on desktop and drop below on
                  mobile — kept in the same row at 375px they squeeze the coach
                  name down to a couple of characters. */}
              <View className="flex-col sm:flex-row sm:items-center gap-3">
                <View className="flex-row items-center gap-3 flex-1 min-w-0">
                  <View className="w-11 h-11 rounded-full items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                    <MaterialIcons name="sports" size={20} color="var(--c-brand-fg)" />
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-[10px] font-bold uppercase tracking-[0.09em]" style={{ color: 'var(--c-muted)' }}>Antrenor</Text>
                    <Text className="text-[15px] font-bold mt-0.5" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
                      {team.coach?.name || 'Nealocat'}
                    </Text>
                  </View>
                </View>
                {chips.length ? (
                  <View className="flex-row flex-wrap gap-1.5 sm:justify-end shrink-0">
                    {chips.map((chip) => (
                      <View key={chip} className="rounded-full px-2.5 py-1 border" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}>
                        <Text className="text-[11px] font-semibold" style={{ color: 'var(--c-muted)' }}>{chip}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>

              {/* Three short numbers, so they stay side by side even at 375px —
                  stacked they pushed the tab strip below the fold. */}
              <View className="flex-row gap-2 sm:gap-2.5">
                <StatTile label="Lot" value={String(team.playerCount)} hint={team.playerCount === 1 ? 'jucător' : 'jucători'} />
                {/* Labels and hints stay short enough to survive a ~100px
                    column at 375px — "Prezența mea" and "niciun eveniment"
                    both ellipsised there. */}
                <StatTile
                  label="Prezență"
                  value={team.attendance.rate == null ? '—' : `${team.attendance.rate}%`}
                  hint={team.attendance.total ? `${team.attendance.present}/${team.attendance.total} sesiuni` : 'nemarcată'}
                  color={attendanceRateColor(team.attendance.rate)}
                />
                <StatTile
                  label="Urmează"
                  value={String(team.upcomingEvents.length)}
                  hint={team.upcomingEvents[0] ? team.upcomingEvents[0].title : '—'}
                />
              </View>
            </GlassCard>

            {/* Segmented control: scrolls horizontally on a 375px viewport
                rather than wrapping to a second row. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5">
              {TABS.map((item) => {
                const active = tab === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => setTab(item.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={item.label}
                    className="flex-row items-center gap-1.5 h-9 px-3.5 rounded-[10px] border shrink-0"
                    style={{
                      borderColor: active ? 'var(--c-brand-fg)' : 'var(--c-border)',
                      backgroundColor: active ? 'var(--c-surface-tint)' : 'var(--c-surface)',
                    } as any}
                  >
                    <MaterialIcons name={item.icon} size={15} color={active ? 'var(--c-brand-fg)' : 'var(--c-muted)'} />
                    <Text className="text-[12.5px] font-semibold" style={{ color: active ? 'var(--c-brand-fg)' : 'var(--c-muted)' }}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {tab === 'roster' ? (
              team.roster.length === 0 ? (
                <EmptyState icon="groups" compact title="Lotul este gol" message="Niciun jucător nu este alocat acestei echipe deocamdată." />
              ) : (
                <View className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                  {team.roster.map((player) => <TeammateTile key={player.id} player={player} />)}
                </View>
              )
            ) : null}

            {tab === 'events' ? (
              <View className="gap-4">
                <View className="gap-2.5">
                  <Text className="text-[11px] font-bold uppercase tracking-[0.09em]" style={{ color: 'var(--c-faint)' }}>Urmează</Text>
                  {team.upcomingEvents.length === 0 ? (
                    <EmptyState icon="event-busy" compact title="Niciun eveniment programat" message="Antrenamentele și meciurile viitoare apar aici." />
                  ) : (
                    team.upcomingEvents.map((event) => <EventRow key={event.id} event={event} />)
                  )}
                </View>

                <View className="gap-2.5">
                  <Text className="text-[11px] font-bold uppercase tracking-[0.09em]" style={{ color: 'var(--c-faint)' }}>Recente</Text>
                  {team.recentEvents.length === 0 ? (
                    <EmptyState icon="history" compact title="Niciun eveniment trecut" message="Istoricul echipei apare aici după primele sesiuni." />
                  ) : (
                    team.recentEvents.map((event) => (
                      <EventRow
                        key={event.id}
                        event={event}
                        note={event.coachNote}
                        trailing={<StatusBadge status={event.myStatus} />}
                      />
                    ))
                  )}
                </View>
              </View>
            ) : null}

            {tab === 'attendance' ? (
              <View className="gap-2.5">
                {/* The list only covers the team's recent sessions, while the
                    rate above covers every session ever marked — say so, or a
                    player whose history is longer reads the two as a mismatch. */}
                <View className="flex-row items-center justify-between gap-3 flex-wrap">
                  <Text className="text-[11px] font-bold uppercase tracking-[0.09em]" style={{ color: 'var(--c-faint)' }}>Sesiuni recente marcate</Text>
                  <Text className="text-[12px] font-medium" style={{ color: 'var(--c-muted)' }}>
                    {team.attendance.total
                      ? `${team.attendance.present}/${team.attendance.total} sesiuni marcate în total`
                      : 'nicio sesiune marcată'}
                  </Text>
                </View>

                {markedEvents.length === 0 ? (
                  <EmptyState
                    icon="fact-check"
                    compact
                    title="Nicio prezență marcată"
                    message="Sesiunile la care antrenorul îți marchează prezența în această echipă apar aici."
                  />
                ) : (
                  markedEvents.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      // The coach's note on *this player* for that session, not
                      // the shared team note shown on the events tab.
                      note={event.myNote}
                      trailing={<StatusBadge status={event.myStatus} />}
                    />
                  ))
                )}
              </View>
            ) : null}
          </View>
        )}
      </PageContainer>
    </ScrollView>
  );
}
