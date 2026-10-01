import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import type { Game } from '../../services/gamesApi';
import type { EventType, GameEvent } from '../../utils/gameStats';
import ConfirmDialog from '../ui/ConfirmDialog';
import BoxScoreView from './BoxScoreView';
import { useScorer } from './useScorer';

/**
 * The live scorer. One rule everywhere: tap the player, then what they did —
 * two taps per action. The selection clears after each action so a nervous
 * double tap can't log a basket twice, and "Anulează" is always one tap away.
 */

type Selection = { side: 'us'; playerId: number } | { side: 'them'; number: string | null } | null;

const MAX_FOULS = 5;
const BONUS_AT = 4;

const OUR_ACTIONS_SIMPLE: { type: EventType; label: string; tone: 'score' | 'foul' | 'plain' }[] = [
  { type: 'p2', label: '+2', tone: 'score' },
  { type: 'p3', label: '+3', tone: 'score' },
  { type: 'p1', label: '+1 liber', tone: 'score' },
  { type: 'foul', label: 'Fault', tone: 'foul' },
];

const OUR_ACTIONS_FULL: typeof OUR_ACTIONS_SIMPLE = [
  { type: 'p2', label: '+2', tone: 'score' },
  { type: 'p3', label: '+3', tone: 'score' },
  { type: 'p1', label: '+1 liber', tone: 'score' },
  { type: 'm2', label: 'Ratat 2', tone: 'plain' },
  { type: 'm3', label: 'Ratat 3', tone: 'plain' },
  { type: 'm1', label: 'Ratat liber', tone: 'plain' },
  { type: 'reb_d', label: 'Rec. apărare', tone: 'plain' },
  { type: 'reb_o', label: 'Rec. atac', tone: 'plain' },
  { type: 'ast', label: 'Pasă decisivă', tone: 'plain' },
  { type: 'stl', label: 'Furt', tone: 'plain' },
  { type: 'blk', label: 'Capac', tone: 'plain' },
  { type: 'tov', label: 'Pierdere', tone: 'plain' },
  { type: 'foul', label: 'Fault', tone: 'foul' },
];

const THEIR_ACTIONS: { type: EventType; label: string }[] = [
  { type: 'p1', label: '+1' },
  { type: 'p2', label: '+2' },
  { type: 'p3', label: '+3' },
  { type: 'foul', label: 'Fault' },
];

const TYPE_LABEL: Partial<Record<EventType, string>> = {
  p1: '+1', p2: '+2', p3: '+3', m1: 'ratat liber', m2: 'ratat 2', m3: 'ratat 3', reb_o: 'rec. atac', reb_d: 'rec. apărare',
  ast: 'pasă decisivă', stl: 'furt', blk: 'capac', tov: 'pierdere', foul: 'fault', sub: 'schimbare',
  period_start: 'început sfert', period_end: 'final sfert',
};

function mmss(ms: number) {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function periodName(p: number) {
  return p > 4 ? `Prelungirea ${p - 4}` : `Sfertul ${p}`;
}

const TONE_STYLE = {
  score: { backgroundColor: 'var(--c-success-bg)', borderColor: 'var(--c-success-border)', color: 'var(--c-success-fg)' },
  foul: { backgroundColor: 'var(--c-danger-bg)', borderColor: 'var(--c-danger-border)', color: 'var(--c-danger-fg)' },
  plain: { backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-ink)' },
};

function ActionButton({ label, tone, onPress, big, a11y }: { label: string; tone: keyof typeof TONE_STYLE; onPress: () => void; big?: boolean; a11y?: string }) {
  const style = TONE_STYLE[tone];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      className={`ui-press rounded-[12px] border items-center justify-center ${big ? 'h-14' : 'h-12'}`}
      style={{ backgroundColor: style.backgroundColor, borderColor: style.borderColor } as any}
    >
      <Text className={`${big ? 'text-[18px]' : 'text-[14px]'} font-bold`} style={{ color: style.color }}>{label}</Text>
    </Pressable>
  );
}

export default function Scorer({
  eventId,
  game,
  serverEvents,
  teamName,
  onFinished,
}: {
  eventId: number;
  game: Game;
  serverEvents: GameEvent[];
  teamName: string;
  onFinished: () => void;
}) {
  const s = useScorer(eventId, game, serverEvents);
  const [selected, setSelected] = useState<Selection>(null);
  const [subOut, setSubOut] = useState<number | null>(null);
  const [subMode, setSubMode] = useState(false);
  const [showBox, setShowBox] = useState(false);
  const [confirm, setConfirm] = useState<'period' | 'finish' | null>(null);
  const [finishing, setFinishing] = useState(false);

  const opponentName = game.opponentName || 'Adversar';
  const rosterById = useMemo(() => new Map(game.roster.map((p) => [p.playerId, p])), [game.roster]);
  const period = s.clock.period;
  const fouls = s.box.teamFouls[period] ?? { us: 0, them: 0 };
  const timed = game.periodSec != null;
  const bench = game.roster.filter((p) => !s.box.onCourt.includes(p.playerId));

  // Keep the screen awake while scoring (where the browser supports it).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => undefined);
    return () => { void lock?.release().catch(() => undefined); };
  }, []);

  const record = (type: EventType) => {
    if (!selected) return;
    if (selected.side === 'us') s.add({ type, side: 'us', playerId: selected.playerId });
    else s.add({ type, side: 'them', oppNumber: selected.number });
    try { navigator.vibrate?.(12); } catch { /* not supported */ }
    setSelected(null);
  };

  const recordThem = (type: EventType) => {
    s.add({ type, side: 'them', oppNumber: selected?.side === 'them' ? selected.number : null });
    try { navigator.vibrate?.(12); } catch { /* not supported */ }
    setSelected(null);
  };

  const tapOnCourt = (playerId: number) => {
    if (subMode) {
      setSubOut(playerId);
      return;
    }
    setSelected((cur) => (cur?.side === 'us' && cur.playerId === playerId ? null : { side: 'us', playerId }));
  };

  const tapBench = (playerId: number) => {
    if (subOut == null) return;
    s.add({ type: 'sub', side: 'us', playerId, otherPlayerId: subOut });
    setSubOut(null);
    setSubMode(false);
  };

  const describe = (e: GameEvent) => {
    const who = e.side === 'us'
      ? e.playerId != null ? `#${rosterById.get(e.playerId)?.number ?? ''} ${rosterById.get(e.playerId)?.lastName ?? ''}`.trim() : teamName
      : e.oppNumber ? `${opponentName} #${e.oppNumber}` : opponentName;
    if (e.type === 'sub') {
      const out = e.otherPlayerId != null ? rosterById.get(e.otherPlayerId) : null;
      return `Schimbare: intră ${who}, iese #${out?.number ?? ''} ${out?.lastName ?? ''}`.trim();
    }
    if (e.type === 'period_start' || e.type === 'period_end') return `${TYPE_LABEL[e.type]} ${e.period}`;
    return `${who} ${TYPE_LABEL[e.type] ?? e.type}`;
  };
  const recent = s.events.filter((e) => !e.deleted && e.type !== 'period_start').slice(-4).reverse();

  const ourActions = game.mode === 'full' ? OUR_ACTIONS_FULL : OUR_ACTIONS_SIMPLE;
  const selectedPlayer = selected?.side === 'us' ? rosterById.get(selected.playerId) : null;
  const selectedFouledOut = selected?.side === 'us' && (s.box.players[selected.playerId]?.pf ?? 0) >= MAX_FOULS;

  const [finishError, setFinishError] = useState<string | null>(null);
  const finish = async () => {
    setFinishing(true);
    setFinishError(null);
    s.add({ type: 'period_end' });
    // Nothing may be left on the phone: the server closes the sheet for good.
    const left = await s.flush();
    setFinishing(false);
    if (left > 0) {
      setFinishError('Mai sunt acțiuni netrimise. Conectează-te la internet și apasă din nou „Încheie meciul”.');
      return;
    }
    onFinished();
  };

  return (
    <View className="gap-3 w-full max-w-[680px] self-center">
      {/* Scoreboard */}
      <View className="rounded-[16px] border p-3" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}>
        <View className="flex-row items-start gap-2">
          <View className="flex-1 items-center min-w-0">
            <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{teamName}</Text>
            <Text className="t-num text-[38px] font-bold leading-tight" style={{ color: 'var(--c-ink-strong)' }}>{s.box.us}</Text>
            <Text className="text-[11.5px] font-semibold" style={{ color: fouls.us >= BONUS_AT ? 'var(--c-danger-fg)' : 'var(--c-faint)' }}>
              {fouls.us} faulturi{fouls.us >= BONUS_AT ? ' · bonus' : ''}
            </Text>
          </View>
          <View className="items-center gap-1 pt-1">
            <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-muted)' }}>{periodName(period)}</Text>
            {timed ? (
              <Pressable
                onPress={s.toggleClock}
                accessibilityRole="button"
                accessibilityLabel={s.clock.running ? 'Oprește cronometrul' : 'Pornește cronometrul'}
                className="ui-press items-center rounded-[12px] px-3 py-1"
                style={{ backgroundColor: s.clock.running ? 'var(--c-success-bg)' : 'var(--c-surface-3)' }}
              >
                <Text className="t-num text-[24px] font-bold" style={{ color: s.clock.running ? 'var(--c-success-fg)' : 'var(--c-ink)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } as any}>
                  {mmss(s.remaining)}
                </Text>
                <View className="flex-row items-center gap-1">
                  <MaterialIcons name={s.clock.running ? 'pause' : 'play-arrow'} size={12} color={s.clock.running ? 'var(--c-success-fg)' : 'var(--c-muted)'} />
                  <Text className="text-[11px] font-bold" style={{ color: s.clock.running ? 'var(--c-success-fg)' : 'var(--c-muted)' }}>{s.clock.running ? 'Oprește' : 'Pornește'}</Text>
                </View>
              </Pressable>
            ) : null}
            <Pressable onPress={() => setConfirm('period')} accessibilityRole="button" className="ui-press h-8 px-2.5 rounded-[9px] border flex-row items-center gap-1" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}>
              <MaterialIcons name="skip-next" size={14} color="var(--c-ink-soft)" />
              <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>{period >= 4 ? 'Prelungire' : 'Sfertul următor'}</Text>
            </Pressable>
          </View>
          <View className="flex-1 items-center min-w-0">
            <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{opponentName}</Text>
            <Text className="t-num text-[38px] font-bold leading-tight" style={{ color: 'var(--c-ink-strong)' }}>{s.box.them}</Text>
            <Text className="text-[11.5px] font-semibold" style={{ color: fouls.them >= BONUS_AT ? 'var(--c-danger-fg)' : 'var(--c-faint)' }}>
              {fouls.them} faulturi{fouls.them >= BONUS_AT ? ' · bonus' : ''}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center justify-center gap-1.5 mt-2">
          {!s.online ? <MaterialIcons name="cloud-off" size={13} color="var(--c-warning-fg)" /> : s.syncing ? <ActivityIndicator size="small" color="var(--c-faint)" /> : null}
          <Text className="text-[11.5px] font-semibold" style={{ color: s.pendingCount ? 'var(--c-warning-fg)' : 'var(--c-faint)' }}>
            {s.pendingCount
              ? `${s.pendingCount} ${s.pendingCount === 1 ? 'acțiune salvată' : 'acțiuni salvate'} pe telefon${s.online ? ', se trimit…' : ' — se trimit când revine internetul'}`
              : 'Totul e salvat'}
          </Text>
        </View>
        {s.lastError && !s.pendingCount ? <Text className="text-[11.5px] text-center mt-1" style={{ color: 'var(--c-danger-fg)' }}>{s.lastError}</Text> : null}
      </View>

      {/* Opponent */}
      <View className="rounded-[14px] border p-3 gap-2" style={{ backgroundColor: 'var(--c-surface)', borderColor: selected?.side === 'them' ? 'var(--c-brand-fg)' : 'var(--c-border)' } as any}>
        <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-muted)' }}>
          {opponentName}{game.opponentRoster.length ? (selected?.side === 'them' && selected.number ? ` · #${selected.number}` : ' · alege numărul sau apasă direct') : ''}
        </Text>
        {game.opponentRoster.length ? (
          <View className="flex-row flex-wrap gap-1.5">
            {game.opponentRoster.map((o) => {
              const active = selected?.side === 'them' && selected.number === o.number;
              const pf = s.box.opponents[o.number]?.pf ?? 0;
              return (
                <Pressable key={o.number} onPress={() => setSelected(active ? null : { side: 'them', number: o.number })} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`${opponentName} #${o.number}${o.name ? ` ${o.name}` : ''}`}
                  className="h-10 min-w-[44px] px-2 rounded-[10px] border items-center justify-center"
                  style={{ borderColor: active ? 'var(--c-brand-fg)' : pf >= MAX_FOULS ? 'var(--c-danger)' : 'var(--c-border)', backgroundColor: active ? 'var(--c-surface-tint)' : 'var(--c-surface-2)' } as any}>
                  <Text className="t-num text-[14px] font-bold" style={{ color: 'var(--c-ink)' }}>#{o.number}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        <View className="grid grid-cols-4 gap-1.5">
          {THEIR_ACTIONS.map((a) => (
            <ActionButton key={a.type} label={a.label} a11y={`${opponentName} ${a.label}`} tone={a.type === 'foul' ? 'foul' : 'plain'} onPress={() => recordThem(a.type)} />
          ))}
        </View>
      </View>

      {/* Our five */}
      <View className="gap-2">
        <Text className="text-[12.5px] font-semibold px-0.5" style={{ color: subMode ? 'var(--c-brand-fg)' : 'var(--c-muted)' }}>
          {subMode
            ? subOut == null ? 'Schimbare: apasă cine iese' : 'Acum apasă cine intră (de pe bancă)'
            : selectedPlayer ? `Ce a făcut #${selectedPlayer.number} ${selectedPlayer.lastName}?` : '1. Apasă jucătorul · 2. Apasă ce a făcut'}
        </Text>
        <View className="grid grid-cols-5 gap-1.5">
          {s.box.onCourt.map((id) => {
            const p = rosterById.get(id);
            const line = s.box.players[id];
            const active = (selected?.side === 'us' && selected.playerId === id) || subOut === id;
            const out = (line?.pf ?? 0) >= MAX_FOULS;
            return (
              <Pressable key={id} onPress={() => tapOnCourt(id)} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`#${p?.number} ${p?.lastName}, ${line?.pts ?? 0} puncte, ${line?.pf ?? 0} faulturi`}
                className="ui-press rounded-[12px] border px-1 py-2 items-center gap-0.5"
                style={{
                  borderColor: active ? 'var(--c-brand-fg)' : out ? 'var(--c-danger)' : 'var(--c-border)',
                  backgroundColor: active ? 'var(--c-surface-tint)' : out ? 'var(--c-danger-bg)' : 'var(--c-surface)',
                  boxShadow: active ? 'inset 0 0 0 1px var(--c-brand-fg)' : 'none',
                } as any}>
                <Text className="t-num text-[19px] font-bold" style={{ color: active ? 'var(--c-brand-fg)' : 'var(--c-ink-strong)' }}>{p?.number ? `#${p.number}` : '—'}</Text>
                <Text className="text-[11px] font-semibold" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{p?.lastName ?? ''}</Text>
                <Text className="t-num text-[13px] font-bold" style={{ color: 'var(--c-ink)' }}>{line?.pts ?? 0}p</Text>
                <View className="flex-row gap-0.5">
                  {Array.from({ length: MAX_FOULS }).map((_, i) => (
                    <View key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: i < (line?.pf ?? 0) ? 'var(--c-danger)' : 'var(--c-border-strong)' }} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>

        {subMode && subOut != null ? (
          <View className="flex-row flex-wrap gap-1.5">
            {bench.map((p) => (
              <Pressable key={p.playerId} onPress={() => tapBench(p.playerId)} accessibilityRole="button" accessibilityLabel={`Intră #${p.number} ${p.lastName}`}
                className="ui-press h-11 px-3 rounded-[11px] border flex-row items-center gap-1.5"
                style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)', opacity: (s.box.players[p.playerId]?.pf ?? 0) >= MAX_FOULS ? 0.45 : 1 } as any}>
                <Text className="t-num text-[14px] font-bold" style={{ color: 'var(--c-ink)' }}>#{p.number}</Text>
                <Text className="text-[13px]" style={{ color: 'var(--c-ink-soft)' }}>{p.lastName}</Text>
              </Pressable>
            ))}
            {bench.length === 0 ? <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>Nu ai jucători pe bancă.</Text> : null}
          </View>
        ) : null}
      </View>

      {/* Actions for the selected player */}
      {selected?.side === 'us' ? (
        <View className="gap-1.5">
          {selectedFouledOut ? (
            <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-danger-fg)' }}>
              Are 5 faulturi — trebuie să iasă. Folosește „Schimbare”.
            </Text>
          ) : null}
          <View className={`grid ${game.mode === 'full' ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5`}>
            {ourActions.map((a) => (
              <ActionButton key={a.type} label={a.label} tone={a.tone} big={game.mode === 'simple'} onPress={() => record(a.type)} />
            ))}
          </View>
        </View>
      ) : null}

      <View className="flex-row gap-2">
        <Pressable onPress={() => { setSubMode((v) => !v); setSubOut(null); setSelected(null); }} accessibilityRole="button" accessibilityState={{ selected: subMode }}
          className="ui-press flex-1 h-11 rounded-[11px] border flex-row items-center justify-center gap-1.5"
          style={{ borderColor: subMode ? 'var(--c-brand-fg)' : 'var(--c-border)', backgroundColor: subMode ? 'var(--c-surface-tint)' : 'var(--c-surface)' } as any}>
          <MaterialIcons name="swap-horiz" size={16} color={subMode ? 'var(--c-brand-fg)' : 'var(--c-ink-soft)'} />
          <Text className="text-[13.5px] font-semibold" style={{ color: subMode ? 'var(--c-brand-fg)' : 'var(--c-ink)' }}>{subMode ? 'Renunță' : 'Schimbare'}</Text>
        </Pressable>
        <Pressable onPress={s.undo} accessibilityRole="button" accessibilityLabel="Anulează ultima acțiune"
          className="ui-press flex-1 h-11 rounded-[11px] border flex-row items-center justify-center gap-1.5"
          style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}>
          <MaterialIcons name="undo" size={16} color="var(--c-ink-soft)" />
          <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-ink)' }}>Anulează</Text>
        </Pressable>
      </View>

      {/* Recent actions */}
      <View className="rounded-[12px] px-3 py-2 gap-1" style={{ backgroundColor: 'var(--c-surface-2)' }}>
        {recent.length ? recent.map((e) => (
          <View key={e.clientId} className="flex-row items-center gap-2">
            <Text className="t-num text-[11.5px] w-[54px]" style={{ color: 'var(--c-faint)' }}>
              {e.period > 4 ? `P${e.period - 4}` : `S${e.period}`}{e.clockSec != null ? ` ${mmss(e.clockSec * 1000)}` : ''}
            </Text>
            <Text className="flex-1 text-[12.5px]" style={{ color: 'var(--c-ink-soft)' }} numberOfLines={1}>{describe(e)}</Text>
          </View>
        )) : <Text className="t-meta" style={{ color: 'var(--c-faint)' }}>Ultimele acțiuni apar aici.</Text>}
      </View>

      <View className="flex-row gap-2">
        <Pressable onPress={() => setShowBox((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showBox }}
          className="ui-press flex-1 h-11 rounded-[11px] border flex-row items-center justify-center gap-1.5" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}>
          <MaterialIcons name="leaderboard" size={16} color="var(--c-ink-soft)" />
          <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-ink)' }}>{showBox ? 'Ascunde fișa' : 'Fișa meciului'}</Text>
        </Pressable>
        <Pressable onPress={() => setConfirm('finish')} accessibilityRole="button"
          className="ui-press flex-1 h-11 rounded-[11px] border flex-row items-center justify-center gap-1.5" style={{ borderColor: 'var(--c-danger-border)', backgroundColor: 'var(--c-danger-bg)' } as any}>
          {finishing ? <ActivityIndicator size="small" color="var(--c-danger-fg)" /> : <MaterialIcons name="flag" size={16} color="var(--c-danger-fg)" />}
          <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-danger-fg)' }}>Încheie meciul</Text>
        </Pressable>
      </View>

      {finishError ? <Text className="text-[12.5px] font-semibold text-center" style={{ color: 'var(--c-danger-fg)' }}>{finishError}</Text> : null}

      {showBox ? (
        <BoxScoreView box={s.box} mode={game.mode} roster={game.roster} opponentRoster={game.opponentRoster} teamName={teamName} opponentName={opponentName} />
      ) : null}

      <ConfirmDialog
        visible={confirm != null}
        destructive={confirm === 'finish'}
        icon={confirm === 'finish' ? 'flag' : 'skip-next'}
        title={confirm === 'finish' ? 'Închei meciul?' : `Închei ${periodName(period).toLowerCase()}?`}
        message={confirm === 'finish'
          ? `Scor final ${teamName} ${s.box.us} – ${s.box.them} ${opponentName}. După încheiere, fișa rămâne de citit; acțiunile nu se mai pot modifica.`
          : 'Faulturile de echipă se resetează. Jucătorii de pe teren rămân aceiași.'}
        confirmLabel={confirm === 'finish' ? 'Încheie meciul' : 'Începe sfertul următor'}
        cancelLabel="Anulează"
        onConfirm={() => {
          const action = confirm;
          setConfirm(null);
          if (action === 'finish') void finish();
          else s.nextPeriod();
        }}
        onCancel={() => setConfirm(null)}
      />
    </View>
  );
}
