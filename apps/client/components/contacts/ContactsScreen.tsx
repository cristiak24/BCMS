import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { contactsApi, type ContactsResponse, type PlayerContact, type PlayerContactUpdate, type StaffContact } from '../../services/contactsApi';
import { useHeader, DEFAULT_SEARCH_PLACEHOLDER } from '../HeaderContext';
import PageContainer from '../ui/PageContainer';
import PageHeader from '../ui/PageHeader';
import SelectField from '../ui/SelectField';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState, ErrorState } from '../ui/ScreenState';
import { ToastHost, useToasts } from '../ui/Toast';
import { getInitials } from '../coach/coachDisplay';
import GuardiansPanel from '../family/GuardiansPanel';

/**
 * Club contact book. One screen, two shapes decided by the server:
 *  - staff (admin/coach): every player's own number and up to two parents',
 *    editable inline, plus the staff list — "who do I call right now".
 *  - member (player/parent): the coaches' and admins' numbers, their own
 *    team's coaches first. They never see another family's number.
 */

const ROLE_LABEL: Record<string, string> = { coach: 'Antrenor', admin: 'Administrator club' };

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
          {phone ?? 'Fără număr'}
        </Text>
      </View>
      {phone ? (
        <Pressable
          onPress={() => { window.location.href = telHref(phone); }}
          accessibilityRole={'link' as any}
          accessibilityLabel={`Sună ${name || label}: ${phone}`}
          className="ui-press h-9 px-3 rounded-[10px] flex-row items-center gap-1.5 shrink-0"
          style={{ backgroundColor: 'var(--c-success-bg)' }}
        >
          <MaterialIcons name="phone" size={15} color="var(--c-success-fg)" />
          <Text className="text-[12.5px] font-bold" style={{ color: 'var(--c-success-fg)' }}>Sună</Text>
        </Pressable>
      ) : null}
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
      {invalid ? <Text className="text-[11.5px] font-semibold mt-1" style={{ color: 'var(--c-danger-fg)' }}>Număr invalid</Text> : null}
    </View>
  );
}

function PlayerCard({
  player,
  teamNames,
  onSave,
  onNotify,
}: {
  player: PlayerContact;
  teamNames: string;
  onSave: (update: PlayerContactUpdate) => Promise<boolean>;
  onNotify: (toast: { variant: 'success' | 'error'; message: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [family, setFamily] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<PlayerContactUpdate>(player);
  const set = (key: keyof PlayerContactUpdate) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const name = `${player.lastName} ${player.firstName}`.trim();
  const ownPhone = player.phone || player.accountPhone;
  const accounts = player.guardianAccounts ?? [];
  const hasAny = Boolean(ownPhone || player.guardianPhone || player.guardian2Phone || accounts.length);
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
    <View
      className="rounded-[14px] border p-4 gap-3 min-w-0"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: editing ? 'var(--c-brand-fg)' : 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
    >
      <View className="flex-row items-center gap-3 min-w-0">
        <View className="h-10 w-10 rounded-full items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
          <Text className="text-[12.5px] font-bold" style={{ color: 'var(--c-brand-fg)' }}>
            {player.number != null ? `#${player.number}` : getInitials(player.firstName, player.lastName)}
          </Text>
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-[15px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{name}</Text>
          <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{teamNames || 'Fără echipă'}</Text>
        </View>
        {!editing ? (
          <Pressable
            onPress={() => setFamily((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: family }}
            accessibilityLabel={`Părinții cu cont ai lui ${name}`}
            className="ui-press w-9 h-9 rounded-[10px] border items-center justify-center shrink-0"
            style={{ borderColor: family ? 'var(--c-brand-fg)' : 'var(--c-border)', backgroundColor: family ? 'var(--c-surface-tint)' : 'var(--c-surface-2)' } as any}
          >
            <MaterialIcons name="family-restroom" size={15} color={family ? 'var(--c-brand-fg)' : 'var(--c-ink-soft)'} />
          </Pressable>
        ) : null}
        {!editing ? (
          <Pressable
            onPress={() => { setDraft(player); setEditing(true); }}
            accessibilityRole="button"
            accessibilityLabel={`Editează contactele pentru ${name}`}
            className="ui-press w-9 h-9 rounded-[10px] border items-center justify-center shrink-0"
            style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}
          >
            <MaterialIcons name="edit" size={15} color="var(--c-ink-soft)" />
          </Pressable>
        ) : null}
      </View>

      {editing ? (
        <View className="gap-3">
          <Field label="Telefon jucător" phone value={draft.phone ?? ''} onChange={set('phone')} placeholder={player.accountPhone ?? '07xx xxx xxx'} />
          <View className="flex-row gap-2">
            <Field label="Părinte 1" value={draft.guardianName ?? ''} onChange={set('guardianName')} placeholder="Nume" />
            <Field label="Telefon" phone value={draft.guardianPhone ?? ''} onChange={set('guardianPhone')} placeholder="07xx xxx xxx" />
          </View>
          <View className="flex-row gap-2">
            <Field label="Părinte 2" value={draft.guardian2Name ?? ''} onChange={set('guardian2Name')} placeholder="Nume" />
            <Field label="Telefon" phone value={draft.guardian2Phone ?? ''} onChange={set('guardian2Phone')} placeholder="07xx xxx xxx" />
          </View>
          <View className="flex-row justify-end gap-2">
            <Pressable onPress={() => setEditing(false)} disabled={saving} accessibilityRole="button" className="ui-press h-10 px-4 rounded-[10px] items-center justify-center">
              <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-muted)' }}>Anulează</Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={saving || invalid}
              accessibilityRole="button"
              className="ui-press h-10 px-4 rounded-[10px] flex-row items-center gap-1.5"
              style={{ backgroundColor: 'var(--c-brand-surface)', opacity: saving || invalid ? 0.5 : 1 } as any}
            >
              {saving ? <ActivityIndicator size="small" color="var(--c-on-brand)" /> : <MaterialIcons name="save" size={15} color="var(--c-on-brand)" />}
              <Text className="text-[13.5px] font-bold" style={{ color: 'var(--c-on-brand)' }}>Salvează</Text>
            </Pressable>
          </View>
        </View>
      ) : hasAny ? (
        <View className="gap-2.5 pt-3 border-t" style={{ borderColor: 'var(--c-border)' } as any}>
          <PhoneLine label="Jucător" phone={ownPhone} hint={!player.phone && player.accountPhone ? 'din profil' : undefined} />
          {accounts.map((account) => (
            <PhoneLine key={account.userId} label="Părinte" name={account.name} phone={account.phone} hint="cont" />
          ))}
          {player.guardianPhone || player.guardianName ? <PhoneLine label="Părinte 1" name={player.guardianName} phone={player.guardianPhone} /> : null}
          {player.guardian2Phone || player.guardian2Name ? <PhoneLine label="Părinte 2" name={player.guardian2Name} phone={player.guardian2Phone} /> : null}
        </View>
      ) : (
        <Pressable onPress={() => { setDraft(player); setEditing(true); }} accessibilityRole="button" className="ui-press flex-row items-center gap-1.5 self-start">
          <MaterialIcons name="add" size={15} color="var(--c-brand-fg)" />
          <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Adaugă numere de telefon</Text>
        </Pressable>
      )}

      {family && !editing ? (
        <View className="pt-3 border-t" style={{ borderColor: 'var(--c-border)' } as any}>
          <GuardiansPanel bare playerId={player.id} playerName={`${player.firstName} ${player.lastName}`.trim()} onNotify={onNotify} />
        </View>
      ) : null}
    </View>
  );
}

function StaffCard({ person, showMissing }: { person: StaffContact; showMissing?: boolean }) {
  return (
    <View
      className="rounded-[14px] border p-4 gap-3 min-w-0"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: person.ownTeam ? 'color-mix(in srgb, var(--c-brand-fg) 45%, var(--c-border))' : 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
    >
      <View className="flex-row items-center gap-3 min-w-0">
        <View className="h-10 w-10 rounded-full items-center justify-center shrink-0" style={{ backgroundColor: person.role === 'coach' ? 'var(--c-surface-tint)' : 'var(--c-purple-bg)' }}>
          <Text className="text-[12.5px] font-bold" style={{ color: person.role === 'coach' ? 'var(--c-brand-fg)' : 'var(--c-purple-fg)' }}>
            {getInitials(person.name.split(' ')[0], person.name.split(' ').slice(1).join(' '))}
          </Text>
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-[15px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{person.name}</Text>
          <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={2}>
            {[ROLE_LABEL[person.role] ?? person.role, person.teams.map((t) => t.name).join(', ')].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
      {person.phone ? (
        <PhoneLine label="Telefon" phone={person.phone} name={null} />
      ) : showMissing ? (
        <Text className="t-meta" style={{ color: 'var(--c-faint)' }}>Fără număr — îl poate adăuga din Profil.</Text>
      ) : null}
    </View>
  );
}

export default function ContactsScreen() {
  const { searchValue, setSearchPlaceholder, setSearchValue, setHeaderActions, setMobileFab } = useHeader();
  const { toasts, showToast, dismissToast } = useToasts();
  const [data, setData] = useState<ContactsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'players' | 'staff'>('players');
  const [teamFilter, setTeamFilter] = useState<string>('all');

  useEffect(() => {
    setSearchPlaceholder('Caută după nume sau telefon…');
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
      setError(err instanceof Error ? err.message : 'Nu am putut încărca agenda.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const query = searchValue.trim().toLowerCase();

  const teamName = useMemo(() => new Map((data?.mode === 'staff' ? data.teams : []).map((t) => [t.id, t.name])), [data]);

  const players = useMemo(() => {
    if (data?.mode !== 'staff') return [];
    return data.players.filter((p) =>
      (teamFilter === 'all' || p.teamIds.includes(Number(teamFilter)))
      && matchesQuery(query, `${p.firstName} ${p.lastName}`, `${p.lastName} ${p.firstName}`, p.phone, p.accountPhone, p.guardianName, p.guardianPhone, p.guardian2Name, p.guardian2Phone, p.number != null ? `#${p.number}` : null));
  }, [data, teamFilter, query]);

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
      showToast({ variant: 'success', message: 'Contacte salvate.' });
      return true;
    } catch (err) {
      showToast({ variant: 'error', message: err instanceof Error ? err.message : 'Nu am putut salva.' });
      return false;
    }
  };

  const isStaffView = data?.mode === 'staff';

  return (
    <View className="flex-1" style={{ backgroundColor: 'var(--c-bg)' }}>
      <ScrollView className="flex-1" contentContainerClassName="pb-32" showsVerticalScrollIndicator={false}>
        <PageContainer>
          <PageHeader
            title={isStaffView || !data ? 'Agendă' : 'Contacte'}
            subtitle={isStaffView || !data
              ? 'Telefoanele jucătorilor, părinților și ale staff-ului — la un tap distanță.'
              : 'Antrenorii și administratorii clubului.'}
          />

          {error ? (
            <ErrorState title="Nu am putut încărca agenda" message={error} actionLabel="Reîncearcă" onAction={load} />
          ) : !data ? (
            <View className="grid grid-cols-1 md:grid-cols-2 gap-2.5" accessibilityRole="progressbar" accessibilityLabel="Se încarcă agenda">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[132px] w-full rounded-[14px]" />)}
            </View>
          ) : data.mode === 'member' ? (
            staff.length === 0 ? (
              <View className="rounded-[16px] border" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}>
                <EmptyState
                  icon="contacts"
                  title={query ? 'Niciun contact găsit' : 'Niciun număr încă'}
                  message={query ? `Nimic pentru „${searchValue.trim()}”.` : 'Antrenorii nu și-au adăugat încă numărul de telefon în profil.'}
                />
              </View>
            ) : (
              <View className="gap-5">
                {staff.some((s) => s.ownTeam) ? (
                  <View>
                    <Text className="text-[15px] font-bold mb-2.5" style={{ color: 'var(--c-ink)' }}>Antrenorii echipei tale</Text>
                    <View className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 ui-stagger">
                      {staff.filter((s) => s.ownTeam).map((s) => <StaffCard key={s.id} person={s} />)}
                    </View>
                  </View>
                ) : null}
                {staff.some((s) => !s.ownTeam) ? (
                  <View>
                    <Text className="text-[15px] font-bold mb-2.5" style={{ color: 'var(--c-ink)' }}>
                      {staff.some((s) => s.ownTeam) ? 'Restul clubului' : 'Staff-ul clubului'}
                    </Text>
                    <View className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 ui-stagger">
                      {staff.filter((s) => !s.ownTeam).map((s) => <StaffCard key={s.id} person={s} />)}
                    </View>
                  </View>
                ) : null}
              </View>
            )
          ) : (
            <>
              <View className="flex-row p-[3px] rounded-[12px] mb-3 sm:self-start" style={{ backgroundColor: 'var(--c-surface-3)' }} accessibilityRole={'tablist' as any}>
                {([['players', 'Jucători și părinți', data.players.length], ['staff', 'Staff', data.staff.length]] as const).map(([key, label, count]) => {
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

              {tab === 'players' ? (
                <View className="gap-3">
                  {data.teams.length > 1 ? (
                    <SelectField
                      label="Echipă"
                      icon="groups"
                      className="w-full sm:w-[300px]"
                      value={teamFilter}
                      onChange={setTeamFilter}
                      options={[
                        { key: 'all', label: 'Toate echipele', count: data.players.length },
                        ...data.teams.map((t) => ({ key: String(t.id), label: t.name, count: data.players.filter((p) => p.teamIds.includes(t.id)).length })),
                      ]}
                    />
                  ) : null}
                  {players.length === 0 ? (
                    <EmptyState
                      compact
                      icon={query ? 'search-off' : 'groups'}
                      title={query ? 'Niciun jucător găsit' : 'Niciun jucător'}
                      message={query ? `Nimic pentru „${searchValue.trim()}”.` : 'Jucătorii din loturile clubului apar aici.'}
                    />
                  ) : (
                    <View className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2.5">
                      {players.map((p) => (
                        <PlayerCard
                          key={p.id}
                          player={p}
                          teamNames={p.teamIds.map((id) => teamName.get(id)).filter(Boolean).join(', ')}
                          onSave={(update) => savePlayer(p.id, update)}
                          onNotify={showToast}
                        />
                      ))}
                    </View>
                  )}
                </View>
              ) : staff.length === 0 ? (
                <EmptyState compact icon="contacts" title="Niciun membru al staff-ului" message={query ? `Nimic pentru „${searchValue.trim()}”.` : 'Antrenorii și adminii clubului apar aici.'} />
              ) : (
                <View className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2.5 ui-stagger">
                  {staff.map((s) => <StaffCard key={s.id} person={s} showMissing />)}
                </View>
              )}
            </>
          )}
        </PageContainer>
      </ScrollView>
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </View>
  );
}
