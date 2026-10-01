import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import { gamesApi, type Game, type GamePayload } from '../../services/gamesApi';
import { computeBoxScore } from '../../utils/gameStats';
import { useSession } from '../../context/AuthContext';
import PageContainer from '../ui/PageContainer';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState, ErrorState } from '../ui/ScreenState';
import BoxScoreView from './BoxScoreView';
import GameSetup from './GameSetup';
import Scorer from './Scorer';
import { clearScorerCache } from './useScorer';

/**
 * /admin/stats/:id, /coach/stats/:id, /stats/:id (a delegated parent).
 * setup (staff) → live scorer (whoever keeps the sheet) → box score.
 * People who may only watch see the box score as it stands.
 */

function formatWhen(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ro-RO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function GameStatsScreen() {
  const { id } = useLocalSearchParams();
  const eventId = Number(id);
  const router = useRouter();
  const { session } = useSession();
  const [data, setData] = useState<GamePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingSetup, setEditingSetup] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await gamesApi.get(eventId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut încărca meciul.');
    }
  }, [eventId]);

  useEffect(() => {
    if (Number.isInteger(eventId) && eventId > 0) void load();
    else setError('Meciul nu există.');
  }, [eventId, load]);

  const finishedBox = useMemo(() => (data?.game ? computeBoxScore(data.events, data.game.starters, data.game.periodSec) : null), [data]);

  const onReady = (game: Game) => {
    setEditingSetup(false);
    setData((d) => (d ? { ...d, game } : d));
  };

  const onFinished = async () => {
    try {
      const game = await gamesApi.finish(eventId);
      clearScorerCache(eventId);
      await load();
      setData((d) => (d ? { ...d, game } : d));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut încheia meciul.');
    }
  };

  const header = data ? (
    <View className="mb-4 gap-2">
      <Pressable onPress={() => router.back()} accessibilityRole="button" className="ui-press self-start h-9 pl-2 pr-3 rounded-[10px] border flex-row items-center gap-1.5" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}>
        <MaterialIcons name="chevron-left" size={18} color="var(--c-ink-soft)" />
        <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>Înapoi</Text>
      </Pressable>
      <View>
        <Text className="t-eyebrow" style={{ color: 'var(--c-faint)' }}>Statistică meci · {data.team.name}</Text>
        <Text className="text-[20px] md:text-[24px] font-bold leading-tight mt-1" style={{ color: 'var(--c-ink-strong)' }}>{data.event.title}</Text>
        <Text className="t-meta mt-1" style={{ color: 'var(--c-muted)' }}>{[formatWhen(data.event.startTime), data.event.location].filter(Boolean).join(' · ')}</Text>
      </View>
    </View>
  ) : null;

  let body: React.ReactNode;
  if (error) {
    body = <ErrorState title="Nu am putut deschide meciul" message={error} actionLabel="Reîncearcă" onAction={load} />;
  } else if (!data) {
    body = (
      <View className="gap-3" accessibilityRole="progressbar" accessibilityLabel="Se încarcă meciul">
        <Skeleton className="h-[120px] w-full max-w-[680px] rounded-[16px]" />
        <Skeleton className="h-[260px] w-full max-w-[680px] rounded-[16px]" />
      </View>
    );
  } else if (!data.game || (editingSetup && data.canSetup)) {
    body = data.canSetup ? (
      <GameSetup eventId={eventId} data={data} myUserId={session?.id != null ? Number(session.id) : null} onReady={onReady} />
    ) : (
      <EmptyState icon="sports-basketball" title="Statistica nu a început" message="Antrenorul pregătește meciul. Revino la ora meciului." />
    );
  } else if (data.game.status !== 'finished' && data.canKeep) {
    body = (
      <View className="gap-3">
        {data.canSetup && data.game.status === 'setup' ? (
          <Pressable onPress={() => setEditingSetup(true)} accessibilityRole="button" className="self-center flex-row items-center gap-1">
            <MaterialIcons name="edit" size={14} color="var(--c-brand-fg)" />
            <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Modifică pregătirea</Text>
          </Pressable>
        ) : null}
        <Scorer eventId={eventId} game={data.game} serverEvents={data.events} teamName={data.team.name} onFinished={() => void onFinished()} />
      </View>
    );
  } else {
    body = finishedBox ? (
      <View className="gap-3 max-w-[900px]">
        <View className="flex-row items-center gap-2">
          <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: data.game.status === 'finished' ? 'var(--c-surface-3)' : 'var(--c-success-bg)' }}>
            <Text className="text-[12px] font-bold" style={{ color: data.game.status === 'finished' ? 'var(--c-muted)' : 'var(--c-success-fg)' }}>
              {data.game.status === 'finished' ? 'Final' : 'În desfășurare'}
            </Text>
          </View>
          {data.game.status !== 'finished' ? (
            <Pressable onPress={load} accessibilityRole="button" className="flex-row items-center gap-1">
              <MaterialIcons name="refresh" size={14} color="var(--c-brand-fg)" />
              <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Actualizează</Text>
            </Pressable>
          ) : null}
        </View>
        <BoxScoreView
          box={finishedBox}
          mode={data.game.mode}
          roster={data.game.roster}
          opponentRoster={data.game.opponentRoster}
          teamName={data.team.name}
          opponentName={data.game.opponentName || 'Adversar'}
        />
      </View>
    ) : null;
  }

  return (
    <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-32" showsVerticalScrollIndicator={false}>
      <PageContainer>
        {header}
        {body}
      </PageContainer>
    </ScrollView>
  );
}
