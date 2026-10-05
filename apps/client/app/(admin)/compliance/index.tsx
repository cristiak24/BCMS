import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import { DEFAULT_SEARCH_PLACEHOLDER, useHeader } from '../../../components/HeaderContext';
import PageContainer from '../../../components/ui/PageContainer';
import PageHero, { GlassStat } from '../../../components/admin/PageHero';
import Button from '../../../components/ui/Button';
import FilterChips from '../../../components/ui/FilterChips';
import SelectField from '../../../components/ui/SelectField';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import Pagination, { usePagination } from '../../../components/ui/Pagination';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../../components/ui/ScreenState';
import { ToastHost, useToasts } from '../../../components/ui/Toast';
import { computeComplianceMetrics } from '../../../components/compliance/complianceMetrics';
import { MEDICAL_META, formatDate, medicalStatus, type MedicalStatus } from '../../../components/myclub/teamDisplay';
import { teamsApi, type Player } from '../../../services/teamsApi';

/**
 * Medical visas for the whole club: who is expired, who expires this month,
 * who has nothing on file — and a real action to record a new expiry date for
 * one player or a selection.
 */

const PAGE_SIZE = 25;

type StatusFilter = 'attention' | 'all' | MedicalStatus;

// Most urgent first: an admin opens this page to see who blocks a game.
const STATUS_ORDER: Record<MedicalStatus, number> = { expired: 0, missing: 1, soon: 2, valid: 3 };

function initials(player: Player) {
  return `${player.firstName?.[0] ?? ''}${player.lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

function teamsOf(player: Player) {
  if (player.teamNames?.length) return player.teamNames;
  return player.teamName ? [player.teamName] : [];
}

function expiryHint(iso: string | null, status: MedicalStatus) {
  if (!iso || status === 'missing') return 'Nicio viză înregistrată';
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
  if (days < 0) return `Expirată de ${-days} ${-days === 1 ? 'zi' : 'zile'}`;
  if (days === 0) return 'Expiră azi';
  return `Peste ${days} ${days === 1 ? 'zi' : 'zile'}`;
}

function StatusBadge({ status }: { status: MedicalStatus }) {
  const meta = MEDICAL_META[status];
  return (
    <View className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1 self-start" style={{ backgroundColor: meta.bg }}>
      <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.fg }} />
      <Text className="text-[11.5px] font-semibold" style={{ color: meta.fg }} numberOfLines={1}>{meta.label}</Text>
    </View>
  );
}

function Checkbox({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} className="w-8 h-8 items-center justify-center shrink-0">
      <View
        className="w-[18px] h-[18px] rounded-[5px] border items-center justify-center"
        style={checked
          ? { backgroundColor: 'var(--c-brand-surface)', borderColor: 'var(--c-brand-surface)' }
          : { backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border-strong)' }}
      >
        {checked ? <MaterialIcons name="check" size={13} color="var(--c-on-brand)" /> : null}
      </View>
    </Pressable>
  );
}

function todayPlusYear() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export default function ComplianceScreen() {
  const router = useRouter();
  const { searchValue, setSearchValue, setSearchPlaceholder, setHeaderActions, setMobileFab } = useHeader();
  const { toasts, showToast, dismissToast } = useToasts();

  const [players, setPlayers] = useState<Player[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('attention');
  const [teamFilter, setTeamFilter] = useState('all');
  const [selected, setSelected] = useState<number[]>([]);
  const [editing, setEditing] = useState<number[] | null>(null);
  const [expiryInput, setExpiryInput] = useState(todayPlusYear());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSearchPlaceholder('Caută sportiv…');
    setHeaderActions(null);
    setMobileFab(null);
    return () => {
      setSearchPlaceholder(DEFAULT_SEARCH_PLACEHOLDER);
      setSearchValue('');
    };
  }, [setHeaderActions, setMobileFab, setSearchPlaceholder, setSearchValue]);

  const load = useCallback(async () => {
    try {
      setError(null);
      setPlayers(await teamsApi.getRoster());
    } catch {
      setError('Nu am putut încărca lista de vize medicale.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const metrics = useMemo(() => computeComplianceMetrics(players ?? []), [players]);

  const teamOptions = useMemo(() => {
    const names = new Set<string>();
    (players ?? []).forEach((p) => teamsOf(p).forEach((name) => names.add(name)));
    return [
      { key: 'all', label: 'Toate echipele' },
      ...[...names].sort((a, b) => a.localeCompare(b, 'ro')).map((name) => ({ key: name, label: name })),
    ];
  }, [players]);

  const query = searchValue.trim().toLowerCase();

  const teamScoped = useMemo(() => (players ?? []).filter((p) => {
    if (teamFilter !== 'all' && !teamsOf(p).includes(teamFilter)) return false;
    if (query && !`${p.firstName} ${p.lastName} ${p.lastName} ${p.firstName}`.toLowerCase().includes(query)) return false;
    return true;
  }), [players, teamFilter, query]);

  const counts = useMemo(() => {
    const c = { expired: 0, soon: 0, valid: 0, missing: 0 };
    teamScoped.forEach((p) => { c[medicalStatus(p.medicalCheckExpiry)] += 1; });
    return c;
  }, [teamScoped]);

  const rows = useMemo(() => teamScoped
    .map((player) => ({ player, status: medicalStatus(player.medicalCheckExpiry) }))
    .filter(({ status }) => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'attention') return status !== 'valid';
      return status === statusFilter;
    })
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      || (a.player.medicalCheckExpiry ?? '').localeCompare(b.player.medicalCheckExpiry ?? '')
      || a.player.lastName.localeCompare(b.player.lastName, 'ro')),
  [teamScoped, statusFilter]);

  const { page, totalPages, pageItems, setPage, rangeStart, rangeEnd, total } = usePagination(rows, PAGE_SIZE, `${statusFilter}:${teamFilter}:${query}`);

  const pageIds = pageItems.map((r) => r.player.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const toggle = (id: number) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const togglePage = () => setSelected((prev) => (allOnPageSelected ? prev.filter((id) => !pageIds.includes(id)) : [...new Set([...prev, ...pageIds])]));

  const openEditor = (ids: number[]) => {
    const single = ids.length === 1 ? players?.find((p) => p.id === ids[0]) : null;
    setExpiryInput(single?.medicalCheckExpiry && medicalStatus(single.medicalCheckExpiry) === 'valid'
      ? single.medicalCheckExpiry.slice(0, 10)
      : todayPlusYear());
    setEditing(ids);
  };

  const saveExpiry = async () => {
    if (!editing || !expiryInput) return;
    setSaving(true);
    try {
      const iso = new Date(`${expiryInput}T12:00:00Z`).toISOString();
      await Promise.all(editing.map((id) => teamsApi.updatePlayer(id, { medicalCheckExpiry: iso })));
      setPlayers((prev) => prev?.map((p) => (editing.includes(p.id) ? { ...p, medicalCheckExpiry: iso } : p)) ?? prev);
      showToast({ message: editing.length === 1 ? 'Viza a fost actualizată.' : `Vizele a ${editing.length} sportivi au fost actualizate.`, variant: 'success' });
      setSelected((prev) => prev.filter((id) => !editing.includes(id)));
      setEditing(null);
    } catch {
      showToast({ message: 'Nu am putut salva viza. Încearcă din nou.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const statusOptions = [
    { key: 'attention' as const, label: 'Necesită atenție', count: counts.expired + counts.soon + counts.missing },
    { key: 'expired' as const, label: 'Expirate', dot: 'var(--c-danger)', count: counts.expired },
    { key: 'soon' as const, label: 'Expiră curând', dot: 'var(--c-warning)', count: counts.soon },
    { key: 'missing' as const, label: 'Fără viză', dot: 'var(--c-border-strong)', count: counts.missing },
    { key: 'valid' as const, label: 'Valabile', dot: 'var(--c-success)', count: counts.valid },
    { key: 'all' as const, label: 'Toți', count: teamScoped.length },
  ];

  const editingNames = editing && players
    ? editing.map((id) => players.find((p) => p.id === id)).filter(Boolean).map((p) => `${p!.firstName} ${p!.lastName}`)
    : [];

  return (
    <View className="flex-1" style={{ backgroundColor: 'var(--c-bg)' }}>
      <ScrollView className="flex-1" contentContainerClassName="pb-36" showsVerticalScrollIndicator={false}>
        <PageContainer>
          <PageHero eyebrow="Conformitate" title="Vizele medicale" subtitle="Vizele medicale ale sportivilor din club.">
            {players && !error ? (
              <View className="grid grid-cols-2 lg:grid-cols-4 gap-2 ui-stagger">
                <GlassStat dot="var(--c-success)" value={metrics.valid} label="Valabile" hint={`${metrics.securePercent}% din lot`} />
                <GlassStat dot="var(--c-warning)" value={metrics.dueSoon} label="Expiră în 30 zile" hint="De reînnoit curând" />
                <GlassStat dot="var(--c-danger)" danger={metrics.expired > 0} value={metrics.expired} label="Expirate" hint="Nu pot juca" />
                <GlassStat dot="var(--c-muted)" value={metrics.missing} label="Fără viză" hint="Nicio dată înregistrată" />
              </View>
            ) : null}
          </PageHero>

          {error ? (
            <ErrorState title="Nu am putut încărca vizele" message={error} actionLabel="Reîncearcă" onAction={load} />
          ) : !players ? (
            <View className="gap-3" accessibilityRole="progressbar" accessibilityLabel="Se încarcă vizele">
                            <Skeleton className="h-[360px] w-full rounded-[16px]" />
            </View>
          ) : (
            <View className="gap-5">
              <View className="gap-3">
                <View className="flex-col lg:flex-row lg:items-center gap-2">
                  {teamOptions.length > 2 ? (
                    <SelectField label="Echipă" icon="groups" options={teamOptions} value={teamFilter} onChange={setTeamFilter} className="w-full lg:w-[260px]" />
                  ) : null}
                  <View className="flex-1 min-w-0">
                    <FilterChips label="Stare viză" options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
                  </View>
                </View>

                {selected.length > 0 ? (
                  <View className="flex-row items-center gap-3 rounded-[12px] px-3.5 py-2.5" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                    <Text className="flex-1 text-[13px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>
                      {selected.length} {selected.length === 1 ? 'sportiv selectat' : 'sportivi selectați'}
                    </Text>
                    <Button size="sm" variant="ghost" label="Deselectează" onPress={() => setSelected([])} />
                    <Button size="sm" variant="primary" icon="event-available" label="Actualizează viza" onPress={() => openEditor(selected)} />
                  </View>
                ) : null}

                {rows.length === 0 ? (
                  <EmptyState
                    compact
                    icon={statusFilter === 'attention' ? 'verified' : 'search-off'}
                    title={statusFilter === 'attention' ? 'Toate vizele sunt la zi' : 'Niciun sportiv'}
                    message={statusFilter === 'attention' ? 'Niciun sportiv nu are viza expirată, pe terminate sau lipsă.' : 'Încearcă alt filtru sau altă căutare.'}
                  />
                ) : (
                  <>
                    <View className="rounded-[14px] border overflow-hidden" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-xs)' } as any}>
                      <View className="hidden md:flex flex-row items-center px-3 py-2 border-b" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' }}>
                        <Checkbox checked={allOnPageSelected} onPress={togglePage} label="Selectează pagina" />
                        <Text className="t-eyebrow flex-[2] pl-2" style={{ color: 'var(--c-faint)' }}>Sportiv</Text>
                        <Text className="t-eyebrow flex-[1.4]" style={{ color: 'var(--c-faint)' }}>Echipă</Text>
                        <Text className="t-eyebrow flex-1" style={{ color: 'var(--c-faint)' }}>Stare</Text>
                        <Text className="t-eyebrow flex-[1.2]" style={{ color: 'var(--c-faint)' }}>Expiră</Text>
                        <View className="w-[108px]" />
                      </View>
                      {pageItems.map(({ player, status }, index) => {
                        const isSelected = selected.includes(player.id);
                        const teams = teamsOf(player);
                        return (
                          <View
                            key={player.id}
                            className="flex-row items-center gap-1 md:gap-0 px-3 py-2.5"
                            style={{
                              borderTopWidth: index > 0 ? 1 : 0,
                              borderTopColor: 'var(--c-border)',
                              backgroundColor: isSelected ? 'var(--c-surface-tint)' : 'transparent',
                            } as any}
                          >
                            <Checkbox checked={isSelected} onPress={() => toggle(player.id)} label={`Selectează ${player.firstName} ${player.lastName}`} />
                            <Pressable
                              onPress={() => router.push(`/admin/player/${player.id}` as any)}
                              accessibilityRole="link"
                              className="flex-1 md:flex-[2] min-w-0 flex-row items-center gap-3 pl-1 md:pl-2"
                            >
                              <View className="w-9 h-9 rounded-full items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-3)' }}>
                                <Text className="text-[12px] font-bold" style={{ color: 'var(--c-ink-soft)' }}>{initials(player)}</Text>
                              </View>
                              <View className="flex-1 min-w-0">
                                <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{player.firstName} {player.lastName}</Text>
                                {/* Phones: team + expiry under the name instead of their own columns. */}
                                <View className="md:hidden flex-row items-center gap-1.5 min-w-0">
                                  <View className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: MEDICAL_META[status].fg }} />
                                  <Text className="t-meta font-semibold" style={{ color: status === 'valid' ? 'var(--c-muted)' : MEDICAL_META[status].fg }} numberOfLines={1}>
                                    {expiryHint(player.medicalCheckExpiry, status)}
                                  </Text>
                                </View>
                                <View className="hidden md:flex">
                                  <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                                    {[player.number != null ? `#${player.number}` : null, player.position].filter(Boolean).join(' · ') || '—'}
                                  </Text>
                                </View>
                              </View>
                            </Pressable>
                            <View className="hidden md:flex flex-[1.4] min-w-0 pr-3">
                              <Text className="text-[13px]" style={{ color: 'var(--c-ink-soft)' }} numberOfLines={1}>{teams.join(', ') || '—'}</Text>
                            </View>
                            <View className="hidden md:flex flex-1"><StatusBadge status={status} /></View>
                            <View className="hidden md:flex flex-[1.2] min-w-0">
                              <Text className="text-[13px] font-semibold" style={{ color: status === 'expired' ? 'var(--c-danger-fg)' : 'var(--c-ink)' }}>
                                {status === 'missing' ? '—' : formatDate(player.medicalCheckExpiry)}
                              </Text>
                              <Text className="t-meta" style={{ color: 'var(--c-faint)' }} numberOfLines={1}>{expiryHint(player.medicalCheckExpiry, status)}</Text>
                            </View>
                            <View className="hidden md:flex w-[108px] items-end">
                              <Button size="sm" icon="event" label={status === 'valid' ? 'Modifică' : 'Actualizează'} onPress={() => openEditor([player.id])} />
                            </View>
                            <Pressable
                              onPress={() => openEditor([player.id])}
                              accessibilityRole="button"
                              accessibilityLabel={`Actualizează viza pentru ${player.firstName} ${player.lastName}`}
                              className="md:hidden ui-press w-8 h-8 rounded-[9px] items-center justify-center shrink-0"
                            >
                              <MaterialIcons name="event" size={18} color="var(--c-brand-fg)" />
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                    <Pagination page={page} totalPages={totalPages} onPageChange={setPage} rangeStart={rangeStart} rangeEnd={rangeEnd} total={total} itemNoun="sportivi" />
                  </>
                )}
              </View>
            </View>
          )}
        </PageContainer>
      </ScrollView>

      <ConfirmDialog
        visible={editing != null}
        title="Actualizează viza medicală"
        message={editingNames.length === 1
          ? `Noua dată de expirare pentru ${editingNames[0]}.`
          : `Aceeași dată de expirare pentru ${editingNames.length} sportivi.`}
        icon="event-available"
        confirmLabel="Salvează"
        loading={saving}
        confirmDisabled={!expiryInput}
        onConfirm={saveExpiry}
        onCancel={() => setEditing(null)}
      >
        <View className="gap-1.5">
          <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-muted)' }}>Valabilă până la</Text>
          <input
            type="date"
            value={expiryInput}
            onChange={(e) => setExpiryInput(e.target.value)}
            aria-label="Valabilă până la"
            style={{
              height: 44,
              borderRadius: 10,
              border: '1px solid var(--c-border)',
              backgroundColor: 'var(--c-surface-2)',
              color: 'var(--c-ink)',
              padding: '0 12px',
              fontSize: 14,
              fontWeight: 600,
              colorScheme: 'light dark',
            }}
          />
        </View>
      </ConfirmDialog>

      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </View>
  );
}
