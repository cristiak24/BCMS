import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '../../context/AuthContext';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { contactsApi, type ContactsResponse, type PlayerContact, type PlayerContactUpdate, type StaffContact } from '../../services/contactsApi';
import { useHeader, DEFAULT_SEARCH_PLACEHOLDER } from '../HeaderContext';
import { usePathname } from '@/src/web/expoRouter';
import PageContainer from '../ui/PageContainer';
import PageHero from '../admin/PageHero';
import SelectField from '../ui/SelectField';
import Button from '../ui/Button';
import { DenseAvatar, DenseHeader, DenseHeading, DenseList, DenseRow } from '../ui/DenseList';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState, ErrorState } from '../ui/ScreenState';
import { ToastHost, useToasts } from '../ui/Toast';
import { getInitials } from '../coach/coachDisplay';
import { plural } from '../../utils/plural';
import GuardiansPanel from '../family/GuardiansPanel';

import { tr } from '../../i18n';
/**
 * Club contact book. One screen, two shapes decided by the server:
 *  - staff (admin/coach): every player's own number and up to two parents',
 *    editable inline, plus the staff list — "who do I call right now".
 *  - member (player/parent): the coaches' and admins' numbers, their own
 *    team's coaches first. They never see another family's number.
 */

const ROLE_LABEL: Record<string, string> = { coach: tr('Antrenor'), admin: tr('Administrator club') };

// Player cards shown at once. All 300 of a club were rendered together
// (~12,000 elements on a phone); the search still covers everyone.
const PAGE = 30;

/** Name/team text match, or a digits-only match so "0722 12" finds "0722-123-456". */
function matchesQuery(query: string, ...values: (string | null | undefined)[]) {
  if (!query) return true;
  const digits = query.replace(/\D/g, '');
  return values.some((value) => value && (
    value.toLowerCase().includes(query) || (digits.length >= 3 && value.replace(/\D/g, '').includes(digits))
  ));
}

/** Same rule as the server (lib/contacts.ts normalizePhone). Blank is fine. */
function isValidPhone(value: string | null) {
  const text = (value ?? '').trim();
  if (!text) return true;
  const digits = text.replace(/\D/g, '').length;
  return /^\+?[0-9 ().-]{6,32}$/.test(text) && digits >= 6 && digits <= 15;
}

function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

function PhoneLine({ label, name, phone, hint }: { label: string; name?: string | null; phone: string | null; hint?: string }) {
  return (
    <View className="flex-row items-center gap-3 min-w-0">
      <View className="flex-1 min-w-0">
        <Text className="text-[11.5px] font-semibold" style={{ color: 'var(--c-faint)' }} numberOfLines={1}>
          {label}{name ? ` · ${name}` : ''}{hint ? ` · ${hint}` : ''}
        </Text>
        <Text
          className="t-num text-[14.5px] font-semibold mt-0.5"
          style={{ color: phone ? 'var(--c-ink)' : 'var(--c-faint)', userSelect: 'text' } as any}
          numberOfLines={1}
        >
          {phone ?? tr('Fără număr')}
        </Text>
      </View>
      {phone ? (
        <Pressable
          onPress={() => { window.location.href = telHref(phone); }}
          accessibilityRole={'link' as any}
          accessibilityLabel={tr('Sună {0}: {phone}', { '0': name || label, phone })}
          className="ui-press h-9 px-3 rounded-[10px] flex-row items-center gap-1.5 shrink-0"
          style={{ backgroundColor: 'var(--c-success-bg)' }}
        >
          <MaterialIcons name="phone" size={15} color="var(--c-success-fg)" />
          <Text className="text-[12.5px] font-bold" style={{ color: 'var(--c-success-fg)' }}>{tr('Sună')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Admin rows: one number as a compact line (who · number · call icon), so every
 * row of the list keeps one height and the numbers share one column.
 */
function PhoneInline({ label, name, phone, hint }: { label: string; name?: string | null; phone: string; hint?: string }) {
  const who = `${label}${name ? ` · ${name}` : ''}${hint ? ` · ${hint}` : ''}`;
  return (
    <View className="flex-row items-center gap-2 min-w-0">
      <Text className="t-meta shrink min-w-0" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{who}</Text>
      <Text className="t-num text-[13.5px] font-semibold shrink-0" style={{ color: 'var(--c-ink)', userSelect: 'text' } as any}>{phone}</Text>
      <Pressable
        onPress={() => { window.location.href = telHref(phone); }}
        accessibilityRole={'link' as any}
        accessibilityLabel={tr('Sună {0}: {phone}', { '0': name || label, phone })}
        className="tap-40 ui-press w-7 h-7 rounded-[8px] border items-center justify-center shrink-0"
        style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}
      >
        <MaterialIcons name="phone" size={14} color="var(--c-success-fg)" />
      </Pressable>
    </View>
  );
}

function Field({ label, value, onChange, phone, placeholder }: { label: string; value: string; onChange: (v: string) => void; phone?: boolean; placeholder?: string }) {
  const invalid = phone && !isValidPhone(value);
  return (
    <View className="flex-1 min-w-0">
      <Text className="t-eyebrow mb-1" style={{ color: 'var(--c-faint)' }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor="var(--c-faint)"
        keyboardType={phone ? 'phone-pad' : undefined}
        maxLength={phone ? 32 : 120}
        className={`h-10 rounded-[10px] border px-3 text-[14px] font-medium outline-none w-full ${phone ? 't-num' : ''}`}
        style={{ backgroundColor: 'var(--c-surface-2)', borderColor: invalid ? 'var(--c-danger)' : 'var(--c-border)', color: 'var(--c-ink)' } as any}
      />
      {invalid ? <Text className="text-[11.5px] font-semibold mt-1" style={{ color: 'var(--c-danger-fg)' }}>{tr('Număr invalid')}</Text> : null}
    </View>
  );
}

function PlayerCard({
  player,
  teamNames,
  onSave,
  onNotify,
  readOnly = false,
  wide = false,
}: {
  player: PlayerContact;
  teamNames: string;
  onSave: (update: PlayerContactUpdate) => Promise<boolean>;
  onNotify: (toast: { variant: 'success' | 'error'; message: string }) => void;
  /** The accountant sees the numbers but does not edit them or manage parents. */
  readOnly?: boolean;
  /** Admin: name, numbers and actions on one line from md up (numbers in their own column). */
  wide?: boolean;
}) {
  // Editable lists carry one count of rows without a number above them; the
  // same sentence on every row repeated it (eleven times on a new club).
  const [editing, setEditing] = useState(false);
  const [family, setFamily] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<PlayerContactUpdate>(player);
  const set = (key: keyof PlayerContactUpdate) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const name = `${player.firstName} ${player.lastName}`.trim();
  const ownPhone = player.phone || player.accountPhone;
  const accounts = player.guardianAccounts ?? [];
  // Every line the row could show; the ones without a number fold into one
  // quiet „Fără număr: …” (a „Fără număr” per line made a wall of them).
  const lines: { key: string; label: string; name?: string | null; phone: string | null; hint?: string }[] = [
    { key: 'own', label: tr('Jucător'), phone: ownPhone ?? null, hint: !player.phone && player.accountPhone ? tr('din profil') : undefined },
    ...accounts.map((account) => ({ key: `account-${account.userId}`, label: tr('Părinte'), name: account.name, phone: account.phone ?? null, hint: 'cont' })),
    ...(player.guardianPhone || player.guardianName ? [{ key: 'g1', label: tr('Părinte 1'), name: player.guardianName, phone: player.guardianPhone ?? null }] : []),
    ...(player.guardian2Phone || player.guardian2Name ? [{ key: 'g2', label: tr('Părinte 2'), name: player.guardian2Name, phone: player.guardian2Phone ?? null }] : []),
  ];
  const withPhone = lines.filter((line) => line.phone);
  const missing = lines.filter((line) => !line.phone).map((line) => (line.name ? `${line.label} (${line.name})` : line.label));
  const invalid = ![draft.phone, draft.guardianPhone, draft.guardian2Phone].every(isValidPhone);

  const save = async () => {
    setSaving(true);
    const blank = (v: string | null) => (v && v.trim() ? v.trim() : null);
    const ok = await onSave({
      phone: blank(draft.phone),
      guardianName: blank(draft.guardianName),
      guardianPhone: blank(draft.guardianPhone),
      guardian2Name: blank(draft.guardian2Name),
      guardian2Phone: blank(draft.guardian2Phone),
    });
    setSaving(false);
    if (ok) setEditing(false);
  };

  return (
    <DenseRow stacked selected={editing}>
      <View className="flex-row items-center gap-3 min-w-0">
        <DenseAvatar initials={player.number != null ? `#${player.number}` : getInitials(player.firstName, player.lastName)} />
        <View className="flex-1 min-w-0">
          <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{name}</Text>
          <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{teamNames || tr('Fără echipă')}</Text>
        </View>
        {wide && !editing ? (
          <View className="hidden md:flex flex-[1.6] min-w-0 gap-1">
            {withPhone.length ? withPhone.map((line) => (
              <PhoneInline key={line.key} label={line.label} name={line.name} phone={line.phone as string} hint={line.hint} />
            )) : (
              <Text className="t-meta" style={{ color: 'var(--c-faint)' }}>{tr('Fără număr')}</Text>
            )}
            {withPhone.length && missing.length ? (
              <Text className="t-meta" style={{ color: 'var(--c-faint)' }} numberOfLines={1}>{tr('Fără număr: {0}', { '0': missing.join(', ') })}</Text>
            ) : null}
          </View>
        ) : null}
        {!editing && !readOnly ? (
          <Pressable
            onPress={() => setFamily((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: family }}
            accessibilityLabel={tr('Părinții cu cont ai lui {name}', { name })}
            className="tap-40 ui-press w-9 h-9 rounded-[10px] border items-center justify-center shrink-0"
            style={{ borderColor: family ? 'var(--c-brand-fg)' : 'var(--c-border)', backgroundColor: family ? 'var(--c-surface-tint)' : 'var(--c-surface-2)' } as any}
          >
            <MaterialIcons name="family-restroom" size={15} color={family ? 'var(--c-brand-fg)' : 'var(--c-ink-soft)'} />
          </Pressable>
        ) : null}
        {!editing && !readOnly ? (
          <Pressable
            onPress={() => { setDraft(player); setEditing(true); }}
            accessibilityRole="button"
            accessibilityLabel={tr('Editează contactele pentru {name}', { name })}
            className="tap-40 ui-press w-9 h-9 rounded-[10px] border items-center justify-center shrink-0"
            style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}
          >
            <MaterialIcons name="edit" size={15} color="var(--c-ink-soft)" />
          </Pressable>
        ) : null}
      </View>

      {editing ? (
        <View className="gap-3 md:pl-12">
          <Field label={tr('Telefon jucător')} phone value={draft.phone ?? ''} onChange={set('phone')} placeholder={player.accountPhone ?? tr('07xx xxx xxx')} />
          <View className="flex-row gap-2">
            <Field label={tr('Părinte 1')} value={draft.guardianName ?? ''} onChange={set('guardianName')} placeholder={tr('Nume')} />
            <Field label={tr('Telefon')} phone value={draft.guardianPhone ?? ''} onChange={set('guardianPhone')} placeholder="07xx xxx xxx" />
          </View>
          <View className="flex-row gap-2">
            <Field label={tr('Părinte 2')} value={draft.guardian2Name ?? ''} onChange={set('guardian2Name')} placeholder={tr('Nume')} />
            <Field label={tr('Telefon')} phone value={draft.guardian2Phone ?? ''} onChange={set('guardian2Phone')} placeholder="07xx xxx xxx" />
          </View>
          <View className="flex-row justify-end gap-2">
            <Pressable onPress={() => setEditing(false)} disabled={saving} accessibilityRole="button" className="ui-press h-10 px-4 rounded-[10px] items-center justify-center">
              <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-muted)' }}>{tr('Renunță')}</Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={saving || invalid}
              accessibilityRole="button"
              className="ui-press h-10 px-4 rounded-[10px] flex-row items-center gap-1.5"
              style={{ backgroundColor: 'var(--c-brand-surface)', opacity: saving || invalid ? 0.5 : 1 } as any}
            >
              {saving ? <ActivityIndicator size="small" color="var(--c-on-brand)" /> : <MaterialIcons name="save" size={15} color="var(--c-on-brand)" />}
              <Text className="text-[13.5px] font-bold" style={{ color: 'var(--c-on-brand)' }}>{tr('Salvează')}</Text>
            </Pressable>
          </View>
        </View>
      ) : withPhone.length ? (
        // Under the name, not behind a separator: these are the row's details.
        // Admin from md up: the numbers already sit in the row's own column.
        <View className={`gap-2.5 pl-12 ${wide ? 'md:hidden' : ''}`}>
          <View className="gap-2.5 md:flex-row md:flex-wrap md:gap-x-8">
            {withPhone.map((line) => <PhoneLine key={line.key} label={line.label} name={line.name} phone={line.phone} hint={line.hint} />)}
          </View>
          {missing.length ? (
            <Text className="t-meta" style={{ color: 'var(--c-faint)' }}>{tr('Fără număr: {0}', { '0': missing.join(', ') })}</Text>
          ) : null}
        </View>
      ) : readOnly ? (
        <Text className="t-meta pl-12" style={{ color: 'var(--c-faint)' }}>{tr('Niciun număr de telefon încă.')}</Text>
      ) : null}

      {family && !editing ? (
        <View className="md:pl-12">
          <GuardiansPanel bare playerId={player.id} playerName={`${player.firstName} ${player.lastName}`.trim()} onNotify={onNotify} />
        </View>
      ) : null}
    </DenseRow>
  );
}

function StaffCard({ person, showMissing, wide = false }: { person: StaffContact; showMissing?: boolean; wide?: boolean }) {
  return (
    <DenseRow stacked>
      <View className="flex-row items-center gap-3 min-w-0">
        <DenseAvatar initials={getInitials(person.name.split(' ')[0], person.name.split(' ').slice(1).join(' '))} />
        <View className="flex-1 min-w-0">
          <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{person.name}</Text>
          <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={2}>
            {[ROLE_LABEL[person.role] ?? person.role, person.teams.map((t) => t.name).join(', ')].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {wide ? (
          <View className="hidden md:flex flex-[1.6] min-w-0">
            {person.phone ? (
              <PhoneInline label={tr('Telefon')} phone={person.phone} />
            ) : (
              <Text className="t-meta" style={{ color: 'var(--c-faint)' }}>{showMissing ? tr('Fără număr — îl poate adăuga din Profil') : tr('Fără număr')}</Text>
            )}
          </View>
        ) : null}
      </View>
      {person.phone ? (
        <View className={`pl-12 ${wide ? 'md:hidden' : ''}`}><PhoneLine label={tr('Telefon')} phone={person.phone} name={null} /></View>
      ) : showMissing ? (
        <Text className={`t-meta pl-12 ${wide ? 'md:hidden' : ''}`} style={{ color: 'var(--c-faint)' }}>{tr('Fără număr — îl poate adăuga din Profil.')}</Text>
      ) : null}
    </DenseRow>
  );
}

export default function ContactsScreen() {
  // Admin: one-line rows with the numbers in their own column (other roles keep the stacked rows).
  const wide = usePathname().startsWith('/admin/');
  const isParentAccount = String(useSession().session?.role ?? '').toLowerCase() === 'parent';
  const { searchValue, setSearchPlaceholder, setSearchValue, setHeaderActions, setMobileFab } = useHeader();
  const { toasts, showToast, dismissToast } = useToasts();
  const [data, setData] = useState<ContactsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'players' | 'staff'>('players');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE);

  useEffect(() => {
    setSearchPlaceholder(tr('Caută după nume sau telefon…'));
    setHeaderActions(null);
    setMobileFab(null);
    return () => {
      setSearchPlaceholder(DEFAULT_SEARCH_PLACEHOLDER);
      setSearchValue('');
      setHeaderActions(null);
      setMobileFab(null);
    };
  }, [setHeaderActions, setMobileFab, setSearchPlaceholder, setSearchValue]);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await contactsApi.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('Nu am putut încărca agenda.'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const query = searchValue.trim().toLowerCase();

  const teamName = useMemo(() => new Map((data?.mode === 'staff' ? data.teams : []).map((t) => [t.id, t.name])), [data]);

  const players = useMemo(() => {
    if (data?.mode !== 'staff') return [];
    // By team, then by name — the list came in database order (#13, #5, #12…).
    const teamOf = (p: PlayerContact) => p.teamIds.map((id) => teamName.get(id)).filter(Boolean).sort((a, b) => a!.localeCompare(b!, 'ro'))[0] ?? '\uffff';
    return data.players
      .filter((p) =>
        (teamFilter === 'all' || p.teamIds.includes(Number(teamFilter)))
        && matchesQuery(query, `${p.firstName} ${p.lastName}`, `${p.lastName} ${p.firstName}`, p.phone, p.accountPhone, p.guardianName, p.guardianPhone, p.guardian2Name, p.guardian2Phone, p.number != null ? `#${p.number}` : null))
      .sort((a, b) => teamOf(a).localeCompare(teamOf(b), 'ro') || `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'ro'));
  }, [data, teamFilter, query, teamName]);

  useEffect(() => {
    setVisibleCount(PAGE);
  }, [teamFilter, query]);

  const staff = useMemo(
    () => (data?.staff ?? []).filter((s) => matchesQuery(query, s.name, s.phone, ...s.teams.map((t) => t.name))),
    [data, query],
  );

  const savePlayer = async (id: number, update: PlayerContactUpdate) => {
    try {
      const saved = await contactsApi.updatePlayer(id, update);
      setData((current) => current && current.mode === 'staff'
        ? { ...current, players: current.players.map((p) => (p.id === id ? { ...p, ...saved } : p)) }
        : current);
      showToast({ variant: 'success', message: tr('Contacte salvate.') });
      return true;
    } catch (err) {
      showToast({ variant: 'error', message: err instanceof Error ? err.message : tr('Nu am putut salva.') });
      return false;
    }
  };

  const isStaffView = data?.mode === 'staff';

  return (
    <View className="flex-1" style={{ backgroundColor: 'var(--c-bg)' }}>
      <ScrollView className="flex-1" contentContainerClassName="pb-32" showsVerticalScrollIndicator={false}>
        <PageContainer>
          <PageHero
            eyebrow={tr('Contacte')}
            title={tr('Contactele clubului')}
            subtitle={isStaffView || !data
              ? tr('Telefoanele jucătorilor, părinților și ale staff-ului, la o atingere distanță.')
              : tr('Antrenorii și administratorii clubului.')}
          >
            {data?.mode === 'staff' ? (
              <View className="flex-row p-[3px] rounded-[12px] sm:self-start" style={{ backgroundColor: 'var(--c-surface-3)' }} accessibilityRole={'tablist' as any}>
                {([['players', tr('Jucători și părinți'), data.players.length], ['staff', 'Staff', data.staff.length]] as const).map(([key, label, count]) => {
                  const active = tab === key;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => setTab(key)}
                      accessibilityRole={'tab' as any}
                      accessibilityState={{ selected: active }}
                      className="flex-1 sm:flex-none h-10 sm:px-5 rounded-[9px] flex-row items-center justify-center gap-1.5"
                      style={{ backgroundColor: active ? 'var(--c-surface)' : 'transparent', boxShadow: active ? 'var(--e-sm)' : 'none' } as any}
                    >
                      <Text className="text-[13.5px] font-semibold" style={{ color: active ? 'var(--c-ink)' : 'var(--c-muted)' }}>{label}</Text>
                      <Text className="t-num text-[12px] font-semibold" style={{ color: 'var(--c-faint)' }}>{count}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </PageHero>

          {error ? (
            <ErrorState title={tr('Nu am putut încărca agenda')} message={error} actionLabel={tr('Reîncearcă')} onAction={load} />
          ) : !data ? (
            <View className="gap-2" accessibilityRole="progressbar" accessibilityLabel={tr('Se încarcă agenda')}>
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-[12px]" />)}
            </View>
          ) : data.mode === 'member' ? (
            staff.length === 0 ? (
              <View className="rounded-[16px] border" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}>
                <EmptyState
                  icon="contacts"
                  title={query ? tr('Niciun contact găsit') : tr('Niciun număr încă')}
                  message={query ? tr('Nimic pentru „{0}”.', { '0': searchValue.trim() }) : tr('Niciun antrenor sau administrator al clubului nu și-a adăugat încă numărul de telefon în profil.')}
                />
              </View>
            ) : (
              <View className="gap-5">
                {staff.some((s) => s.ownTeam) ? (
                  <View>
                    <Text className="f-display text-[15px] font-bold mb-2.5" style={{ color: 'var(--c-ink-strong)' }}>{isParentAccount ? tr('Antrenorii echipei copilului') : tr('Antrenorii echipei tale')}</Text>
                    <DenseList label={isParentAccount ? tr('Antrenorii echipei copilului') : tr('Antrenorii echipei tale')}>
                      {staff.filter((s) => s.ownTeam).map((s) => <StaffCard key={s.id} person={s} />)}
                    </DenseList>
                  </View>
                ) : null}
                {staff.some((s) => !s.ownTeam) ? (
                  <View>
                    <Text className="f-display text-[15px] font-bold mb-2.5" style={{ color: 'var(--c-ink-strong)' }}>
                      {staff.some((s) => s.ownTeam) ? tr('Restul clubului') : tr('Staff-ul clubului')}
                    </Text>
                    <DenseList label={tr('Restul clubului')}>
                      {staff.filter((s) => !s.ownTeam).map((s) => <StaffCard key={s.id} person={s} />)}
                    </DenseList>
                  </View>
                ) : null}
              </View>
            )
          ) : (
            <>
              {tab === 'players' ? (
                <View className="gap-3">
                  {data.teams.length > 1 ? (
                    <SelectField
                      label={tr('Echipă')}
                      icon="groups"
                      className="w-full sm:w-[300px]"
                      value={teamFilter}
                      onChange={setTeamFilter}
                      options={[
                        { key: 'all', label: tr('Toate echipele'), count: data.players.length },
                        ...data.teams.map((t) => ({ key: String(t.id), label: t.name, count: data.players.filter((p) => p.teamIds.includes(t.id)).length })),
                      ]}
                    />
                  ) : null}
                  {/* One count instead of an „Adaugă numere” on every row without a number. */}
                  {(() => {
                    const missing = players.filter((p) => !(p.phone || p.accountPhone || p.guardianPhone || p.guardian2Phone || p.guardianAccounts?.some((account) => account.phone))).length;
                    return missing && !(data.mode === 'staff' && data.canEdit === false) ? (
                      <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>
                        {tr('{0} niciun număr de telefon. Îl adaugi cu butonul de editare din rândul lui.', { '0': plural(missing, 'jucător nu are', 'jucători nu au') })}
                      </Text>
                    ) : null;
                  })()}
                  {players.length === 0 ? (
                    <EmptyState
                      compact
                      icon={query ? 'search-off' : 'groups'}
                      title={query ? tr('Niciun jucător găsit') : tr('Niciun jucător')}
                      message={query ? tr('Nimic pentru „{0}”.', { '0': searchValue.trim() }) : tr('Jucătorii din loturile clubului apar aici.')}
                    />
                  ) : (
                    <DenseList
                      label={tr('Jucători')}
                      header={wide ? (
                        <DenseHeader>
                          <DenseHeading className="flex-1 pl-12">{tr('Jucător')}</DenseHeading>
                          <DenseHeading className="flex-[1.6]">{tr('Telefoane')}</DenseHeading>
                          {data.mode === 'staff' && data.canEdit === false ? null : <View className="w-[84px]" />}
                        </DenseHeader>
                      ) : undefined}
                    >
                      {players.slice(0, visibleCount).map((p) => (
                        <PlayerCard
                          wide={wide}
                          key={p.id}
                          player={p}
                          teamNames={p.teamIds.map((id) => teamName.get(id)).filter(Boolean).join(', ')}
                          onSave={(update) => savePlayer(p.id, update)}
                          onNotify={showToast}
                          readOnly={data.mode === 'staff' && data.canEdit === false}
                        />
                      ))}
                    </DenseList>
                  )}
                  {players.length > visibleCount ? (
                    <View className="items-center mt-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        label={tr('Arată încă {0} (din {1})', { '0': Math.min(PAGE, players.length - visibleCount), '1': players.length })}
                        onPress={() => setVisibleCount((count) => count + PAGE)}
                      />
                    </View>
                  ) : null}
                </View>
              ) : staff.length === 0 ? (
                <EmptyState compact icon="contacts" title={tr('Niciun membru al staff-ului')} message={query ? tr('Nimic pentru „{0}”.', { '0': searchValue.trim() }) : tr('Antrenorii și adminii clubului apar aici.')} />
              ) : (
                <DenseList
                  label={tr('Staff')}
                  header={wide ? (
                    <DenseHeader>
                      <DenseHeading className="flex-1 pl-12">{tr('Nume')}</DenseHeading>
                      <DenseHeading className="flex-[1.6]">{tr('Telefon')}</DenseHeading>
                    </DenseHeader>
                  ) : undefined}
                >
                  {staff.map((s) => <StaffCard key={s.id} person={s} showMissing wide={wide} />)}
                </DenseList>
              )}
            </>
          )}
        </PageContainer>
      </ScrollView>
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </View>
  );
}
