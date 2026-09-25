import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import GlassCard from '../../components/ui/GlassCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../components/ui/ScreenState';
import PageContainer from '../../components/ui/PageContainer';
import PageHeader from '../../components/ui/PageHeader';
import { teamsApi, Player } from '../../services/teamsApi';
import { useFirebaseAuth } from '../../context/AuthContext';

/**
 * "Echipa mea" — read-only teammate list. Deliberately shows only
 * name/number/position/team: the backing endpoint (GET /players/roster)
 * strips payment/medical/attendance/contact fields for player & parent
 * sessions server-side, so there is nothing sensitive to accidentally
 * render here even if this component changes later.
 */

function getInitials(player: Player) {
  const first = player.firstName?.[0] ?? '';
  const last = player.lastName?.[0] ?? '';
  return `${first}${last}`.toUpperCase() || '?';
}

function getMedicalStatus(expiry: string | null | undefined) {
  if (!expiry) return { label: 'Necompletată', bg: 'var(--c-surface-3)', fg: 'var(--c-muted)' };
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
  if (Number.isNaN(days)) return { label: 'Necompletată', bg: 'var(--c-surface-3)', fg: 'var(--c-muted)' };
  if (days < 0) return { label: 'Expirată', bg: 'var(--c-danger-bg)', fg: 'var(--c-danger-fg)' };
  if (days <= 30) return { label: `Expiră în ${days} zile`, bg: 'var(--c-warning-bg)', fg: 'var(--c-warning-fg)' };
  return { label: 'Valabilă', bg: 'var(--c-success-bg)', fg: 'var(--c-success-fg)' };
}

/** Own medical/compliance status — sourced from GET /players/me (self only, never a teammate's). */
function MyStatusCard({ player }: { player: Player }) {
  const status = getMedicalStatus(player.medicalCheckExpiry);
  const expiryLabel = player.medicalCheckExpiry
    ? new Date(player.medicalCheckExpiry).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <GlassCard>
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--c-faint)' }}>Statusul meu</Text>
          <Text className="text-[15px] font-black mt-1" style={{ color: 'var(--c-ink-strong)' }}>Vizită medicală</Text>
          {expiryLabel ? (
            <Text className="text-[12px] font-semibold mt-0.5" style={{ color: 'var(--c-muted)' }}>Valabilă până la {expiryLabel}</Text>
          ) : null}
        </View>
        <View className="rounded-full px-3 py-2" style={{ backgroundColor: status.bg }}>
          <Text className="text-[11px] font-black uppercase tracking-widest" style={{ color: status.fg }}>{status.label}</Text>
        </View>
      </View>
    </GlassCard>
  );
}

function TeammateRow({ player }: { player: Player }) {
  return (
    // A self-contained tile rather than a full-bleed list row: the roster is
    // now a grid, so each teammate needs its own boundary instead of relying on
    // a shared top border from the sibling above it.
    <View
      className="flex-row items-center gap-3 rounded-[12px] border px-3.5 py-3 min-w-0"
      style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}
    >
      <View className="h-12 w-12 rounded-full items-center justify-center" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
        <Text className="text-[13px] font-black" style={{ color: 'var(--c-brand-fg)' }}>{getInitials(player)}</Text>
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-[15px] font-black" style={{ color: 'var(--c-ink-strong)' }} numberOfLines={1}>
          {player.firstName} {player.lastName}
        </Text>
        {player.position ? (
          <Text className="text-[12px] font-semibold mt-0.5" style={{ color: 'var(--c-muted)' }}>{player.position}</Text>
        ) : null}
      </View>
      {player.number != null ? (
        <View className="h-9 min-w-[36px] px-2 rounded-full items-center justify-center border" style={{ borderColor: 'var(--c-border)' }}>
          <Text className="text-[13px] font-black" style={{ color: 'var(--c-ink)' }}>#{player.number}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Mirrors the loaded layout block for block — status card, then grouped roster
 * cards — so the page does not jump when the roster arrives.
 */
function TeamSkeleton() {
  return (
    <View className="gap-5" accessibilityRole="progressbar" accessibilityLabel="Se încarcă echipa">
      <GlassCard>
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-36 mt-2" />
            <Skeleton className="h-3 w-48 mt-1.5" />
          </View>
          <Skeleton className="h-8 w-24 rounded-full" />
        </View>
      </GlassCard>
      {Array.from({ length: 2 }).map((_, groupIndex) => (
        <GlassCard key={groupIndex} className="p-0">
          <View className="px-5 py-4 flex-row items-center justify-between border-b" style={{ borderColor: 'var(--c-border)' }}>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-20" />
          </View>
          {Array.from({ length: 4 }).map((_, rowIndex) => (
            <View key={rowIndex} className="flex-row items-center gap-4 px-5 py-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <View className="flex-1">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-1/4 mt-1.5" />
              </View>
              <Skeleton className="h-9 w-10 rounded-full" />
            </View>
          ))}
        </GlassCard>
      ))}
    </View>
  );
}

function TeamGroup({ teamName, players }: { teamName: string; players: Player[] }) {
  return (
    <GlassCard className="p-0">
      <View className="px-5 py-4 flex-row items-center justify-between border-b" style={{ borderColor: 'var(--c-border)' }}>
        <Text className="text-[16px] font-black" style={{ color: 'var(--c-ink-strong)' }}>{teamName}</Text>
        <Text className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--c-faint)' }}>{players.length} jucători</Text>
      </View>
      {/* The roster was a single stacked column inside a 768px page — a squad of
          14 became a 1,100px scroll on a viewport that had room for three
          abreast. Column count steps with the space actually available. */}
      <View className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 p-4">
        {players.map((player) => (
          <TeammateRow key={player.id} player={player} />
        ))}
      </View>
    </GlassCard>
  );
}

export default function TeamScreen() {
  const { session } = useFirebaseAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [myRecord, setMyRecord] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const [roster, self] = await Promise.all([
        teamsApi.getRoster(),
        teamsApi.getMyPlayerRecord().catch(() => null),
      ]);
      setPlayers(roster);
      setMyRecord(self);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Echipa nu a putut fi încărcată.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const groups = useMemo(() => {
    const byTeam = new Map<string, Player[]>();
    players.forEach((player) => {
      const teamName = player.teamName || 'Fără echipă';
      byTeam.set(teamName, [...(byTeam.get(teamName) ?? []), player]);
    });
    return Array.from(byTeam.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([teamName, teamPlayers]) => ({
        teamName,
        players: [...teamPlayers].sort((a, b) => (a.number ?? 999) - (b.number ?? 999)),
      }));
  }, [players]);

  return (
    <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-16">
      <PageContainer>
        <PageHeader
          title="Echipa mea"
          subtitle={session?.teamName || session?.clubName || 'Coechipierii tăi'}
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
          <TeamSkeleton />
        ) : error ? (
          <ErrorState
            title="Nu am putut încărca echipa"
            message={error}
            actionLabel="Reîncearcă"
            onAction={() => loadData(true)}
          />
        ) : groups.length === 0 ? (
          <EmptyState
            icon="groups"
            title="Nu ești încă alocat unei echipe"
            message="Când antrenorul te adaugă într-o echipă, coechipierii tăi apar aici."
          />
        ) : (
          <View className="gap-4">
            {groups.map((group) => (
              <TeamGroup key={group.teamName} teamName={group.teamName} players={group.players} />
            ))}
          </View>
        )}
        </View>
      </PageContainer>
    </ScrollView>
  );
}
