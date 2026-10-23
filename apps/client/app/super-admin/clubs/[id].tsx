import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import PageContainer from '../../../components/ui/PageContainer';
import PageHeader from '../../../components/ui/PageHeader';
import StatCard from '../../../components/ui/StatCard';
import Button from '../../../components/ui/Button';
import FilterChips from '../../../components/ui/FilterChips';
import SelectField from '../../../components/ui/SelectField';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { FormField } from '../../../components/ui/FormField';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../../components/ui/ScreenState';
import { ToastHost, useToasts } from '../../../components/ui/Toast';
import { useSession } from '../../../context/AuthContext';
import UserActions, { type ActionTarget } from '../../../components/super-admin/UserActions';
import {
  Avatar,
  DeltaPill,
  HeaderCell,
  ListShell,
  MonthBars,
  Notice,
  Panel,
  RolePill,
  RowMenuButton,
  SearchInput,
  StatusLabel,
} from '../../../components/super-admin/ui';
import {
  CLUB_ROLE_ORDER,
  ROLE_LABEL_PLURAL,
  deltaPercent,
  downloadCsv,
  fold,
  formatDate,
  formatMoney,
  formatNumber,
  formatRelative,
  monthLabel,
  plural,
  roleLabel,
} from '../../../components/super-admin/format';
import { superAdminApi, type ClubDetail, type ClubRole } from '../../../services/superAdminApi';

type Tab = 'members' | 'teams' | 'invites' | 'billing';
type RoleFilter = 'all' | ClubRole | 'disabled';

function MembersTab({
  detail,
  onAction,
}: {
  detail: ClubDetail;
  onAction: (target: ActionTarget) => void;
}) {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<RoleFilter>('all');

  const members = useMemo(() => {
    const q = fold(search.trim());
    return detail.members.filter((member) => {
      if (role === 'disabled' ? member.status !== 'disabled' : role !== 'all' && member.role !== role) return false;
      return !q || fold(`${member.name} ${member.email} ${member.phone ?? ''}`).includes(q);
    });
  }, [detail.members, role, search]);

  const roleOptions = [
    { key: 'all' as RoleFilter, label: 'Toate rolurile', count: detail.members.length },
    ...CLUB_ROLE_ORDER.map((key) => ({ key: key as RoleFilter, label: ROLE_LABEL_PLURAL[key], count: detail.members.filter((member) => member.role === key).length })),
    { key: 'disabled' as RoleFilter, label: 'Dezactivați', count: detail.members.filter((member) => member.status === 'disabled').length },
  ];

  return (
    <View className="gap-3">
      <View className="flex-col sm:flex-row gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Caută după nume, email sau telefon…" className="flex-1" />
        <SelectField<RoleFilter> label="Rol" value={role} onChange={setRole} options={roleOptions} className="w-full sm:w-[220px]" />
      </View>

      {members.length === 0 ? (
        <EmptyState compact icon="group-off" title="Niciun membru găsit" message={detail.members.length ? 'Încearcă alt filtru.' : 'Invită un administrator ca să înceapă clubul.'} />
      ) : (
        <ListShell
          header={(
            <>
              <HeaderCell flex={2.4}>Cont</HeaderCell>
              <HeaderCell>Rol</HeaderCell>
              <HeaderCell>Stare</HeaderCell>
              <HeaderCell flex={1.3}>Ultima activitate</HeaderCell>
              <View className="w-9" />
            </>
          )}
        >
          {members.map((member, index) => (
            <View
              key={member.id}
              className="flex-row items-center gap-3 px-3 py-2.5"
              style={{ borderTopWidth: index ? 1 : 0, borderTopColor: 'var(--c-border)', opacity: member.status === 'disabled' ? 0.7 : 1 } as any}
            >
              <View className="flex-1 md:flex-[2.4] min-w-0 flex-row items-center gap-3">
                <Avatar name={member.name} email={member.email} role={member.role} />
                <View className="flex-1 min-w-0">
                  <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{member.name || member.email}</Text>
                  <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{member.email}{member.phone ? ` · ${member.phone}` : ''}</Text>
                  <Text className="t-meta md:hidden" style={{ color: 'var(--c-ink-soft)' }} numberOfLines={1}>
                    {roleLabel(member.role)} · {member.status === 'disabled' ? 'dezactivat' : formatRelative(member.lastLoginAt, 'nu a intrat încă').toLowerCase()}
                  </Text>
                </View>
              </View>
              <View className="hidden md:flex flex-1 min-w-0"><RolePill role={member.role} /></View>
              <View className="hidden md:flex flex-1 min-w-0"><StatusLabel status={member.status} /></View>
              <View className="hidden md:flex flex-[1.3] min-w-0">
                <Text className="text-[13px]" style={{ color: 'var(--c-ink-soft)' }} numberOfLines={1}>{formatRelative(member.lastLoginAt)}</Text>
                {member.activeDaysThisMonth ? (
                  <Text className="t-meta" style={{ color: 'var(--c-faint)' }}>{plural(member.activeDaysThisMonth, 'zi activă', 'zile active')} luna asta</Text>
                ) : null}
              </View>
              <View className="w-9 items-end shrink-0">
                <RowMenuButton
                  label={`Acțiuni pentru ${member.name}`}
                  onPress={() => onAction({ ...member, clubName: detail.club.name, source: 'user' })}
                />
              </View>
            </View>
          ))}
        </ListShell>
      )}
    </View>
  );
}

function TeamsTab({ detail }: { detail: ClubDetail }) {
  if (detail.teams.length === 0) {
    return <EmptyState compact icon="sports-basketball" title="Nicio echipă" message="Adminul clubului adaugă echipele din „Clubul meu”." />;
  }
  return (
    <ListShell
      header={(
        <>
          <HeaderCell flex={2}>Echipă</HeaderCell>
          <HeaderCell flex={1.4}>Antrenor</HeaderCell>
          <HeaderCell>Jucători</HeaderCell>
          <HeaderCell align="right">Stare</HeaderCell>
        </>
      )}
    >
      {detail.teams.map((team, index) => (
        <View key={team.id} className="flex-row items-center gap-3 px-3 py-2.5" style={{ borderTopWidth: index ? 1 : 0, borderTopColor: 'var(--c-border)' } as any}>
          <View className="flex-1 md:flex-[2] min-w-0">
            <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{team.name}</Text>
            <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
              {[team.leagueName, team.seasonName].filter(Boolean).join(' · ') || '—'}
              <Text className="md:hidden">{` · ${plural(team.players, 'jucător', 'jucători')}`}</Text>
            </Text>
          </View>
          <Text className="hidden md:flex flex-[1.4] text-[13px] min-w-0" style={{ color: team.coachName ? 'var(--c-ink-soft)' : 'var(--c-faint)' }} numberOfLines={1}>{team.coachName ?? 'Fără antrenor'}</Text>
          <Text className="hidden md:flex flex-1 text-[13px] font-semibold t-num" style={{ color: 'var(--c-ink)' }}>{formatNumber(team.players)}</Text>
          <View className="md:flex-1 items-end">
            <Text className="text-[12px] font-semibold" style={{ color: team.isActive ? 'var(--c-success-fg)' : 'var(--c-faint)' }}>{team.isActive ? 'Activă' : 'Arhivată'}</Text>
          </View>
        </View>
      ))}
    </ListShell>
  );
}

function InvitesTab({ detail, onAction, onInvite }: { detail: ClubDetail; onAction: (target: ActionTarget) => void; onInvite: () => void }) {
  if (detail.invites.length === 0) {
    return <EmptyState compact icon="mail-outline" title="Nicio invitație deschisă" message="Invitațiile acceptate devin conturi în Membri." actionLabel="Invită" onAction={onInvite} />;
  }
  return (
    <ListShell>
      {detail.invites.map((invite, index) => (
        <View key={invite.id} className="flex-row items-center gap-3 px-3 py-2.5" style={{ borderTopWidth: index ? 1 : 0, borderTopColor: 'var(--c-border)' } as any}>
          <Avatar name={invite.email} role={invite.role} invite />
          <View className="flex-1 min-w-0">
            <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{invite.email}</Text>
            <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
              {roleLabel(invite.role)} · trimisă {formatRelative(invite.createdAt, '—').toLowerCase()} · expiră {formatDate(invite.expiresAt)}
            </Text>
          </View>
          <RowMenuButton
            label={`Acțiuni pentru invitația ${invite.email}`}
            onPress={() => onAction({ id: `invite-${invite.id}`, name: invite.email, email: invite.email, role: invite.role, status: 'invited', clubId: detail.club.id, clubName: detail.club.name, source: 'invite' })}
          />
        </View>
      ))}
    </ListShell>
  );
}

function BillingTab({ detail, onSaved, notify }: { detail: ClubDetail; onSaved: () => void; notify: (variant: 'success' | 'error', message: string) => void }) {
  const club = detail.club;
  const [price, setPrice] = useState(club.billingPricePerUser == null ? '' : String(club.billingPricePerUser).replace('.', ','));
  const [notes, setNotes] = useState(club.internalNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const dirty = price !== (club.billingPricePerUser == null ? '' : String(club.billingPricePerUser).replace('.', ',')) || notes !== (club.internalNotes ?? '');
  const parsed = price.trim() === '' ? null : Number(price.replace(',', '.'));
  const priceError = parsed != null && (!Number.isFinite(parsed) || parsed < 0) ? 'Introdu o sumă validă, ex. 5 sau 4,50.' : null;
  const preview = parsed != null && !priceError ? Math.round(parsed * club.activeThisMonth * 100) / 100 : null;

  const save = async () => {
    setSaving(true);
    try {
      await superAdminApi.updateClub(club.id, { billingPricePerUser: price.trim() === '' ? null : price.trim(), internalNotes: notes });
      notify('success', 'Setările de facturare au fost salvate.');
      onSaved();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Nu am putut salva.');
    } finally {
      setSaving(false);
    }
  };

  const exportMonth = async (month: string) => {
    setExporting(true);
    try {
      const { users } = await superAdminApi.getBillingDetail(club.id, month);
      downloadCsv(`${club.name}-${month}-utilizatori-activi.csv`, [
        ['Nume', 'Email', 'Rol', 'Zile active', 'Prima activitate', 'Ultima activitate'],
        ...users.map((user) => [user.name, user.email, roleLabel(user.role), user.activeDays, formatDate(user.firstSeenAt), formatDate(user.lastSeenAt)]),
      ]);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Nu am putut exporta.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <View className="grid lg:grid-cols-5 gap-4">
      <Panel className="lg:col-span-2" title="Tarif și notițe" subtitle="Vizibile doar pentru super admin.">
        <View className="gap-3">
          <FormField
            label="Preț pe utilizator activ / lună (lei)"
            icon="payments"
            value={price}
            onChangeText={setPrice}
            placeholder="ex. 5"
            keyboardType="decimal-pad"
            error={priceError}
            hint={preview != null ? `Luna aceasta: ${plural(club.activeThisMonth, 'utilizator activ', 'utilizatori activi')} → ${formatMoney(preview)}` : 'Gol = clubul nu se facturează încă.'}
          />
          <FormField
            label="Notițe interne"
            value={notes}
            onChangeText={setNotes}
            placeholder="Contract, persoană de contact, reduceri…"
            multiline
          />
          <View className="flex-row justify-end">
            <Button label="Salvează" icon="save" variant="primary" loading={saving} disabled={!dirty || Boolean(priceError)} onPress={() => void save()} />
          </View>
        </View>
      </Panel>

      <Panel
        className="lg:col-span-3"
        title="Istoric 6 luni"
        subtitle="Utilizatori activi pe lună și suma calculată cu prețul de acum."
        action={<Button size="sm" label="Export luna curentă" icon="file-download" loading={exporting} onPress={() => void exportMonth(detail.month)} />}
      >
        <MonthBars points={detail.trend.map((point) => ({ month: point.month, value: point.activeUsers }))} format={formatNumber} />
        <View className="mt-3 rounded-[12px] border overflow-hidden" style={{ borderColor: 'var(--c-border)' }}>
          {[...detail.trend].reverse().map((point, index) => (
            <Pressable
              key={point.month}
              onPress={() => void exportMonth(point.month)}
              disabled={exporting || point.activeUsers === 0}
              accessibilityRole="button"
              accessibilityLabel={`Descarcă lista utilizatorilor activi din ${monthLabel(point.month)}`}
              className="flex-row items-center gap-3 px-3 py-2 hover:bg-[var(--c-surface-2)]"
              style={{ borderTopWidth: index ? 1 : 0, borderTopColor: 'var(--c-border)' } as any}
            >
              <Text className="flex-1 text-[13px] font-medium capitalize" style={{ color: 'var(--c-ink-soft)' }}>{monthLabel(point.month)}</Text>
              <Text className="w-24 text-right text-[13px] t-num" style={{ color: 'var(--c-ink)' }}>{plural(point.activeUsers, 'activ', 'activi')}</Text>
              <Text className="w-24 text-right text-[13px] font-semibold t-num" style={{ color: 'var(--c-ink)' }}>{formatMoney(point.amount)}</Text>
              <MaterialIcons name="file-download" size={16} color={point.activeUsers ? 'var(--c-muted)' : 'var(--c-border)'} />
            </Pressable>
          ))}
        </View>
      </Panel>
    </View>
  );
}

export default function ClubDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { toasts, showToast, dismissToast } = useToasts();
  const [detail, setDetail] = useState<ClubDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('members');
  const [target, setTarget] = useState<ActionTarget | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState(false);

  const notify = useCallback((variant: 'success' | 'error', message: string) => showToast({ variant, message }), [showToast]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDetail(await superAdminApi.getClub(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut încărca clubul.');
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const invite = () => router.push(`/super-admin/create-user?clubId=${id}`);

  const rename = async () => {
    setRenaming(true);
    try {
      await superAdminApi.updateClub(Number(id), { name: newName });
      setRenameOpen(false);
      notify('success', 'Clubul a fost redenumit.');
      void load();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Nu am putut redenumi clubul.');
    } finally {
      setRenaming(false);
    }
  };

  const back = <Button size="sm" variant="ghost" icon="chevron-left" label="Cluburi" onPress={() => router.push('/super-admin/clubs')} className="-ml-2.5 mb-1 self-start" />;

  if (error && !detail) {
    return (
      <PageContainer>
        {back}
        <ErrorState message={error} actionLabel="Încearcă din nou" onAction={() => void load()} />
      </PageContainer>
    );
  }

  if (!detail) {
    return (
      <PageContainer>
        {back}
        <View className="gap-3" accessibilityRole="progressbar" accessibilityLabel="Se încarcă clubul">
          <Skeleton className="h-[52px] w-[60%] rounded-[12px]" />
          <View className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[120px] rounded-[16px]" />)}
          </View>
          <Skeleton className="h-[300px] rounded-[16px]" />
        </View>
      </PageContainer>
    );
  }

  const club = detail.club;
  const lastMonth = detail.trend[detail.trend.length - 2]?.activeUsers ?? 0;

  return (
    <PageContainer>
      {back}
      <PageHeader
        keepTitleOnMobile
        title={club.name}
        subtitle={`Creat ${formatDate(club.createdAt)} · ${club.stripeConnected ? 'Stripe conectat' : 'fără Stripe propriu'} · ultima activitate ${formatRelative(club.lastActivityAt, 'niciodată').toLowerCase()}`}
        actions={(
          <>
            <Button label="Redenumește" icon="edit" iconOnlyOnMobile onPress={() => { setNewName(club.name); setRenameOpen(true); }} />
            <Button label="Invită în club" icon="person-add" variant="primary" iconOnlyOnMobile onPress={invite} />
          </>
        )}
      />

      <View className="gap-4">
        {club.flags.noAdmin ? (
          <Notice tone="warning" icon="admin-panel-settings">Clubul nu are niciun administrator activ. Invită unul ca să poată gestiona echipele, conturile și plățile.</Notice>
        ) : null}

        <View className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <StatCard
            icon="insights"
            label="Activi luna asta"
            value={club.activeThisMonth}
            hint={`${formatNumber(club.active30d)} în ultimele 30 de zile`}
            footer={<View className="mt-2"><DeltaPill value={deltaPercent(club.activeThisMonth, lastMonth)} /></View>}
          />
          <StatCard
            icon="groups"
            tone="sky"
            label="Conturi"
            value={club.accounts.total}
            hint={`${plural(club.roles.admin, 'admin', 'admini')} · ${plural(club.roles.coach, 'antrenor', 'antrenori')} · ${plural(club.roles.parent, 'părinte', 'părinți')}`}
          />
          <StatCard
            icon="sports-basketball"
            tone="success"
            label="Jucători în lot"
            value={club.rosterPlayers}
            hint={plural(club.teams, 'echipă activă', 'echipe active')}
          />
          <StatCard
            icon="payments"
            tone="purple"
            label="De facturat"
            value={formatMoney(club.estimatedAmount)}
            hint={club.billingPricePerUser != null ? `${formatMoney(club.billingPricePerUser)} / utilizator activ` : 'Setează prețul în Facturare'}
          />
        </View>

        <FilterChips<Tab>
          value={tab}
          onChange={setTab}
          label="Secțiuni club"
          options={[
            { key: 'members', label: 'Membri', count: detail.members.length },
            { key: 'teams', label: 'Echipe', count: detail.teams.length },
            { key: 'invites', label: 'Invitații', count: detail.invites.length },
            { key: 'billing', label: 'Facturare' },
          ]}
        />

        {tab === 'members' ? <MembersTab detail={detail} onAction={setTarget} /> : null}
        {tab === 'teams' ? <TeamsTab detail={detail} /> : null}
        {tab === 'invites' ? <InvitesTab detail={detail} onAction={setTarget} onInvite={invite} /> : null}
        {tab === 'billing' ? <BillingTab key={`${club.billingPricePerUser}|${club.internalNotes}`} detail={detail} onSaved={() => void load()} notify={notify} /> : null}
      </View>

      <UserActions target={target} selfId={session?.id != null ? Number(session.id) : null} onClose={() => setTarget(null)} onChanged={() => void load()} notify={notify} />

      <ConfirmDialog
        visible={renameOpen}
        title="Redenumește clubul"
        icon="edit"
        confirmLabel="Salvează"
        loading={renaming}
        confirmDisabled={!newName.trim() || newName.trim() === club.name}
        onConfirm={() => void rename()}
        onCancel={() => setRenameOpen(false)}
      >
        <FormField label="Numele clubului" value={newName} onChangeText={setNewName} autoCapitalize="words" />
      </ConfirmDialog>

      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </PageContainer>
  );
}
