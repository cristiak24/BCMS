import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import GlassCard from '../../../components/ui/GlassCard';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../../components/ui/ScreenState';
import PageContainer from '../../../components/ui/PageContainer';
import PageHeader from '../../../components/ui/PageHeader';
import { teamsApi, MyTeamSummary, Player } from '../../../services/teamsApi';
import { GENDER_LABELS, LEVEL_LABELS } from '../../../components/myclub/teamDisplay';
import { useSession } from '../../../context/AuthContext';
import { attendanceRateColor, eventTypeMeta, formatEventDateTime } from '../../../components/team/playerTeamDisplay';

/**
 * "Echipa mea" — team picker. A player can belong to several squads, so this
 * screen lists the *teams* (never their rosters) and each one opens its own
 * detail page with squad, coach, schedule and the player's own attendance.
 *
 * Everything here comes from GET /players/me/teams, which resolves the caller's
 * memberships server-side and returns nothing about other players.
 */

function getMedicalStatus(expiry: string | null | undefined) {
  if (!expiry) return { label: 'Necompletată', bg: 'var(--c-surface-3)', fg: 'var(--c-muted)', icon: 'help-outline' as const };
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
  if (Number.isNaN(days)) return { label: 'Necompletată', bg: 'var(--c-surface-3)', fg: 'var(--c-muted)', icon: 'help-outline' as const };
  if (days < 0) return { label: 'Expirată', bg: 'var(--c-danger-bg)', fg: 'var(--c-danger-fg)', icon: 'error-outline' as const };
  if (days <= 30) return { label: `Expiră în ${days} zile`, bg: 'var(--c-warning-bg)', fg: 'var(--c-warning-fg)', icon: 'schedule' as const };
  return { label: 'Valabilă', bg: 'var(--c-success-bg)', fg: 'var(--c-success-fg)', icon: 'verified' as const };
}

/** Own medical/compliance status — sourced from GET /players/me (self only, never a teammate's). */
function MyStatusCard({ player }: { player: Player }) {
  const status = getMedicalStatus(player.medicalCheckExpiry);
  const expiryLabel = player.medicalCheckExpiry
    ? new Date(player.medicalCheckExpiry).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <GlassCard>
      <View className="flex-row items-center gap-3">
        <View className="w-10 h-10 rounded-[12px] items-center justify-center shrink-0" style={{ backgroundColor: status.bg }}>
          <MaterialIcons name={status.icon} size={19} color={status.fg} />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-[10px] font-bold uppercase tracking-[0.09em]" style={{ color: 'var(--c-muted)' }}>Statusul meu</Text>
          <Text className="text-[15px] font-bold mt-0.5" style={{ color: 'var(--c-ink)' }}>Vizită medicală</Text>
          {expiryLabel ? (
            <Text className="text-[12px] font-medium mt-0.5" style={{ color: 'var(--c-muted)' }}>Valabilă până la {expiryLabel}</Text>
          ) : null}
        </View>
        <View className="rounded-full px-3 py-1.5 shrink-0" style={{ backgroundColor: status.bg }}>
          <Text className="text-[11px] font-bold" style={{ color: status.fg }}>{status.label}</Text>
        </View>
      </View>
    </GlassCard>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <View className="rounded-full px-2.5 py-1 border" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}>
      <Text className="text-[11px] font-semibold" style={{ color: 'var(--c-muted)' }}>{label}</Text>
    </View>
  );
}

function MetaRow({ icon, children }: { icon: string; children: string }) {
  return (
    <View className="flex-row items-center gap-2 min-w-0">
      <MaterialIcons name={icon} size={15} color="var(--c-faint)" />
      <Text className="text-[12.5px] font-medium flex-1 min-w-0" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

function TeamCard({ team, onOpen }: { team: MyTeamSummary; onOpen: () => void }) {
  const chips = [
    team.level ? LEVEL_LABELS[team.level] : null,
    team.gender ? GENDER_LABELS[team.gender] : null,
    team.seasonName || null,
  ].filter(Boolean) as string[];

  const next = team.nextEvent;
  const nextMeta = next ? eventTypeMeta(next.type) : null;

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Deschide echipa ${team.name}`}
      className="rounded-[16px] border p-5 gap-4 text-left w-full"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
    >
      <View className="flex-row items-start gap-3">
        <View className="w-11 h-11 rounded-[13px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
          <MaterialIcons name="shield" size={21} color="var(--c-brand-fg)" />
        </View>

        <View className="flex-1 min-w-0">
          <Text className="text-[17px] font-bold leading-tight" style={{ color: 'var(--c-ink)' }} numberOfLines={2}>
            {team.name}
          </Text>
          {team.leagueName ? (
            <Text className="text-[12.5px] font-medium mt-1" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
              {team.leagueName}
            </Text>
          ) : null}
        </View>

        <MaterialIcons name="chevron-right" size={22} color="var(--c-faint)" />
      </View>

      {chips.length ? (
        <View className="flex-row flex-wrap gap-1.5">
          {chips.map((chip) => <Chip key={chip} label={chip} />)}
        </View>
      ) : null}

      <View className="gap-1.5">
        <MetaRow icon="sports">{team.coachName ? `Antrenor: ${team.coachName}` : 'Antrenor nealocat'}</MetaRow>
        <MetaRow icon="groups">{`${team.playerCount} ${team.playerCount === 1 ? 'jucător în lot' : 'jucători în lot'}`}</MetaRow>
        <MetaRow icon={nextMeta ? nextMeta.icon : 'event-busy'}>
          {next ? `Urmează: ${next.title} · ${formatEventDateTime(next.startTime)}` : 'Niciun eveniment programat'}
        </MetaRow>
      </View>

      {/* Own attendance for this squad — the only number on the card that is
          about the player rather than the team. */}
      <View className="flex-row items-center justify-between gap-3 pt-3 border-t" style={{ borderColor: 'var(--c-border)' } as any}>
        <Text className="text-[11px] font-bold uppercase tracking-[0.09em]" style={{ color: 'var(--c-faint)' }}>Prezența mea</Text>
        <View className="flex-row items-baseline gap-1.5">
          <Text className="text-[18px] font-bold" style={{ color: attendanceRateColor(team.attendance.rate) }}>
            {team.attendance.rate == null ? '—' : `${team.attendance.rate}%`}
          </Text>
          {team.attendance.total ? (
            <Text className="text-[12px] font-medium" style={{ color: 'var(--c-muted)' }}>
              {team.attendance.present}/{team.attendance.total}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function TeamListSkeleton() {
  return (
    <View className="grid grid-cols-1 lg:grid-cols-2 gap-3" accessibilityRole="progressbar" accessibilityLabel="Se încarcă echipele">
      {Array.from({ length: 2 }).map((_, index) => (
        <Skeleton key={index} className="h-[230px] w-full rounded-[16px]" />
      ))}
    </View>
  );
}

export default function TeamScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [teams, setTeams] = useState<MyTeamSummary[]>([]);
  const [myRecord, setMyRecord] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const [myTeams, self] = await Promise.all([
        teamsApi.getMyTeams(),
        teamsApi.getMyPlayerRecord().catch(() => null),
      ]);
      setTeams(myTeams);
      setMyRecord(self);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Echipele nu au putut fi încărcate.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const subtitle = teams.length
    ? `${teams.length} ${teams.length === 1 ? 'echipă' : 'echipe'} · ${session?.clubName || 'Clubul tău'}`
    : session?.clubName || 'Echipele tale';

  return (
    <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-16">
      <PageContainer>
        <PageHeader
          title="Echipa mea"
          subtitle={subtitle}
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

        <View className="gap-4">
          {!loading && myRecord ? <MyStatusCard player={myRecord} /> : null}

          {loading ? (
            <TeamListSkeleton />
          ) : error ? (
            <ErrorState
              title="Nu am putut încărca echipele"
              message={error}
              actionLabel="Reîncearcă"
              onAction={() => loadData(true)}
            />
          ) : teams.length === 0 ? (
            <EmptyState
              icon="groups"
              title="Nu ești încă alocat unei echipe"
              message="Când antrenorul te adaugă într-o echipă, aceasta apare aici cu lotul, programul și prezența ta."
            />
          ) : (
            // Two columns from lg up: a player is on one or two squads, so a
            // wider grid would leave a mostly empty row.
            <View className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {teams.map((team) => (
                <TeamCard key={team.id} team={team} onOpen={() => router.push(`/team/${team.id}`)} />
              ))}
            </View>
          )}
        </View>
      </PageContainer>
    </ScrollView>
  );
}
