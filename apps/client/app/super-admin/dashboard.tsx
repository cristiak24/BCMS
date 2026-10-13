import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import PageContainer from '../../components/ui/PageContainer';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/ui/Button';
import FilterChips from '../../components/ui/FilterChips';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ScreenState';
import { auditActionLabel } from '../../components/audit/AuditLogList';
import { DeltaPill, Meter, MonthBars, Notice, Panel } from '../../components/super-admin/ui';
import {
  CLUB_ROLE_ORDER,
  ROLE_LABEL_PLURAL,
  deltaPercent,
  formatMoney,
  formatNumber,
  formatRelative,
  monthLabel,
  plural,
  roleVisual,
} from '../../components/super-admin/format';
import CreateClubDialog from '../../components/super-admin/CreateClubDialog';
import { useSession } from '../../context/AuthContext';
import { superAdminApi, type AttentionItem, type SuperAdminOverview } from '../../services/superAdminApi';

type TrendMetric = 'activeUsers' | 'newAccounts' | 'amount';

const TREND_OPTIONS: { key: TrendMetric; label: string }[] = [
  { key: 'activeUsers', label: 'Utilizatori activi' },
  { key: 'newAccounts', label: 'Conturi noi' },
  { key: 'amount', label: 'Facturat' },
];

function attentionCopy(item: AttentionItem) {
  switch (item.kind) {
    case 'pendingRequests':
      return { icon: 'how-to-reg', tone: 'var(--c-warning-fg)', bg: 'var(--c-warning-bg)', title: `${plural(item.count ?? 0, 'cerere de acces', 'cereri de acces')} în așteptare`, hint: 'Le aprobă adminii cluburilor.' };
    case 'noAdmin':
      return { icon: 'admin-panel-settings', tone: 'var(--c-danger-fg)', bg: 'var(--c-danger-bg)', title: `${item.clubName} nu are administrator`, hint: 'Invită un administrator ca să poată gestiona clubul.' };
    case 'dormant':
      return { icon: 'warning-amber', tone: 'var(--c-warning-fg)', bg: 'var(--c-warning-bg)', title: `${item.clubName} — nicio activitate în 30 de zile`, hint: 'Clubul are conturi, dar nimeni nu a folosit aplicația.' };
    case 'unpriced':
    default:
      return { icon: 'payments', tone: 'var(--c-brand-fg)', bg: 'var(--c-surface-tint)', title: `${item.clubName} nu are preț setat`, hint: `${plural(item.count ?? 0, 'utilizator activ', 'utilizatori activi')} luna aceasta, nefacturați.` };
  }
}

function DashboardSkeleton() {
  return (
    <View className="gap-4" accessibilityRole="progressbar" accessibilityLabel="Se încarcă">
      <View className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[132px] rounded-[16px]" />)}
      </View>
      <View className="grid lg:grid-cols-3 gap-4">
        <Skeleton className="h-[260px] rounded-[16px] lg:col-span-2" />
        <Skeleton className="h-[260px] rounded-[16px]" />
      </View>
    </View>
  );
}

export default function SuperAdminDashboard() {
  const router = useRouter();
  const { session } = useSession();
  const [data, setData] = useState<SuperAdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<TrendMetric>('activeUsers');
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await superAdminApi.getOverview());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut încărca datele.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const firstName = session?.firstName || session?.name?.split(' ')[0] || '';

  const header = (
    <PageHeader
      keepTitleOnMobile
      title={firstName ? `Bună, ${firstName}` : 'Privire de ansamblu'}
      subtitle={data ? `Platforma în ${monthLabel(data.month)} · ${plural(data.totals.clubs, 'club', 'cluburi')}, ${plural(data.totals.accounts, 'cont', 'conturi')}` : 'Platforma pe scurt'}
      actions={(
        <>
          <Button label="Club nou" icon="add" iconOnlyOnMobile onPress={() => setCreateOpen(true)} />
          <Button label="Invită" icon="person-add" variant="primary" iconOnlyOnMobile onPress={() => router.push('/super-admin/create-user')} />
        </>
      )}
    />
  );

  if (error && !data) {
    return (
      <PageContainer>
        {header}
        <ErrorState message={error} actionLabel="Încearcă din nou" onAction={() => void load()} />
      </PageContainer>
    );
  }

  if (!data) {
    return (
      <PageContainer>
        {header}
        <DashboardSkeleton />
      </PageContainer>
    );
  }

  const monthDelta = deltaPercent(data.activity.thisMonth, data.activity.lastMonth);
  const revenueDelta = data.revenue.thisMonth != null && data.revenue.lastMonth ? deltaPercent(data.revenue.thisMonth, data.revenue.lastMonth) : null;
  const trendPoints = data.trend.map((point) => ({
    month: point.month,
    value: metric === 'amount' ? point.amount : point[metric],
  }));
  const trendHasData = data.trend.some((point) => point.activeUsers > 0 || point.newAccounts > 0);
  const rolesTotal = CLUB_ROLE_ORDER.reduce((sum, role) => sum + data.roles[role], 0);
  const topMax = Math.max(1, ...data.topClubs.map((club) => club.activeThisMonth));

  return (
    <PageContainer>
      {header}

      <View className="gap-4 ui-stagger">
        {data.trackingSince === data.month ? (
          <Notice icon="insights">
            Activitatea utilizatorilor se înregistrează din {monthLabel(data.month)}. Lunile anterioare nu au date de facturare.
          </Notice>
        ) : null}

        <View className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <StatCard
            icon="insights"
            label="Activi luna asta"
            value={data.activity.thisMonth}
            hint={`Luna trecută: ${formatNumber(data.activity.lastMonth)}`}
            footer={<View className="mt-2"><DeltaPill value={monthDelta} /></View>}
          />
          <StatCard
            icon="bolt"
            tone="success"
            label="Activi azi"
            value={data.activity.today}
            hint={`${formatNumber(data.activity.last7d)} în 7 zile · ${formatNumber(data.activity.last30d)} în 30`}
          />
          <StatCard
            icon="groups"
            tone="sky"
            label="Conturi"
            value={data.totals.accounts}
            hint={`${formatNumber(data.totals.activeAccounts)} active · ${formatNumber(data.totals.disabledAccounts)} oprite`}
            footer={(
              <Text className="t-meta mt-2" style={{ color: 'var(--c-success-fg)' }} numberOfLines={1}>
                +{formatNumber(data.newAccounts.last30d)} noi în 30 zile
              </Text>
            )}
          />
          <StatCard
            icon="payments"
            tone="purple"
            label="De facturat"
            value={formatMoney(data.revenue.thisMonth)}
            hint={`Luna trecută: ${formatMoney(data.revenue.lastMonth)}`}
            footer={<View className="mt-2"><DeltaPill value={revenueDelta} /></View>}
          />
        </View>

        <View className="grid lg:grid-cols-3 gap-4">
          <Panel
            className="lg:col-span-2"
            title="Evoluție pe 6 luni"
            subtitle={metric === 'amount' ? 'Suma estimată din prețurile setate pe cluburi' : metric === 'newAccounts' ? 'Conturi create în fiecare lună' : 'Conturi care au folosit aplicația în fiecare lună'}
          >
            <FilterChips options={TREND_OPTIONS} value={metric} onChange={setMetric} label="Indicator" />
            <View className="mt-3">
              {trendHasData ? (
                <MonthBars
                  points={trendPoints}
                  format={metric === 'amount' ? (value) => formatMoney(value).replace(' lei', '') : (value) => formatNumber(value)}
                />
              ) : (
                <View className="h-[150px] items-center justify-center">
                  <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>Încă nu există activitate înregistrată.</Text>
                </View>
              )}
            </View>
          </Panel>

          <Panel title="Necesită atenție" subtitle={data.attention.length ? undefined : 'Totul e în regulă.'} flush={data.attention.length > 0}>
            {data.attention.length === 0 ? (
              <View className="items-center py-6 gap-2">
                <View className="w-11 h-11 rounded-full items-center justify-center" style={{ backgroundColor: 'var(--c-success-bg)' }}>
                  <MaterialIcons name="task-alt" size={22} color="var(--c-success-fg)" />
                </View>
                <Text className="t-meta text-center" style={{ color: 'var(--c-muted)' }}>Fiecare club are administrator, preț și activitate.</Text>
              </View>
            ) : (
              <View>
                {data.attention.map((item, index) => {
                  const copy = attentionCopy(item);
                  const target = item.clubId ? `/super-admin/clubs/${item.clubId}` : null;
                  return (
                    <Pressable
                      key={`${item.kind}-${item.clubId ?? index}`}
                      onPress={target ? () => router.push(target) : undefined}
                      disabled={!target}
                      className="home-row flex-row items-center gap-3 px-4 py-3 hover:bg-[var(--c-surface-2)]"
                      style={{ borderTopWidth: index ? 1 : 0, borderTopColor: 'var(--c-border)' } as any}
                    >
                      <View className="w-8 h-8 rounded-[9px] items-center justify-center shrink-0" style={{ backgroundColor: copy.bg }}>
                        <MaterialIcons name={copy.icon} size={16} color={copy.tone} />
                      </View>
                      <View className="flex-1 min-w-0">
                        <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={2}>{copy.title}</Text>
                        <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={2}>{copy.hint}</Text>
                      </View>
                      {target ? <View className="home-arrow"><MaterialIcons name="chevron-right" size={18} color="var(--c-faint)" /></View> : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Panel>
        </View>

        <View className="grid lg:grid-cols-3 gap-4">
          <Panel
            className="lg:col-span-2"
            title="Cluburi după activitate"
            subtitle={`Utilizatori activi în ${monthLabel(data.month)}`}
            flush
            action={<Button size="sm" variant="ghost" label="Toate" onPress={() => router.push('/super-admin/clubs')} />}
          >
            {data.topClubs.length === 0 ? (
              <View className="p-4">
                <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>Niciun club încă. Creează primul club.</Text>
              </View>
            ) : data.topClubs.map((club, index) => (
              <Pressable
                key={club.id}
                onPress={() => router.push(`/super-admin/clubs/${club.id}`)}
                className="home-row flex-row items-center gap-3 px-4 py-3 hover:bg-[var(--c-surface-2)]"
                style={{ borderTopWidth: index ? 1 : 0, borderTopColor: 'var(--c-border)' } as any}
                accessibilityRole="button"
                accessibilityLabel={`Deschide ${club.name}`}
              >
                <View className="w-8 h-8 rounded-[9px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-3)' }}>
                  <Text className="text-[12px] font-bold t-num" style={{ color: 'var(--c-ink-soft)' }}>{index + 1}</Text>
                </View>
                <View className="flex-1 min-w-0 gap-1.5">
                  <View className="flex-row items-baseline justify-between gap-2">
                    <Text className="text-[14px] font-semibold flex-1 min-w-0" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{club.name}</Text>
                    <Text className="text-[13px] font-bold t-num shrink-0" style={{ color: 'var(--c-ink)' }}>
                      {formatNumber(club.activeThisMonth)}
                      <Text className="font-medium" style={{ color: 'var(--c-faint)' }}> / {formatNumber(club.accounts.total)}</Text>
                    </Text>
                  </View>
                  <Meter value={club.activeThisMonth} max={topMax} />
                  <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                    Ultima activitate {formatRelative(club.lastActivityAt, 'niciodată').toLowerCase()}
                    {club.estimatedAmount != null ? ` · ${formatMoney(club.estimatedAmount)}` : ''}
                  </Text>
                </View>
                <View className="home-arrow"><MaterialIcons name="chevron-right" size={18} color="var(--c-faint)" /></View>
              </Pressable>
            ))}
          </Panel>

          <View className="gap-4">
            <Panel title="Pe roluri" subtitle={`${plural(rolesTotal, 'cont activ', 'conturi active')} în cluburi`}>
              <View className="gap-2.5">
                {CLUB_ROLE_ORDER.map((role) => (
                  <View key={role} className="gap-1">
                    <View className="flex-row justify-between">
                      <Text className="text-[13px] font-medium" style={{ color: 'var(--c-ink-soft)' }}>{ROLE_LABEL_PLURAL[role]}</Text>
                      <Text className="text-[13px] font-bold t-num" style={{ color: 'var(--c-ink)' }}>{formatNumber(data.roles[role])}</Text>
                    </View>
                    <Meter value={data.roles[role]} max={rolesTotal} tone={roleVisual(role).fg} />
                  </View>
                ))}
              </View>
            </Panel>

            <Panel title="Platformă">
              <View className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Echipe active', value: data.totals.teams },
                  { label: 'Jucători în loturi', value: data.totals.rosterPlayers },
                  { label: 'Invitații deschise', value: data.totals.pendingInvites },
                  { label: 'Înregistrări neterminate', value: data.totals.pendingAccounts },
                ].map((item) => (
                  <View key={item.label}>
                    <Text className="text-[20px] font-bold t-num" style={{ color: 'var(--c-ink-strong)' }}>{formatNumber(item.value)}</Text>
                    <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={2}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </Panel>
          </View>
        </View>

        <Panel
          title="Activitate recentă"
          flush
          action={<Button size="sm" variant="ghost" label="Jurnal complet" onPress={() => router.push('/super-admin/audit-logs')} />}
        >
          {data.recentAudit.length === 0 ? (
            <View className="p-4"><Text className="t-meta" style={{ color: 'var(--c-muted)' }}>Nicio acțiune înregistrată.</Text></View>
          ) : data.recentAudit.map((entry, index) => (
            <View
              key={entry.id}
              className="flex-row items-center gap-3 px-4 py-2.5"
              style={{ borderTopWidth: index ? 1 : 0, borderTopColor: 'var(--c-border)' } as any}
            >
              <View className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--c-brand-surface)' }} />
              <Text className="text-[13px] font-medium flex-1 min-w-0" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
                {auditActionLabel(entry.action)}
                {entry.clubName ? <Text style={{ color: 'var(--c-muted)' }}> · {entry.clubName}</Text> : null}
              </Text>
              <Text className="t-meta shrink-0" style={{ color: 'var(--c-faint)' }}>{formatRelative(entry.createdAt, '—')}</Text>
            </View>
          ))}
        </Panel>
      </View>

      <CreateClubDialog
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(club) => router.push(`/super-admin/clubs/${club.id}`)}
      />
    </PageContainer>
  );
}
