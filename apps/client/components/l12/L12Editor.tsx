import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import type { Player } from '../../services/teamsApi';
import { L12_MAX_PLAYERS, L12_STAFF_ROLES, type L12Lineup, type L12Player, type L12StaffRole } from '../../services/l12Api';
import { medicalStatus } from '../myclub/teamDisplay';
import { TeamAvatar } from './L12Visuals';

/**
 * The L-12 sheet editor shared by the match screen and the team's "L12
 * constant" screen. Pure UI: the parent owns loading, saving and exporting.
 *
 * Layout: the sheet (players, then staff) takes the main column; a right rail
 * holds the live "Verificare foaie" checklist and the roster picker. Phones
 * stack: checklist, players, roster, staff.
 *
 * The category (M/F) is never asked for: it is the team's (resolveTeamGender),
 * applied by the screens and shown in their header.
 */

export const EMPTY_LINEUP: L12Lineup = { competition: null, gender: null, players: [], staff: {}, captainPlayerId: null };

/** Basketball needs five on court; FRB sheets carry up to twelve. */
export const L12_MIN_PLAYERS = 5;

/** "U22/23" on the form: players turning 22 or younger this season. */
const U22_MAX_AGE = 22;

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

/** Hard errors only — things the federation form cannot carry. */
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

/**
 * Team category for the sheet: the team's own gender, else read from its name
 * ("U16 Feminin", "Fete U14"…). Never asked of the user.
 */
export function resolveTeamGender(team: { gender: 'M' | 'F' | null; name: string }): 'M' | 'F' | null {
  if (team.gender === 'M' || team.gender === 'F') return team.gender;
  const name = team.name.toLowerCase();
  if (/femin|fete|\bwomen\b|\bf\b/.test(name)) return 'F';
  if (/mascul|băieți|baieti|\bmen\b|\bm\b/.test(name)) return 'M';
  return null;
}

function ageThisYear(birthYear: number | null | undefined) {
  if (!birthYear || birthYear < 1900) return null;
  return new Date().getFullYear() - birthYear;
}

const isForeign = (player: L12Player) => {
  const c = player.citizenship.trim().toUpperCase();
  return c !== '' && c !== 'ROU' && c !== 'RO' && !player.naturalized;
};

// ─────────────────────────────────────────────────────────────
// Building blocks
// ─────────────────────────────────────────────────────────────

function Card({ title, meta, actions, children, padded = true }: { title: string; meta?: ReactNode; actions?: ReactNode; children: ReactNode; padded?: boolean }) {
  return (
    <View className="rounded-[14px] border overflow-hidden" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-xs)' } as any}>
      <View className="flex-row items-center gap-2 px-3.5 md:px-4 pt-3 pb-2.5 min-w-0">
        <Text className="f-display text-[14.5px] font-bold" style={{ color: 'var(--c-ink)' }}>{title}</Text>
        {meta}
        <View className="flex-1" />
        {actions}
      </View>
      <View className={padded ? 'px-3.5 md:px-4 pb-3.5 md:pb-4' : ''}>{children}</View>
    </View>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  label,
  numeric,
  maxLength,
  invalid,
  upper,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  numeric?: boolean;
  maxLength?: number;
  invalid?: boolean;
  upper?: boolean;
  className?: string;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={(next: string) => {
        let v = next;
        if (numeric) v = v.replace(/[^0-9]/g, '').slice(0, 2);
        if (upper) v = v.toUpperCase();
        onChange(v);
      }}
      placeholder={placeholder}
      placeholderTextColor="var(--c-faint)"
      accessibilityLabel={label}
      keyboardType={numeric ? 'number-pad' : undefined}
      maxLength={maxLength}
      className={`h-9 rounded-[9px] border px-2.5 text-[13.5px] font-medium outline-none min-w-0 w-full ${numeric ? 't-num text-center font-bold' : ''} ${className ?? ''}`}
      style={{
        backgroundColor: invalid ? 'var(--c-danger-bg)' : 'var(--c-surface-2)',
        borderColor: invalid ? 'var(--c-danger)' : 'var(--c-border)',
        color: invalid ? 'var(--c-danger-fg)' : 'var(--c-ink)',
      } as any}
    />
  );
}

function CheckToggle({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={'checkbox' as any}
      accessibilityState={{ checked } as any}
      accessibilityLabel={label}
      className="ui-press h-9 min-w-[44px] px-2 rounded-[9px] border flex-row items-center justify-center gap-1"
      style={{
        borderColor: checked ? 'var(--c-brand-border)' : 'var(--c-border)',
        backgroundColor: checked ? 'var(--c-surface-tint)' : 'transparent',
      } as any}
    >
      <MaterialIcons name={checked ? 'check-box' : 'check-box-outline-blank'} size={15} color={checked ? 'var(--c-brand-fg)' : 'var(--c-faint)'} />
    </Pressable>
  );
}

function CaptainToggle({ captain, onPress, name }: { captain: boolean; onPress: () => void; name: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: captain }}
      accessibilityLabel={captain ? `Scoate banderola lui ${name}` : `Căpitan: ${name}`}
      className="ui-press w-9 h-9 rounded-[9px] border items-center justify-center shrink-0"
      style={{
        borderColor: captain ? 'var(--c-warning)' : 'var(--c-border)',
        backgroundColor: captain ? 'var(--c-warning-bg)' : 'transparent',
      } as any}
    >
      <Text className="text-[13px] font-black" style={{ color: captain ? 'var(--c-warning-fg)' : 'var(--c-faint)' }}>C</Text>
    </Pressable>
  );
}

type RowFlags = { duplicate: boolean; noNumber: boolean; noLicense: boolean; visa: 'expired' | 'missing' | 'soon' | null; inactive: boolean };

function Flags({ flags }: { flags: RowFlags }) {
  const items: { label: string; tone: string }[] = [];
  if (flags.visa === 'expired') items.push({ label: 'Viză expirată', tone: 'var(--c-danger-fg)' });
  else if (flags.visa === 'missing') items.push({ label: 'Fără viză', tone: 'var(--c-warning-fg)' });
  else if (flags.visa === 'soon') items.push({ label: 'Viza expiră curând', tone: 'var(--c-warning-fg)' });
  if (flags.inactive) items.push({ label: 'Inactiv', tone: 'var(--c-muted)' });
  if (flags.duplicate) items.push({ label: 'Număr dublat', tone: 'var(--c-danger-fg)' });
  if (items.length === 0) return null;
  return (
    <Text className="text-[11.5px] font-semibold" numberOfLines={1}>
      {items.map((item, i) => (
        <Text key={item.label} style={{ color: item.tone }}>{i > 0 ? ' · ' : ''}{item.label}</Text>
      ))}
    </Text>
  );
}

function MiniToggle({ checked, onPress, label, text }: { checked: boolean; onPress: () => void; label: string; text: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={'checkbox' as any}
      accessibilityState={{ checked } as any}
      accessibilityLabel={label}
      className="ui-press h-7 px-2 rounded-full border flex-row items-center gap-1"
      style={{ borderColor: checked ? 'var(--c-brand-border)' : 'var(--c-border)', backgroundColor: checked ? 'var(--c-surface-tint)' : 'transparent' } as any}
    >
      <MaterialIcons name={checked ? 'check' : 'add'} size={13} color={checked ? 'var(--c-brand-fg)' : 'var(--c-faint)'} />
      <Text className="text-[11.5px] font-semibold" style={{ color: checked ? 'var(--c-brand-fg)' : 'var(--c-muted)' }}>{text}</Text>
    </Pressable>
  );
}

// Column widths shared by the header and the rows (md+).
const COL = { slot: 'w-8', number: 'w-[56px]', license: 'flex-1 min-w-[110px]', citizenship: 'w-[70px]', flag: 'w-[44px]', captain: 'w-9', remove: 'w-8' };

function SheetRow({
  index,
  player,
  captain,
  flags,
  onChange,
  onCaptain,
  onRemove,
}: {
  index: number;
  player: L12Player;
  captain: boolean;
  flags: RowFlags;
  onChange: (patch: Partial<L12Player>) => void;
  onCaptain: () => void;
  onRemove: () => void;
}) {
  const name = `${player.lastName ?? ''} ${player.firstName ?? ''}`.trim() || 'Jucător';
  const slot = (
    // Row number on the paper form: rows run 4–15.
    <View className={`${COL.slot} h-8 rounded-[8px] items-center justify-center shrink-0`} style={{ backgroundColor: 'var(--c-surface-3)' }} accessibilityLabel={`Rândul ${index + 4} din tabelă`}>
      <Text className="t-num text-[12px] font-bold" style={{ color: 'var(--c-muted)' }}>{index + 4}</Text>
    </View>
  );
  const nameBlock = (
    <View className="flex-1 min-w-0 flex-row items-center gap-2">
      <View className="md:hidden xl:flex"><TeamAvatar name={name} mine={captain} size={28} /></View>
      <View className="flex-1 min-w-0">
      <View className="flex-row items-center gap-1.5 min-w-0">
        <Text className="text-[14px] font-semibold shrink" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{name}</Text>
        {captain ? (
          <View className="rounded-[5px] px-1.5 py-[1px]" style={{ backgroundColor: 'var(--c-warning-bg)' }}>
            <Text className="text-[10.5px] font-bold" style={{ color: 'var(--c-warning-fg)' }}>Căpitan</Text>
          </View>
        ) : null}
      </View>
      <Flags flags={flags} />
      </View>
    </View>
  );
  const remove = (
    <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Scoate ${name} de pe foaie`} className={`ui-press ${COL.remove} h-8 rounded-[8px] items-center justify-center shrink-0 hover:bg-[var(--c-surface-3)]`}>
      <MaterialIcons name="close" size={17} color="var(--c-faint)" />
    </Pressable>
  );
  const number = <Input label={`Număr echipament ${name}`} placeholder="—" numeric value={player.shirtNumber} onChange={(shirtNumber) => onChange({ shirtNumber })} invalid={flags.duplicate} />;
  const license = <Input label={`Licență ${name}`} placeholder="Nr. licență" maxLength={40} value={player.license} onChange={(license) => onChange({ license })} />;
  const citizenship = <Input label={`Cetățenie ${name}`} placeholder="ROU" maxLength={3} upper value={player.citizenship} onChange={(citizenship) => onChange({ citizenship })} className="text-center" />;
  const u22 = <CheckToggle label={`U22/23: ${name}`} checked={player.u22} onPress={() => onChange({ u22: !player.u22 })} />;
  const nat = <CheckToggle label={`Naturalizat: ${name}`} checked={player.naturalized} onPress={() => onChange({ naturalized: !player.naturalized })} />;
  const cap = <CaptainToggle captain={captain} onPress={onCaptain} name={name} />;

  return (
    <View
      className="px-3 md:px-4 py-2.5"
      style={{ borderTopWidth: 1, borderTopColor: 'var(--c-border)', backgroundColor: captain ? 'color-mix(in srgb, var(--c-warning-bg) 45%, transparent)' : 'transparent' } as any}
    >
      {/* md+: one table row */}
      <View className="hidden md:flex flex-row items-center gap-2.5">
        {slot}
        <View className={`${COL.number} shrink-0`}>{number}</View>
        <View className="flex-[1.4] min-w-[140px]">{nameBlock}</View>
        <View className={COL.license}>{license}</View>
        <View className={`${COL.citizenship} shrink-0`}>{citizenship}</View>
        <View className={`${COL.flag} shrink-0 items-center`}>{u22}</View>
        <View className={`${COL.flag} shrink-0 items-center`}>{nat}</View>
        {cap}
        {remove}
      </View>

      {/* phones: identity line, then the fields */}
      <View className="md:hidden gap-2">
        <View className="flex-row items-center gap-2.5">
          {slot}
          {nameBlock}
          {cap}
          {remove}
        </View>
        <View className="flex-row items-center gap-2">
          <View className="w-[52px] shrink-0">{number}</View>
          <View className="flex-1 min-w-0">{license}</View>
          <View className="w-[58px] shrink-0">{citizenship}</View>
        </View>
        <View className="flex-row items-center gap-1.5">
          <MiniToggle text="U22/23" label={`U22/23: ${name}`} checked={player.u22} onPress={() => onChange({ u22: !player.u22 })} />
          <MiniToggle text="Naturalizat" label={`Naturalizat: ${name}`} checked={player.naturalized} onPress={() => onChange({ naturalized: !player.naturalized })} />
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Editor
// ─────────────────────────────────────────────────────────────

export default function L12Editor({
  lineup,
  onChange,
  roster,
  rosterLoading,
  showMatchDetails = true,
  known = [],
}: {
  lineup: L12Lineup;
  onChange: (next: L12Lineup) => void;
  roster: Player[];
  rosterLoading?: boolean;
  showMatchDetails?: boolean;
  /** Sheet rows seen before (L12 constant, saved sheet): licence/citizenship are reused when a player is added. */
  known?: L12Player[];
}) {
  const [rosterQuery, setRosterQuery] = useState('');
  const chosen = useMemo(() => new Set(lineup.players.map((player) => player.playerId)), [lineup.players]);
  const full = lineup.players.length >= L12_MAX_PLAYERS;
  const rosterById = useMemo(() => new Map(roster.map((p) => [p.id, p])), [roster]);
  const knownById = useMemo(() => new Map(known.map((p) => [p.playerId, p])), [known]);

  const available = useMemo(() => {
    const query = rosterQuery.trim().toLowerCase();
    return roster
      .filter((player) => !chosen.has(player.id))
      .filter((player) => !query || `${player.firstName} ${player.lastName}`.toLowerCase().includes(query) || String(player.number ?? '').includes(query))
      .sort((a, b) => (a.number ?? 999) - (b.number ?? 999) || a.lastName.localeCompare(b.lastName));
  }, [roster, chosen, rosterQuery]);

  const numberCounts = useMemo(() => {
    const counts = new Map<string, number>();
    lineup.players.forEach((p) => { if (p.shirtNumber) counts.set(p.shirtNumber, (counts.get(p.shirtNumber) ?? 0) + 1); });
    return counts;
  }, [lineup.players]);

  const flagsFor = (player: L12Player): RowFlags => {
    const r = rosterById.get(player.playerId);
    const visa = r ? medicalStatus(r.medicalCheckExpiry) : null;
    return {
      duplicate: Boolean(player.shirtNumber) && (numberCounts.get(player.shirtNumber) ?? 0) > 1,
      noNumber: !player.shirtNumber,
      noLicense: !player.license.trim(),
      visa: visa === 'valid' ? null : visa,
      inactive: Boolean(r?.status) && r!.status!.toLowerCase() !== 'active',
    };
  };

  const buildRow = (player: Player, taken: Set<string>): L12Player => {
    const prior = knownById.get(player.id);
    const number = prior?.shirtNumber || (player.number != null ? String(player.number) : '');
    const age = ageThisYear(player.birthYear);
    return {
      playerId: player.id,
      firstName: player.firstName,
      lastName: player.lastName,
      // A clash with a number already on the sheet is left blank to be filled, not duplicated.
      shirtNumber: number && !taken.has(number) ? number : '',
      license: prior?.license ?? '',
      u22: prior ? prior.u22 : age != null && age <= U22_MAX_AGE,
      citizenship: prior?.citizenship || 'ROU',
      naturalized: prior?.naturalized ?? false,
    };
  };

  const takenNumbers = () => new Set(lineup.players.map((p) => p.shirtNumber).filter(Boolean));

  const addPlayer = (player: Player) => {
    if (full || chosen.has(player.id)) return;
    onChange({ ...lineup, players: sortLineupPlayers([...lineup.players, buildRow(player, takenNumbers())]) });
  };

  // Fill the free slots: active players with a valid visa first, by number.
  const autoFill = () => {
    const free = L12_MAX_PLAYERS - lineup.players.length;
    if (free <= 0) return;
    const rank = (p: Player) => {
      const visa = medicalStatus(p.medicalCheckExpiry);
      const inactive = p.status && p.status.toLowerCase() !== 'active';
      return (inactive ? 2 : 0) + (visa === 'expired' ? 1 : 0);
    };
    const pool = roster
      .filter((p) => !chosen.has(p.id))
      .sort((a, b) => rank(a) - rank(b) || (a.number ?? 999) - (b.number ?? 999) || a.lastName.localeCompare(b.lastName))
      .slice(0, free);
    const taken = takenNumbers();
    const rows = pool.map((p) => {
      const row = buildRow(p, taken);
      if (row.shirtNumber) taken.add(row.shirtNumber);
      return row;
    });
    onChange({ ...lineup, players: sortLineupPlayers([...lineup.players, ...rows]) });
  };

  const clearSheet = () => onChange({ ...lineup, players: [], captainPlayerId: null });

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

  // ── Live checklist ──────────────────────────────────────────
  const rows = lineup.players.map((p) => ({ player: p, flags: flagsFor(p) }));
  const count = lineup.players.length;
  const missingNumbers = rows.filter((r) => r.flags.noNumber).length;
  const duplicates = rows.filter((r) => r.flags.duplicate).length;
  const missingLicenses = rows.filter((r) => r.flags.noLicense).length;
  const visaIssues = rows.filter((r) => r.flags.visa === 'expired' || r.flags.visa === 'missing');
  const headCoach = lineup.staff.headCoach?.name.trim();
  const u22Count = lineup.players.filter((p) => p.u22).length;
  const foreignCount = lineup.players.filter(isForeign).length;
  const naturalizedCount = lineup.players.filter((p) => p.naturalized).length;
  const staffFilled = L12_STAFF_ROLES.filter(({ key }) => lineup.staff[key]?.name.trim()).length;

  const checks: { key: string; ok: boolean; label: string; detail?: string; severity: 'error' | 'warn' }[] = [
    { key: 'count', ok: count >= L12_MIN_PLAYERS, severity: 'error', label: `${count}/${L12_MAX_PLAYERS} jucători`, detail: count < L12_MIN_PLAYERS ? `Minimum ${L12_MIN_PLAYERS} pentru joc` : undefined },
    { key: 'captain', ok: lineup.captainPlayerId != null, severity: 'warn', label: lineup.captainPlayerId != null ? 'Căpitan ales' : 'Niciun căpitan', detail: lineup.captainPlayerId != null ? undefined : 'Apasă „C” pe un rând' },
    {
      key: 'numbers',
      ok: count > 0 && missingNumbers === 0 && duplicates === 0,
      severity: 'error',
      label: count === 0 ? 'Numere de echipament' : duplicates > 0 ? 'Numere dublate' : missingNumbers > 0 ? `${missingNumbers} ${missingNumbers === 1 ? 'număr lipsă' : 'numere lipsă'}` : 'Numere complete',
      detail: count === 0 ? 'Se completează din lot' : duplicates > 0 ? 'Corectează rândurile marcate cu roșu' : undefined,
    },
    {
      key: 'licenses',
      ok: count > 0 && missingLicenses === 0,
      severity: 'warn',
      label: count === 0 ? 'Licențe' : missingLicenses > 0 ? `${missingLicenses} ${missingLicenses === 1 ? 'licență lipsă' : 'licențe lipsă'}` : 'Licențe complete',
    },
    { key: 'coach', ok: Boolean(headCoach), severity: 'warn', label: headCoach ? 'Antrenor principal' : 'Fără antrenor principal', detail: headCoach || undefined },
    { key: 'visa', ok: visaIssues.length === 0, severity: 'warn', label: visaIssues.length ? `${visaIssues.length} fără viză valabilă` : 'Vize medicale valabile', detail: visaIssues.slice(0, 2).map((r) => r.player.lastName).join(', ') || undefined },
  ];
  const passed = checks.filter((c) => c.ok).length;
  // Errors block a usable sheet; warnings only nag.
  const ready = checks.filter((c) => c.severity === 'error').every((c) => c.ok);

  // `compact` (phones): only what is still open, no counters.
  const renderChecklist = (compact: boolean) => (
    <Card
      title="Verificare foaie"
      meta={<Text className="t-num text-[13px] font-semibold" style={{ color: 'var(--c-faint)' }}>{passed}/{checks.length}</Text>}
      actions={(
        <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: ready ? (passed === checks.length ? 'var(--c-success-bg)' : 'var(--c-surface-tint)') : 'var(--c-danger-bg)' }}>
          <Text className="text-[11.5px] font-semibold" style={{ color: ready ? (passed === checks.length ? 'var(--c-success-fg)' : 'var(--c-brand-fg)') : 'var(--c-danger-fg)' }}>
            {!ready ? 'Incompletă' : passed === checks.length ? 'Gata de joc' : 'Se poate printa'}
          </Text>
        </View>
      )}
    >
      <View className="h-1.5 rounded-full overflow-hidden mb-3" style={{ backgroundColor: 'var(--c-surface-3)' }}>
        <View className="h-full rounded-full" style={{ width: `${(passed / checks.length) * 100}%`, backgroundColor: ready ? 'var(--c-success)' : 'var(--c-warning)', transition: 'width .25s ease' } as any} />
      </View>
      <View className="gap-2">
        {(compact ? checks.filter((c) => !c.ok) : checks).map((check) => (
          <View key={check.key} className="flex-row items-start gap-2.5">
            <MaterialIcons
              name={check.ok ? 'check-circle' : check.severity === 'error' ? 'error-outline' : 'warning-amber'}
              size={17}
              color={check.ok ? 'var(--c-success-fg)' : check.severity === 'error' ? 'var(--c-danger-fg)' : 'var(--c-warning-fg)'}
            />
            <View className="flex-1 min-w-0">
              <Text className="text-[13px] font-semibold" style={{ color: check.ok ? 'var(--c-ink-soft)' : 'var(--c-ink)' }} numberOfLines={1}>{check.label}</Text>
              {check.detail ? <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{check.detail}</Text> : null}
            </View>
          </View>
        ))}
      </View>
      {compact ? null : <View className="flex-row flex-wrap gap-1.5 mt-3.5 pt-3 border-t" style={{ borderColor: 'var(--c-border)' }}>
        {[
          { label: 'U22/23', value: u22Count },
          { label: 'Străini', value: foreignCount },
          { label: 'Naturalizați', value: naturalizedCount },
          { label: 'Staff', value: staffFilled },
        ].map((chip) => (
          <View key={chip.label} className="flex-row items-center gap-1 rounded-[8px] px-2 py-1" style={{ backgroundColor: 'var(--c-surface-2)' }}>
            <Text className="text-[11.5px] font-medium" style={{ color: 'var(--c-muted)' }}>{chip.label}</Text>
            <Text className="t-num text-[12px] font-bold" style={{ color: 'var(--c-ink)' }}>{chip.value}</Text>
          </View>
        ))}
      </View>}
    </Card>
  );

  const rosterPanel = (
    <Card
      title="Lotul echipei"
      meta={rosterLoading ? undefined : <Text className="t-num text-[13px] font-semibold" style={{ color: 'var(--c-faint)' }}>{available.length}</Text>}
      actions={!rosterLoading && !full && roster.some((p) => !chosen.has(p.id)) ? (
        <Pressable onPress={autoFill} accessibilityRole="button" className="ui-press h-8 px-2.5 rounded-[9px] flex-row items-center gap-1" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
          <MaterialIcons name="auto-awesome" size={14} color="var(--c-brand-fg)" />
          <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Completează automat</Text>
        </Pressable>
      ) : null}
    >
      {roster.length > 6 ? (
        <View className="mb-2.5">
          <Input label="Caută în lot" placeholder="Caută după nume sau număr…" value={rosterQuery} onChange={setRosterQuery} />
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
        <View className="gap-1">
          {full ? (
            <Text className="text-[12.5px] font-semibold mb-1.5" style={{ color: 'var(--c-warning-fg)' }}>
              Foaia e plină (12). Scoate un jucător ca să adaugi altul.
            </Text>
          ) : null}
          {available.map((player) => {
            const visa = medicalStatus(player.medicalCheckExpiry);
            const inactive = Boolean(player.status) && player.status!.toLowerCase() !== 'active';
            const note = inactive ? 'Inactiv' : visa === 'expired' ? 'Viză expirată' : visa === 'missing' ? 'Fără viză' : player.position;
            const noteTone = inactive ? 'var(--c-muted)' : visa === 'expired' ? 'var(--c-danger-fg)' : visa === 'missing' ? 'var(--c-warning-fg)' : 'var(--c-muted)';
            return (
              <Pressable
                key={player.id}
                onPress={() => addPlayer(player)}
                disabled={full}
                accessibilityRole="button"
                accessibilityLabel={`Adaugă ${player.firstName} ${player.lastName}`}
                className="ui-press rounded-[10px] px-2.5 py-2 flex-row items-center gap-2.5 hover:bg-[var(--c-surface-2)] text-left"
                style={{ opacity: full ? 0.45 : 1 } as any}
              >
                <View className="w-8 h-8 rounded-full items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-3)' }}>
                  <Text className="f-display t-num text-[12px] font-bold" style={{ color: 'var(--c-ink-soft)' }}>{player.number ?? '—'}</Text>
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{player.lastName} {player.firstName}</Text>
                  {note ? <Text className="t-meta" style={{ color: noteTone }} numberOfLines={1}>{note}</Text> : null}
                </View>
                <View className="w-7 h-7 rounded-full items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                  <MaterialIcons name="add" size={17} color="var(--c-brand-fg)" />
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Card>
  );

  const emptySlots = Math.max(0, L12_MAX_PLAYERS - count);

  return (
    <View className="flex-col 2xl:flex-row 2xl:items-start gap-4">
      <View className="flex-1 min-w-0 gap-4">
        {/* Phones/tablets: the checklist comes first — it says what is left. */}
        <View className="2xl:hidden">{renderChecklist(true)}</View>

        {showMatchDetails ? (
          <Card title="Detalii joc">
            <View>
              <View className="min-w-0">
                <Text className="text-[12.5px] font-semibold mb-1.5" style={{ color: 'var(--c-ink-soft)' }}>Competiția</Text>
                <Input
                  label="Competiția"
                  placeholder="Campionatul Național 2026/2027"
                  maxLength={255}
                  value={lineup.competition ?? ''}
                  onChange={(competition) => onChange({ ...lineup, competition })}
                />
              </View>
            </View>
          </Card>
        ) : null}

        <Card
          title="Jucători"
          padded={false}
          meta={<Text className="t-num text-[13px] font-semibold" style={{ color: count > L12_MAX_PLAYERS ? 'var(--c-danger-fg)' : 'var(--c-faint)' }}>{count}/{L12_MAX_PLAYERS}</Text>}
          actions={count > 0 ? (
            <View className="flex-row items-center gap-1">
              {count > 1 ? (
                <Pressable onPress={() => onChange({ ...lineup, players: sortLineupPlayers(lineup.players) })} accessibilityRole="button" className="ui-press h-8 px-2 rounded-[9px] flex-row items-center gap-1 hover:bg-[var(--c-surface-2)]">
                  <MaterialIcons name="sort" size={15} color="var(--c-brand-fg)" />
                  <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Ordonează</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={clearSheet} accessibilityRole="button" className="ui-press h-8 px-2 rounded-[9px] flex-row items-center gap-1 hover:bg-[var(--c-surface-2)]">
                <MaterialIcons name="delete-outline" size={15} color="var(--c-muted)" />
                <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-muted)' }}>Golește</Text>
              </Pressable>
            </View>
          ) : null}
        >
          {count > 0 ? (
            <>
              <View className="hidden md:flex flex-row items-center gap-2.5 px-4 py-2" style={{ backgroundColor: 'var(--c-surface-2)', borderTopWidth: 1, borderTopColor: 'var(--c-border)' } as any}>
                <Text className={`t-eyebrow ${COL.slot} text-center`} style={{ color: 'var(--c-faint)' }}>#</Text>
                <Text className={`t-eyebrow ${COL.number} text-center`} style={{ color: 'var(--c-faint)' }}>Nr.</Text>
                <Text className="t-eyebrow flex-[1.4] min-w-[140px]" style={{ color: 'var(--c-faint)' }}>Jucător</Text>
                <Text className={`t-eyebrow ${COL.license}`} style={{ color: 'var(--c-faint)' }}>Licență</Text>
                <Text className={`t-eyebrow ${COL.citizenship} text-center`} style={{ color: 'var(--c-faint)' }}>Cetăț.</Text>
                <Text className={`t-eyebrow ${COL.flag} text-center`} style={{ color: 'var(--c-faint)' }}>U22</Text>
                <Text className={`t-eyebrow ${COL.flag} text-center`} style={{ color: 'var(--c-faint)' }}>Nat.</Text>
                <Text className={`t-eyebrow ${COL.captain} text-center`} style={{ color: 'var(--c-faint)' }}>Căp.</Text>
                <View className={COL.remove} />
              </View>
              {rows.map(({ player, flags }, index) => (
                <SheetRow
                  key={player.playerId}
                  index={index}
                  player={player}
                  captain={lineup.captainPlayerId === player.playerId}
                  flags={flags}
                  onChange={(patch) => patchPlayer(player.playerId, patch)}
                  onCaptain={() => onChange({ ...lineup, captainPlayerId: lineup.captainPlayerId === player.playerId ? null : player.playerId })}
                  onRemove={() => removePlayer(player.playerId)}
                />
              ))}
            </>
          ) : null}
          {emptySlots > 0 ? (
            <View className="px-3 md:px-4 py-3" style={{ borderTopWidth: count > 0 ? 1 : 0, borderTopColor: 'var(--c-border)' } as any}>
              <View className="rounded-[12px] border border-dashed px-3.5 py-3 flex-row items-center gap-3" style={{ borderColor: 'var(--c-border-strong)' } as any}>
                <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                  <MaterialIcons name="person-add" size={18} color="var(--c-brand-fg)" />
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-ink)' }}>
                    {count === 0 ? 'Hai să alegem jucătorii' : `${emptySlots} ${emptySlots === 1 ? 'loc liber' : 'locuri libere'}`}
                  </Text>
                  <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>
                    {count === 0 ? 'Apasă pe cei din lot sau lasă „Completează automat” să o facă.' : 'Adaugă din lotul echipei.'}
                  </Text>
                </View>
                {!rosterLoading && roster.some((p) => !chosen.has(p.id)) ? (
                  <Pressable onPress={autoFill} accessibilityRole="button" className="ui-press h-9 px-3 rounded-[10px] flex-row items-center gap-1.5 shrink-0" style={{ backgroundColor: 'var(--c-brand-surface)' }}>
                    <MaterialIcons name="auto-awesome" size={15} color="var(--c-on-brand)" />
                    <Text className="text-[12.5px] font-semibold hidden sm:flex" style={{ color: 'var(--c-on-brand)' }}>Completează</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
        </Card>

        {/* Phones/tablets: the picker sits right under the sheet it fills. */}
        <View className="2xl:hidden">{rosterPanel}</View>

        <Card title="Staff tehnic" meta={<Text className="t-num text-[13px] font-semibold" style={{ color: 'var(--c-faint)' }}>{staffFilled}/{L12_STAFF_ROLES.length}</Text>}>
          <View className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-3">
            {L12_STAFF_ROLES.map(({ key, label }) => {
              const entry = lineup.staff[key] ?? { name: '', license: '' };
              const required = key === 'headCoach';
              return (
                <View key={key} className="min-w-0">
                  <Text className="text-[12.5px] font-semibold mb-1.5" style={{ color: 'var(--c-ink-soft)' }}>
                    {label}{key === 'doctor' ? ' / kineto' : ''}
                    {required ? <Text style={{ color: 'var(--c-danger-fg)' }}> *</Text> : null}
                  </Text>
                  <View className="flex-row gap-2">
                    <View className="flex-1 min-w-0">
                      <Input label={`${label} — nume`} placeholder="Nume și prenume" maxLength={120} value={entry.name} onChange={(name) => setStaff(key, { name })} />
                    </View>
                    <View className="w-[112px] shrink-0">
                      <Input label={`${label} — licență`} placeholder="Licență" maxLength={40} value={entry.license} onChange={(license) => setStaff(key, { license })} />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </Card>
      </View>

      <View className="hidden 2xl:flex w-[340px] shrink-0 gap-4 2xl:sticky 2xl:top-4">
        {renderChecklist(false)}
        {rosterPanel}
      </View>
    </View>
  );
}
