import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { gamesApi, type Game, type GamePayload, type OpponentEntry } from '../../services/gamesApi';
import type { GameMode } from '../../utils/gameStats';

/**
 * Before the tip-off: how detailed, who plays, who starts, the opponent, and
 * who keeps the sheet. Everything has a sensible default so a coach can press
 * Start after picking the five starters.
 */

const PERIOD_OPTIONS = [
  { label: '10 min', sec: 600 },
  { label: '8 min', sec: 480 },
  { label: '6 min', sec: 360 },
  { label: 'Fără cronometru', sec: null },
] as const;

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View className="rounded-[16px] border p-4 gap-3" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}>
      <View>
        <Text className="text-[15px] font-bold" style={{ color: 'var(--c-ink)' }}>{title}</Text>
        {hint ? <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function opponentFromTitle(title: string, teamName: string) {
  const parts = title.split(/\s+vs\.?\s+/i).map((p) => p.trim());
  if (parts.length !== 2) return '';
  const fold = (v: string) => v.toLowerCase().replace(/\s+/g, ' ');
  return fold(parts[0]) === fold(teamName) ? parts[1] : fold(parts[1]) === fold(teamName) ? parts[0] : parts[1];
}

export default function GameSetup({
  eventId,
  data,
  myUserId,
  onReady,
}: {
  eventId: number;
  data: GamePayload;
  myUserId: number | null;
  onReady: (game: Game) => void;
}) {
  const existing = data.game;
  const [mode, setMode] = useState<GameMode>(existing?.mode ?? 'simple');
  const [periodSec, setPeriodSec] = useState<number | null>(existing ? existing.periodSec : 600);
  const [roster, setRoster] = useState<number[]>(() =>
    existing?.roster.map((p) => p.playerId)
      ?? (data.lineup.some((p) => p.onL12) ? data.lineup.filter((p) => p.onL12) : data.lineup).slice(0, 15).map((p) => p.playerId));
  const [starters, setStarters] = useState<number[]>(existing?.starters ?? []);
  const [opponentName, setOpponentName] = useState(existing?.opponentName ?? opponentFromTitle(data.event.title, data.team.name));
  const [trackOpponents, setTrackOpponents] = useState((existing?.opponentRoster.length ?? 0) > 0);
  const [opponents, setOpponents] = useState<OpponentEntry[]>(existing?.opponentRoster ?? []);
  const [numbersInput, setNumbersInput] = useState('');
  const [keepers, setKeepers] = useState<{ id: number; name: string; role: string }[]>([]);
  const [keeper, setKeeper] = useState<number | null>(existing?.scorekeeperUserId ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    gamesApi.keepers(eventId).then(setKeepers).catch(() => setKeepers([]));
  }, [eventId]);

  const lineup = data.lineup;

  const toggleRoster = (id: number) => {
    setRoster((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
    setStarters((list) => list.filter((x) => x !== id));
  };

  const toggleStarter = (id: number) => {
    setStarters((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length >= 5 ? list : [...list, id]));
  };

  const addNumbers = () => {
    const numbers = numbersInput.split(/[\s,;]+/).map((n) => n.trim()).filter((n) => /^\d{1,2}$/.test(n));
    setOpponents((list) => {
      const known = new Set(list.map((o) => o.number));
      return [...list, ...numbers.filter((n) => !known.has(n) && known.add(n)).map((number) => ({ number, name: '' }))]
        .sort((a, b) => Number(a.number) - Number(b.number));
    });
    setNumbersInput('');
  };

  const start = async () => {
    if (roster.length < 5) return setError('Alege cel puțin 5 jucători pentru meci.');
    if (starters.length !== 5) return setError('Alege exact 5 jucători care încep (apasă pe „Titular”).');
    setSaving(true);
    setError(null);
    try {
      const game = await gamesApi.setup(eventId, {
        mode,
        periodSec: mode === 'full' ? periodSec : null,
        opponentName,
        opponentRoster: trackOpponents ? opponents : [],
        roster,
        starters,
        scorekeeperUserId: keeper && keeper !== myUserId ? keeper : null,
      });
      onReady(game);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut pregăti meciul.');
    } finally {
      setSaving(false);
    }
  };

  const modeCard = (key: GameMode, title: string, text: string, icon: string) => {
    const active = mode === key;
    return (
      <Pressable
        onPress={() => setMode(key)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        className="ui-press flex-1 min-w-[150px] rounded-[14px] border p-3.5 gap-1 text-left"
        style={{ borderColor: active ? 'var(--c-brand-fg)' : 'var(--c-border)', backgroundColor: active ? 'var(--c-surface-tint)' : 'var(--c-surface-2)', boxShadow: active ? 'inset 0 0 0 1px var(--c-brand-fg)' : 'none' } as any}
      >
        <View className="flex-row items-center gap-2">
          <MaterialIcons name={icon} size={18} color={active ? 'var(--c-brand-fg)' : 'var(--c-muted)'} />
          <Text className="text-[15px] font-bold" style={{ color: 'var(--c-ink)' }}>{title}</Text>
        </View>
        <Text className="text-[12.5px]" style={{ color: 'var(--c-muted)' }}>{text}</Text>
      </Pressable>
    );
  };

  return (
    <View className="gap-3 max-w-[760px] w-full">
      <Card title="Cum ții statistica?">
        <View className="flex-row flex-wrap gap-2">
          {modeCard('simple', 'Simplu', 'Puncte, faulturi și schimbări. Pentru oricine.', 'bolt')}
          {modeCard('full', 'Complet', 'Plus recuperări, pase, furturi, capace, pierderi, ratări și cronometru.', 'insights')}
        </View>
        {mode === 'full' ? (
          <View className="flex-row flex-wrap items-center gap-1.5">
            <Text className="text-[12.5px] font-semibold mr-1" style={{ color: 'var(--c-muted)' }}>Sfertul:</Text>
            {PERIOD_OPTIONS.map((option) => {
              const active = periodSec === option.sec;
              return (
                <Pressable key={option.label} onPress={() => setPeriodSec(option.sec)} accessibilityRole="button" accessibilityState={{ selected: active }}
                  className="h-8 px-3 rounded-[9px] border items-center justify-center"
                  style={{ borderColor: active ? 'transparent' : 'var(--c-border)', backgroundColor: active ? 'var(--c-brand-surface)' : 'var(--c-surface)' } as any}>
                  <Text className="text-[12.5px] font-semibold" style={{ color: active ? 'var(--c-on-brand)' : 'var(--c-ink-soft)' }}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </Card>

      <Card title={`Jucători · ${roster.length}`} hint={`Bifează cine joacă și alege cei 5 titulari (${starters.length}/5).`}>
        <View className="gap-1.5">
          {lineup.map((p) => {
            const playing = roster.includes(p.playerId);
            const starter = starters.includes(p.playerId);
            return (
              <View key={p.playerId} className="flex-row items-center gap-2.5 rounded-[11px] px-3 py-2" style={{ backgroundColor: playing ? 'var(--c-surface-2)' : 'transparent', opacity: playing ? 1 : 0.6 }}>
                <Pressable onPress={() => toggleRoster(p.playerId)} accessibilityRole={'checkbox' as any} accessibilityState={{ checked: playing } as any} accessibilityLabel={`${p.lastName} ${p.firstName} joacă`} className="flex-1 min-w-0 flex-row items-center gap-2.5 text-left">
                  <MaterialIcons name={playing ? 'check-box' : 'check-box-outline-blank'} size={18} color={playing ? 'var(--c-brand-fg)' : 'var(--c-faint)'} />
                  <Text className="t-num w-8 text-[13px] font-bold" style={{ color: 'var(--c-muted)' }}>{p.number ? `#${p.number}` : '—'}</Text>
                  <Text className="flex-1 text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{p.lastName} {p.firstName}</Text>
                </Pressable>
                {playing ? (
                  <Pressable onPress={() => toggleStarter(p.playerId)} accessibilityRole="button" accessibilityState={{ selected: starter }}
                    className="h-8 px-2.5 rounded-[9px] border items-center justify-center"
                    style={{ borderColor: starter ? 'var(--c-success)' : 'var(--c-border)', backgroundColor: starter ? 'var(--c-success-bg)' : 'var(--c-surface)', opacity: !starter && starters.length >= 5 ? 0.5 : 1 } as any}>
                    <Text className="text-[12px] font-bold" style={{ color: starter ? 'var(--c-success-fg)' : 'var(--c-muted)' }}>Titular</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
          {lineup.length === 0 ? <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>Echipa nu are jucători în lot.</Text> : null}
        </View>
      </Card>

      <Card title="Adversarul" hint="Implicit ții doar scorul și faulturile lor pe echipă.">
        <TextInput
          value={opponentName}
          onChangeText={setOpponentName}
          placeholder="Numele echipei adverse"
          placeholderTextColor="var(--c-faint)"
          accessibilityLabel="Numele echipei adverse"
          className="h-11 rounded-[10px] border px-3 text-[14px] font-medium outline-none"
          style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-ink)' } as any}
        />
        <Pressable onPress={() => setTrackOpponents((v) => !v)} accessibilityRole={'checkbox' as any} accessibilityState={{ checked: trackOpponents } as any} className="flex-row items-center gap-2 text-left">
          <MaterialIcons name={trackOpponents ? 'check-box' : 'check-box-outline-blank'} size={18} color={trackOpponents ? 'var(--c-brand-fg)' : 'var(--c-faint)'} />
          <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-ink)' }}>Țin punctele și faulturile pe jucătorii lor</Text>
        </Pressable>
        {trackOpponents ? (
          <View className="gap-2">
            <View className="flex-row gap-2">
              <TextInput
                value={numbersInput}
                onChangeText={setNumbersInput}
                onSubmitEditing={addNumbers}
                placeholder="Numere, ex. 4 7 9 12"
                placeholderTextColor="var(--c-faint)"
                accessibilityLabel="Numerele jucătorilor adverși"
                className="flex-1 h-10 rounded-[10px] border px-3 text-[14px] font-medium outline-none"
                style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-ink)' } as any}
              />
              <Pressable onPress={addNumbers} accessibilityRole="button" className="ui-press h-10 px-3.5 rounded-[10px] items-center justify-center" style={{ backgroundColor: 'var(--c-surface-3)' }}>
                <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-ink)' }}>Adaugă</Text>
              </Pressable>
            </View>
            {opponents.map((o) => (
              <View key={o.number} className="flex-row items-center gap-2">
                <Text className="t-num w-10 text-[14px] font-bold" style={{ color: 'var(--c-ink)' }}>#{o.number}</Text>
                <TextInput
                  value={o.name}
                  onChangeText={(name: string) => setOpponents((list) => list.map((x) => (x.number === o.number ? { ...x, name } : x)))}
                  placeholder="Nume (opțional)"
                  placeholderTextColor="var(--c-faint)"
                  accessibilityLabel={`Numele jucătorului advers #${o.number}`}
                  className="flex-1 h-9 rounded-[9px] border px-3 text-[13px] outline-none"
                  style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-ink)' } as any}
                />
                <Pressable onPress={() => setOpponents((list) => list.filter((x) => x.number !== o.number))} accessibilityRole="button" accessibilityLabel={`Scoate #${o.number}`} className="w-8 h-8 items-center justify-center">
                  <MaterialIcons name="close" size={16} color="var(--c-faint)" />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      <Card title="Cine ține statistica?" hint="Poți lăsa un antrenor secund, cineva din staff sau un părinte. Doar persoana aleasă (și staff-ul) poate introduce acțiuni.">
        <View className="flex-row flex-wrap gap-1.5">
          {[{ id: myUserId ?? -1, name: 'Eu', role: '' }, ...keepers.filter((k) => k.id !== myUserId)].map((person) => {
            const active = (keeper ?? myUserId) === person.id;
            return (
              <Pressable key={person.id} onPress={() => setKeeper(person.id === myUserId ? null : person.id)} accessibilityRole="button" accessibilityState={{ selected: active }}
                className="h-9 px-3 rounded-[10px] border items-center justify-center"
                style={{ borderColor: active ? 'transparent' : 'var(--c-border)', backgroundColor: active ? 'var(--c-brand-surface)' : 'var(--c-surface)' } as any}>
                <Text className="text-[13px] font-semibold" style={{ color: active ? 'var(--c-on-brand)' : 'var(--c-ink-soft)' }}>
                  {person.name}{person.role === 'parent' ? ' (părinte)' : person.role === 'staff' ? ' (staff)' : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {error ? <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-danger-fg)' }}>{error}</Text> : null}
      <Pressable
        onPress={start}
        disabled={saving}
        accessibilityRole="button"
        className="ui-press h-12 rounded-[12px] flex-row items-center justify-center gap-2"
        style={{ backgroundColor: 'var(--c-brand-surface)', opacity: saving ? 0.7 : 1 } as any}
      >
        {saving ? <ActivityIndicator size="small" color="var(--c-on-brand)" /> : <MaterialIcons name="sports-basketball" size={18} color="var(--c-on-brand)" />}
        <Text className="text-[15px] font-bold" style={{ color: 'var(--c-on-brand)' }}>
          {keeper && keeper !== myUserId ? 'Salvează și trimite statisticianului' : 'Începe meciul'}
        </Text>
      </Pressable>
    </View>
  );
}
