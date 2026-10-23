import { parseApiDate } from '@/utils/dates';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import { gamesApi, type Game, type GamePayload } from '../../services/gamesApi';
import { computeBoxScore } from '../../utils/gameStats';
import { useSession } from '../../context/AuthContext';
import { normalizeRole } from '../../utils/authSession';
import { startsMoreThanADayAhead } from '../../utils/scorerStatus';
import Button from '../ui/Button';
import ConfirmDialog from '../ui/ConfirmDialog';
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
 * People who may only watch see the box score as it stands. A club admin can
 * reopen a finished match to correct it (the server audits it).
 */

function formatWhen(iso: string) {
  const d = parseApiDate(iso);
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
  // Opening the scorer more than a day before the match needs a yes first.
  const [earlyStartOk, setEarlyStartOk] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [reopening, setReopening] = useState(false);
  const isClubAdmin = ['admin', 'superadmin'].includes(normalizeRole(session?.role));

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

  const reopen = async () => {
    setReopening(true);
    try {
      const game = await gamesApi.reopen(eventId);
      clearScorerCache(eventId);
      await load();
      setData((d) => (d ? { ...d, game } : d));
      setConfirmReopen(false);
    } catch (err) {
      setConfirmReopen(false);
      setError(err instanceof Error ? err.message : 'Nu am putut redeschide meciul.');
    } finally {
      setReopening(false);
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
        <Text accessibilityRole="header" aria-level={1} className="f-display text-[20px] md:text-[24px] font-extrabold leading-tight mt-1" style={{ color: 'var(--c-ink-strong)', letterSpacing: '-0.03em' } as any}>{data.event.title}</Text>
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
  } else if (data.game.status === 'setup' && data.canKeep && !earlyStartOk && startsMoreThanADayAhead(data.event.startTime)) {
    body = (
      <View className="max-w-[560px] rounded-[16px] border p-5 gap-3" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}>
        <View className="flex-row items-center gap-2.5">
          <MaterialIcons name="event" size={20} color="var(--c-warning-fg)" />
          <Text className="f-display text-[16px] font-bold" style={{ color: 'var(--c-ink)' }}>Meciul e programat mai târziu</Text>
        </View>
        <Text className="text-[13.5px] leading-5" style={{ color: 'var(--c-ink-soft)' }}>
          Meciul începe {formatWhen(data.event.startTime)}. Dacă pornești statistica acum, scorul și acțiunile se înregistrează pentru acest meci. Pornește doar dacă meciul se joacă azi.
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <Button variant="secondary" label="Înapoi" icon="chevron-left" onPress={() => router.back()} />
          <Button label="Pornește oricum" icon="play-arrow" onPress={() => setEarlyStartOk(true)} />
        </View>
      </View>
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
          ) : isClubAdmin ? (
            <View className="ml-auto">
              <Button size="sm" variant="secondary" icon="edit" label="Redeschide meciul" onPress={() => setConfirmReopen(true)} />
            </View>
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
      <ConfirmDialog
        visible={confirmReopen}
        icon="edit"
        title="Redeschizi meciul?"
        message="Meciul revine în desfășurare, ca să corectezi acțiunile din foaia de statistică. Scorul se recalculează din acțiuni, iar redeschiderea apare în jurnal. Încheie-l din nou după corectură."
        confirmLabel="Redeschide"
        cancelLabel="Renunță"
        loading={reopening}
        onConfirm={() => void reopen()}
        onCancel={() => setConfirmReopen(false)}
      />
    </ScrollView>
  );
}
