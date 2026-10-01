import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import type { Player } from '../../services/teamsApi';
import { L12_MAX_PLAYERS, L12_STAFF_ROLES, type L12Lineup, type L12Player, type L12StaffRole } from '../../services/l12Api';

/**
 * The L-12 sheet editor shared by the match screen and the team's "L12
 * constant" screen. Pure UI: the parent owns loading, saving and exporting.
 *
 * Layout: on wide screens the sheet (players, then staff) takes the main
 * column and the team roster sits beside it as the picker; phones stack the
 * roster under the players so the 12 chosen ones stay first.
 */

export const EMPTY_LINEUP: L12Lineup = { competition: null, gender: null, players: [], staff: {}, captainPlayerId: null };

export function sortLineupPlayers(players: L12Player[]) {
  return [...players].sort((a, b) => {
    const an = a.shirtNumber === '' ? 999 : Number(a.shirtNumber);
    const bn = b.shirtNumber === '' ? 999 : Number(b.shirtNumber);
    if (an !== bn) return an - bn;
    return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
  });
}

/** A lineup carried to another context (template → match): drop players no longer on the roster. */
export function lineupForRoster(lineup: L12Lineup, roster: Player[]): L12Lineup {
  const byId = new Map(roster.map((player) => [player.id, player]));
  const players = lineup.players
    .filter((player) => byId.has(player.playerId))
    .map((player) => ({ ...player, firstName: byId.get(player.playerId)!.firstName, lastName: byId.get(player.playerId)!.lastName }));
  const captainPlayerId = players.some((player) => player.playerId === lineup.captainPlayerId) ? lineup.captainPlayerId : null;
  return { ...lineup, players, captainPlayerId };
}

export function validateLineup(lineup: L12Lineup): string | null {
  if (lineup.players.length > L12_MAX_PLAYERS) return `Maxim ${L12_MAX_PLAYERS} jucători.`;
  const numbers = new Map<string, string>();
  for (const player of lineup.players) {
    if (player.shirtNumber && !/^\d{1,2}$/.test(player.shirtNumber)) return `Număr invalid la ${player.lastName} ${player.firstName}.`;
    if (player.shirtNumber && numbers.has(player.shirtNumber)) {
      return `Numărul ${player.shirtNumber} apare de două ori (${numbers.get(player.shirtNumber)}, ${player.lastName}).`;
    }
    if (player.shirtNumber) numbers.set(player.shirtNumber, player.lastName ?? '');
  }
  return null;
}

function Section({ title, meta, actions, children }: { title: string; meta?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <View
      className="rounded-[16px] border p-4 md:p-5"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
    >
      <View className="flex-row items-center gap-2 mb-3.5 min-w-0">
        <Text className="text-[15px] font-bold" style={{ color: 'var(--c-ink)' }}>{title}</Text>
        {meta ? <Text className="t-num text-[13px] font-semibold" style={{ color: 'var(--c-faint)' }}>{meta}</Text> : null}
        <View className="flex-1" />
        {actions}
      </View>
      {children}
    </View>
  );
}

function Field({
  value,
  onChange,
  placeholder,
  label,
  className,
  numeric,
  maxLength,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  className?: string;
  numeric?: boolean;
  maxLength?: number;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={(next: string) => onChange(numeric ? next.replace(/[^0-9]/g, '').slice(0, 2) : next)}
      placeholder={placeholder}
      placeholderTextColor="var(--c-faint)"
      accessibilityLabel={label}
      keyboardType={numeric ? 'number-pad' : undefined}
      maxLength={maxLength}
      className={`h-10 rounded-[10px] border px-3 text-[13.5px] font-medium outline-none min-w-0 ${numeric ? 't-num text-center' : ''} ${className ?? ''}`}
      style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-ink)' } as any}
    />
  );
}

function Toggle({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={'checkbox' as any}
      accessibilityState={{ checked } as any}
      accessibilityLabel={label}
      className="ui-press h-10 px-2.5 rounded-[10px] border flex-row items-center gap-1.5 shrink-0"
      style={{
        borderColor: checked ? 'var(--c-brand-fg)' : 'var(--c-border)',
        backgroundColor: checked ? 'var(--c-surface-tint)' : 'var(--c-surface-2)',
      } as any}
    >
      <MaterialIcons name={checked ? 'check-box' : 'check-box-outline-blank'} size={16} color={checked ? 'var(--c-brand-fg)' : 'var(--c-faint)'} />
      <Text className="text-[12.5px] font-semibold" style={{ color: checked ? 'var(--c-brand-fg)' : 'var(--c-muted)' }}>{label}</Text>
    </Pressable>
  );
}

function PlayerSheetRow({
  index,
  player,
  captain,
  onChange,
  onCaptain,
  onRemove,
}: {
  index: number;
  player: L12Player;
  captain: boolean;
  onChange: (patch: Partial<L12Player>) => void;
  onCaptain: () => void;
  onRemove: () => void;
}) {
  const name = `${player.lastName ?? ''} ${player.firstName ?? ''}`.trim();
  return (
    <View
      className="rounded-[12px] border p-2.5 flex-col 2xl:flex-row 2xl:items-center gap-2.5"
      style={{ borderColor: captain ? 'color-mix(in srgb, var(--c-warning) 55%, var(--c-border))' : 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}
    >
      <View className="flex-row items-center gap-2.5 min-w-0 2xl:w-[250px] 2xl:shrink-0">
        {/* Table number on the paper form: rows run 4–15. */}
        <View className="w-8 h-8 rounded-[9px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-3)' }} accessibilityLabel={`Rândul ${index + 4} din tabelă`}>
          <Text className="t-num text-[12.5px] font-bold" style={{ color: 'var(--c-muted)' }}>{index + 4}</Text>
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{name || 'Jucător'}</Text>
          {captain ? <Text className="text-[11.5px] font-bold" style={{ color: 'var(--c-warning-fg)' }}>Căpitan</Text> : null}
        </View>
        <Pressable
          onPress={onCaptain}
          accessibilityRole="button"
          accessibilityState={{ selected: captain }}
          accessibilityLabel={captain ? `Scoate căpitanul ${name}` : `Fă-l căpitan pe ${name}`}
          className="ui-press h-8 px-2 rounded-[9px] border flex-row items-center gap-1 shrink-0"
          style={{
            borderColor: captain ? 'var(--c-warning)' : 'var(--c-border)',
            backgroundColor: captain ? 'var(--c-warning-bg)' : 'var(--c-surface-2)',
          } as any}
        >
          <Text className="text-[12px] font-black" style={{ color: captain ? 'var(--c-warning-fg)' : 'var(--c-faint)' }}>C</Text>
        </Pressable>
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Scoate ${name} din L12`}
          className="ui-press w-8 h-8 rounded-[9px] items-center justify-center shrink-0"
        >
          <MaterialIcons name="close" size={17} color="var(--c-faint)" />
        </Pressable>
      </View>

      <View className="flex-row flex-wrap items-center gap-2 2xl:flex-1 2xl:flex-nowrap min-w-0">
        <View className="w-[64px] shrink-0">
          <Field label={`Număr echipament ${name}`} placeholder="Nr." numeric value={player.shirtNumber} onChange={(shirtNumber) => onChange({ shirtNumber })} className="w-full" />
        </View>
        <View className="flex-1 min-w-[120px]">
          <Field label={`Licență ${name}`} placeholder="Licență" maxLength={40} value={player.license} onChange={(license) => onChange({ license })} className="w-full" />
        </View>
        <View className="w-[96px] shrink-0">
          <Field label={`Cetățenie ${name}`} placeholder="Cetățenie" maxLength={40} value={player.citizenship} onChange={(citizenship) => onChange({ citizenship })} className="w-full" />
        </View>
        <Toggle label="U22/23" checked={player.u22} onPress={() => onChange({ u22: !player.u22 })} />
        <Toggle label="Natur." checked={player.naturalized} onPress={() => onChange({ naturalized: !player.naturalized })} />
      </View>
    </View>
  );
}

export default function L12Editor({
  lineup,
  onChange,
  roster,
  rosterLoading,
  showMatchDetails = true,
}: {
  lineup: L12Lineup;
  onChange: (next: L12Lineup) => void;
  roster: Player[];
  rosterLoading?: boolean;
  showMatchDetails?: boolean;
}) {
  const [rosterQuery, setRosterQuery] = useState('');
  const chosen = useMemo(() => new Set(lineup.players.map((player) => player.playerId)), [lineup.players]);
  const full = lineup.players.length >= L12_MAX_PLAYERS;

  const available = useMemo(() => {
    const query = rosterQuery.trim().toLowerCase();
    return roster
      .filter((player) => !chosen.has(player.id))
      .filter((player) => !query || `${player.firstName} ${player.lastName}`.toLowerCase().includes(query) || String(player.number ?? '').includes(query))
      .sort((a, b) => (a.number ?? 999) - (b.number ?? 999) || a.lastName.localeCompare(b.lastName));
  }, [roster, chosen, rosterQuery]);

  const usedNumbers = useMemo(() => new Set(lineup.players.map((player) => player.shirtNumber).filter(Boolean)), [lineup.players]);

  const addPlayer = (player: Player) => {
    if (full || chosen.has(player.id)) return;
    const number = player.number != null ? String(player.number) : '';
    const next: L12Player = {
      playerId: player.id,
      firstName: player.firstName,
      lastName: player.lastName,
      // A clash with a number already on the sheet is left blank to be filled, not duplicated.
      shirtNumber: number && !usedNumbers.has(number) ? number : '',
      license: '',
      u22: false,
      citizenship: 'ROU',
      naturalized: false,
    };
    onChange({ ...lineup, players: sortLineupPlayers([...lineup.players, next]) });
  };

  const patchPlayer = (playerId: number, patch: Partial<L12Player>) => {
    onChange({ ...lineup, players: lineup.players.map((player) => (player.playerId === playerId ? { ...player, ...patch } : player)) });
  };

  const removePlayer = (playerId: number) => {
    onChange({
      ...lineup,
      players: lineup.players.filter((player) => player.playerId !== playerId),
      captainPlayerId: lineup.captainPlayerId === playerId ? null : lineup.captainPlayerId,
    });
  };

  const setStaff = (role: L12StaffRole, patch: Partial<{ name: string; license: string }>) => {
    const current = lineup.staff[role] ?? { name: '', license: '' };
    onChange({ ...lineup, staff: { ...lineup.staff, [role]: { ...current, ...patch } } });
  };

  const rosterPanel = (
    <Section title="Lotul echipei" meta={rosterLoading ? undefined : `${available.length}`}>
      {roster.length > 6 ? (
        <View className="mb-2.5">
          <Field label="Caută în lot" placeholder="Caută jucător…" value={rosterQuery} onChange={setRosterQuery} className="w-full" />
        </View>
      ) : null}
      {rosterLoading ? (
        <View className="py-6 items-center"><ActivityIndicator color="var(--c-brand-fg)" /></View>
      ) : roster.length === 0 ? (
        <Text className="text-[13px]" style={{ color: 'var(--c-muted)' }}>Echipa nu are jucători în lot.</Text>
      ) : available.length === 0 ? (
        <Text className="text-[13px]" style={{ color: 'var(--c-muted)' }}>
          {rosterQuery.trim() ? 'Niciun jucător găsit.' : 'Toți jucătorii din lot sunt pe foaie.'}
        </Text>
      ) : (
        <View className="gap-1.5">
          {full ? (
            <Text className="text-[12.5px] font-semibold mb-1" style={{ color: 'var(--c-warning-fg)' }}>
              Foaia are deja 12 jucători. Scoate unul ca să adaugi altul.
            </Text>
          ) : null}
          {available.map((player) => (
            <Pressable
              key={player.id}
              onPress={() => addPlayer(player)}
              disabled={full}
              accessibilityRole="button"
              accessibilityLabel={`Adaugă ${player.firstName} ${player.lastName}`}
              className="ui-press h-11 rounded-[11px] border px-3 flex-row items-center gap-2.5"
              style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)', opacity: full ? 0.5 : 1 } as any}
            >
              <Text className="t-num w-7 text-[12.5px] font-bold" style={{ color: 'var(--c-muted)' }}>
                {player.number != null ? `#${player.number}` : '—'}
              </Text>
              <Text className="flex-1 text-[13.5px] font-semibold min-w-0" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
                {player.lastName} {player.firstName}
              </Text>
              <MaterialIcons name="add" size={18} color="var(--c-brand-fg)" />
            </Pressable>
          ))}
        </View>
      )}
    </Section>
  );

  return (
    <View className="flex-col xl:flex-row xl:items-start gap-4">
      <View className="flex-1 min-w-0 gap-4">
        {showMatchDetails ? (
          <Section title="Detalii joc">
            <View className="flex-col sm:flex-row gap-3">
              <View className="flex-1 min-w-0">
                <Text className="t-eyebrow mb-1.5" style={{ color: 'var(--c-faint)' }}>Competiția</Text>
                <Field
                  label="Competiția"
                  placeholder="Campionatul Național 2026/2027"
                  maxLength={255}
                  value={lineup.competition ?? ''}
                  onChange={(competition) => onChange({ ...lineup, competition })}
                  className="w-full"
                />
              </View>
              <View>
                <Text className="t-eyebrow mb-1.5" style={{ color: 'var(--c-faint)' }}>Categorie</Text>
                <View className="flex-row p-[3px] rounded-[11px]" style={{ backgroundColor: 'var(--c-surface-3)' }}>
                  {(['M', 'F'] as const).map((gender) => {
                    const active = lineup.gender === gender;
                    return (
                      <Pressable
                        key={gender}
                        onPress={() => onChange({ ...lineup, gender: active ? null : gender })}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={gender === 'M' ? 'Masculin' : 'Feminin'}
                        className="h-[34px] px-4 rounded-[8px] items-center justify-center"
                        style={{ backgroundColor: active ? 'var(--c-surface)' : 'transparent', boxShadow: active ? 'var(--e-sm)' : 'none' } as any}
                      >
                        <Text className="text-[13px] font-bold" style={{ color: active ? 'var(--c-ink)' : 'var(--c-muted)' }}>
                          {gender === 'M' ? 'Masculin' : 'Feminin'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          </Section>
        ) : null}

        <Section
          title="Jucători"
          meta={`${lineup.players.length}/${L12_MAX_PLAYERS}`}
          actions={lineup.players.length > 1 ? (
            <Pressable
              onPress={() => onChange({ ...lineup, players: sortLineupPlayers(lineup.players) })}
              accessibilityRole="button"
              className="ui-press h-8 px-2.5 rounded-[9px] flex-row items-center gap-1"
            >
              <MaterialIcons name="sort" size={15} color="var(--c-brand-fg)" />
              <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>După număr</Text>
            </Pressable>
          ) : null}
        >
          {lineup.players.length === 0 ? (
            <View className="rounded-[12px] border border-dashed px-4 py-6 items-center" style={{ borderColor: 'var(--c-border)' } as any}>
              <Text className="text-[13.5px] font-semibold text-center" style={{ color: 'var(--c-muted)' }}>
                Alege până la 12 jucători din lot.
              </Text>
              <Text className="text-[12.5px] mt-1 text-center" style={{ color: 'var(--c-faint)' }}>
                Apasă pe „C” ca să marchezi căpitanul.
              </Text>
            </View>
          ) : (
            <View className="gap-2">
              {lineup.players.map((player, index) => (
                <PlayerSheetRow
                  key={player.playerId}
                  index={index}
                  player={player}
                  captain={lineup.captainPlayerId === player.playerId}
                  onChange={(patch) => patchPlayer(player.playerId, patch)}
                  onCaptain={() => onChange({ ...lineup, captainPlayerId: lineup.captainPlayerId === player.playerId ? null : player.playerId })}
                  onRemove={() => removePlayer(player.playerId)}
                />
              ))}
            </View>
          )}
        </Section>

        {/* Phones: the picker sits right under the sheet it fills. */}
        <View className="xl:hidden">{rosterPanel}</View>

        <Section title="Staff tehnic">
          <View className="gap-2">
            {L12_STAFF_ROLES.map(({ key, label }) => {
              const entry = lineup.staff[key] ?? { name: '', license: '' };
              return (
                <View key={key} className="flex-col md:flex-row md:items-center gap-1.5 md:gap-3">
                  <Text className="text-[13px] font-semibold md:w-[150px] shrink-0" style={{ color: 'var(--c-ink-soft)' }}>
                    {label}{key === 'doctor' ? ' / kineto' : ''}
                  </Text>
                  <View className="flex-row gap-2 flex-1 min-w-0">
                    <View className="flex-1 min-w-0">
                      <Field label={`${label} — nume`} placeholder="Nume și prenume" maxLength={120} value={entry.name} onChange={(name) => setStaff(key, { name })} className="w-full" />
                    </View>
                    <View className="w-[110px] md:w-[150px] shrink-0">
                      <Field label={`${label} — licență`} placeholder="Licență" maxLength={40} value={entry.license} onChange={(license) => setStaff(key, { license })} className="w-full" />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </Section>
      </View>

      <View className="hidden xl:flex w-[340px] shrink-0 xl:sticky xl:top-4">{rosterPanel}</View>
    </View>
  );
}
