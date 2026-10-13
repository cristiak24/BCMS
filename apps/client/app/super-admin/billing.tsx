import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import PageContainer from '../../components/ui/PageContainer';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/ui/Button';
import SelectField from '../../components/ui/SelectField';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { FormField } from '../../components/ui/FormField';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../components/ui/ScreenState';
import { ToastHost, useToasts } from '../../components/ui/Toast';
import { HeaderCell, ListShell, Notice } from '../../components/super-admin/ui';
import {
  CLUB_ROLE_ORDER,
  ROLE_LABEL_PLURAL,
  downloadCsv,
  formatDate,
  formatMoney,
  formatNumber,
  monthLabel,
  plural,
  roleCount,
  roleLabel,
} from '../../components/super-admin/format';
import { superAdminApi, type BillingResponse, type BillingRow } from '../../services/superAdminApi';

type Sort = 'amount' | 'users' | 'name';

function breakdown(row: BillingRow) {
  return CLUB_ROLE_ORDER
    .filter((role) => row.byRole[role] > 0)
    .map((role) => roleCount(role, row.byRole[role]))
    .join(' · ');
}

export default function BillingScreen() {
  const router = useRouter();
  const { toasts, showToast, dismissToast } = useToasts();
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [data, setData] = useState<BillingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('amount');
  const [pricing, setPricing] = useState<BillingRow | null>(null);
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [exportingId, setExportingId] = useState<number | null>(null);

  const load = useCallback(async (target?: string) => {
    setLoading(true);
    setError(null);
    try {
      setData(await superAdminApi.getBilling(target));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut încărca facturarea.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(month); }, [load, month]);

  const rows = useMemo(() => {
    const list = [...(data?.clubs ?? [])];
    if (sort === 'name') return list.sort((a, b) => a.name.localeCompare(b.name, 'ro'));
    if (sort === 'users') return list.sort((a, b) => b.billableUsers - a.billableUsers);
    return list.sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1) || b.billableUsers - a.billableUsers);
  }, [data, sort]);

  const isCurrent = data ? data.month === data.currentMonth : false;
  const beforeTracking = data?.trackingSince ? data.month < data.trackingSince : Boolean(data && !data.trackingSince);

  const exportSummary = () => {
    if (!data) return;
    downloadCsv(`facturare-${data.month}.csv`, [
      ['Club', 'Utilizatori activi (facturabili)', ...CLUB_ROLE_ORDER.map((role) => ROLE_LABEL_PLURAL[role]), 'Conturi active acum', 'Preț/utilizator (lei)', 'Total (lei)'],
      ...rows.map((row) => [row.name, row.billableUsers, ...CLUB_ROLE_ORDER.map((role) => row.byRole[role]), row.activeAccounts, row.pricePerUser ?? '', row.amount ?? '']),
      ['TOTAL', data.totals.billableUsers, ...CLUB_ROLE_ORDER.map(() => ''), '', '', data.totals.amount],
    ]);
  };

  const exportClub = async (row: BillingRow) => {
    if (!data) return;
    setExportingId(row.clubId);
    try {
      const { users } = await superAdminApi.getBillingDetail(row.clubId, data.month);
      downloadCsv(`${row.name}-${data.month}-utilizatori-activi.csv`, [
        ['Nume', 'Email', 'Rol', 'Zile active', 'Prima activitate', 'Ultima activitate'],
        ...users.map((user) => [user.name, user.email, roleLabel(user.role), user.activeDays, formatDate(user.firstSeenAt), formatDate(user.lastSeenAt)]),
      ]);
    } catch (err) {
      showToast({ variant: 'error', message: err instanceof Error ? err.message : 'Nu am putut exporta.' });
    } finally {
      setExportingId(null);
    }
  };

  const openPricing = (row: BillingRow) => {
    setPrice(row.pricePerUser == null ? '' : String(row.pricePerUser).replace('.', ','));
    setPricing(row);
  };

  const parsedPrice = price.trim() === '' ? null : Number(price.replace(',', '.'));
  const priceInvalid = parsedPrice != null && (!Number.isFinite(parsedPrice) || parsedPrice < 0);

  const savePrice = async () => {
    if (!pricing) return;
    setSaving(true);
    try {
      await superAdminApi.updateClub(pricing.clubId, { billingPricePerUser: price.trim() === '' ? null : price.trim() });
      showToast({ variant: 'success', message: `Prețul pentru ${pricing.name} a fost salvat.` });
      setPricing(null);
      void load(data?.month);
    } catch (err) {
      showToast({ variant: 'error', message: err instanceof Error ? err.message : 'Nu am putut salva prețul.' });
    } finally {
      setSaving(false);
    }
  };

  const monthOptions = (data?.months ?? []).map((key) => ({
    key,
    label: `${monthLabel(key).replace(/^./, (c) => c.toUpperCase())}${key === data?.currentMonth ? ' (în curs)' : ''}`,
  }));

  return (
    <PageContainer>
      <PageHeader
        keepTitleOnMobile
        title="Facturare"
        subtitle="Câți utilizatori activi a avut fiecare club și cât are de plătit."
        actions={<Button label="Export CSV" icon="file-download" iconOnlyOnMobile onPress={exportSummary} disabled={!data || loading} />}
      />

      <View className="gap-4">
        <View className="flex-col sm:flex-row gap-2">
          <SelectField<string>
            label="Luna"
            icon="calendar-month"
            value={data?.month ?? ''}
            onChange={(next) => setMonth(next)}
            options={monthOptions.length ? monthOptions : [{ key: '', label: 'Se încarcă…' }]}
            className="w-full sm:w-[260px]"
          />
          <SelectField<Sort>
            label="Sortare"
            icon="sort"
            value={sort}
            onChange={setSort}
            options={[{ key: 'amount', label: 'După sumă' }, { key: 'users', label: 'După utilizatori' }, { key: 'name', label: 'Alfabetic' }]}
            className="w-full sm:w-[200px]"
          />
        </View>

        <Notice icon="info-outline">
          Facturabil = un cont care a folosit aplicația cel puțin o dată în lună (super adminii nu se numără).
          {isCurrent ? ' Luna în curs se actualizează pe măsură ce oamenii intră în aplicație.' : ''}
        </Notice>
        {beforeTracking ? (
          <Notice tone="warning">
            Pentru această lună nu există date: activitatea se înregistrează {data?.trackingSince ? `din ${monthLabel(data.trackingSince)}` : 'de la următoarea autentificare a utilizatorilor'}.
          </Notice>
        ) : null}

        {error && !data ? (
          <ErrorState message={error} actionLabel="Încearcă din nou" onAction={() => void load(month)} />
        ) : !data ? (
          <View className="gap-3" accessibilityRole="progressbar" accessibilityLabel="Se încarcă facturarea">
            <View className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[112px] rounded-[16px]" />)}
            </View>
            <Skeleton className="h-[280px] rounded-[16px]" />
          </View>
        ) : (
          <View className="gap-4" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s ease' } as any}>
            <View className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <StatCard icon="groups" label="Facturabili" value={data.totals.billableUsers} hint={monthLabel(data.month)} />
              <StatCard icon="payments" tone="purple" label={isCurrent ? 'Estimat până acum' : 'Total de facturat'} value={formatMoney(data.totals.amount)} hint={`${plural(data.totals.pricedClubs, 'club cu preț', 'cluburi cu preț')}`} />
              <StatCard icon="apartment" tone="sky" label="Cluburi active" value={data.clubs.filter((row) => row.billableUsers > 0).length} hint={`din ${plural(data.clubs.length, 'club', 'cluburi')}`} />
              <StatCard
                icon="warning-amber"
                tone={data.totals.unpricedClubs ? 'warning' : 'neutral'}
                label="Fără preț"
                value={data.totals.unpricedClubs}
                hint={data.totals.unpricedClubs ? 'Cluburi active nefacturate' : 'Toate cluburile active au preț'}
              />
            </View>

            {rows.length === 0 ? (
              <EmptyState icon="payments" title="Niciun club" message="Creează un club ca să apară aici." />
            ) : (
              <ListShell
                header={(
                  <>
                    <HeaderCell flex={2.6}>Club</HeaderCell>
                    <HeaderCell align="right">Facturabili</HeaderCell>
                    <HeaderCell flex={1.2} align="right">Preț / utilizator</HeaderCell>
                    <HeaderCell flex={1.2} align="right">Total</HeaderCell>
                    <View className="w-10" />
                  </>
                )}
              >
                {rows.map((row, index) => (
                  <View
                    key={row.clubId}
                    className="flex-row items-center gap-3 px-3 py-2.5"
                    style={{ borderTopWidth: index ? 1 : 0, borderTopColor: 'var(--c-border)' } as any}
                  >
                    <Pressable
                      onPress={() => router.push(`/super-admin/clubs/${row.clubId}`)}
                      accessibilityRole="link"
                      className="flex-1 md:flex-[2.6] min-w-0"
                    >
                      <Text className="text-[14px] font-semibold hover:underline" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{row.name}</Text>
                      <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                        {row.billableUsers ? breakdown(row) : `Nicio activitate · ${plural(row.activeAccounts, 'cont activ', 'conturi active')}`}
                      </Text>
                      <Text className="t-meta md:hidden" style={{ color: 'var(--c-ink-soft)' }} numberOfLines={1}>
                        {plural(row.billableUsers, 'facturabil', 'facturabili')} × {row.pricePerUser != null ? formatMoney(row.pricePerUser) : 'fără preț'} = {formatMoney(row.amount)}
                      </Text>
                    </Pressable>
                    <Text className="hidden md:flex flex-1 justify-end text-[13px] font-semibold t-num" style={{ color: 'var(--c-ink)' }}>{formatNumber(row.billableUsers)}</Text>
                    <View className="hidden md:flex flex-[1.2] items-end">
                      <Pressable onPress={() => openPricing(row)} accessibilityRole="button" accessibilityLabel={`Setează prețul pentru ${row.name}`} className="ui-press flex-row items-center gap-1 rounded-[8px] px-2 py-1 hover:bg-[var(--c-surface-3)]">
                        <Text className="text-[13px] t-num" style={{ color: row.pricePerUser != null ? 'var(--c-ink-soft)' : 'var(--c-brand-fg)', fontWeight: row.pricePerUser != null ? '500' : '600' } as any}>
                          {row.pricePerUser != null ? formatMoney(row.pricePerUser) : 'Setează'}
                        </Text>
                        <MaterialIcons name="edit" size={13} color="var(--c-faint)" />
                      </Pressable>
                    </View>
                    <Text className="hidden md:flex flex-[1.2] justify-end text-[14px] font-bold t-num" style={{ color: row.amount != null ? 'var(--c-ink-strong)' : 'var(--c-faint)' }}>{formatMoney(row.amount)}</Text>
                    <View className="w-10 flex-row justify-end">
                      <Pressable
                        onPress={() => void exportClub(row)}
                        disabled={!row.billableUsers || exportingId != null}
                        accessibilityRole="button"
                        accessibilityLabel={`Descarcă lista utilizatorilor activi din ${row.name}`}
                        className="ui-press w-8 h-8 rounded-[9px] items-center justify-center hover:bg-[var(--c-surface-3)]"
                        style={{ opacity: row.billableUsers ? 1 : 0.35 } as any}
                      >
                        {exportingId === row.clubId
                          ? <ActivityIndicator size="small" color="var(--c-brand-fg)" />
                          : <MaterialIcons name="file-download" size={18} color="var(--c-muted)" />}
                      </Pressable>
                    </View>
                  </View>
                ))}
                <View className="flex-row items-center gap-3 px-3 py-3 border-t" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' }}>
                  <Text className="flex-1 md:flex-[2.6] text-[13px] font-bold" style={{ color: 'var(--c-ink)' }}>Total {monthLabel(data.month)}</Text>
                  <Text className="hidden md:flex flex-1 justify-end text-[13px] font-bold t-num" style={{ color: 'var(--c-ink)' }}>{formatNumber(data.totals.billableUsers)}</Text>
                  <View className="hidden md:flex flex-[1.2]" />
                  <Text className="md:flex-[1.2] text-right text-[15px] font-bold t-num" style={{ color: 'var(--c-ink-strong)' }}>{formatMoney(data.totals.amount)}</Text>
                  <View className="w-10" />
                </View>
              </ListShell>
            )}
          </View>
        )}
      </View>

      <ConfirmDialog
        visible={pricing != null}
        title={pricing ? `Preț pentru ${pricing.name}` : ''}
        message="Se aplică tuturor lunilor afișate, inclusiv celor trecute. Gol = clubul nu se facturează."
        icon="payments"
        confirmLabel="Salvează"
        loading={saving}
        confirmDisabled={priceInvalid}
        onConfirm={() => void savePrice()}
        onCancel={() => setPricing(null)}
      >
        <FormField
          label="Lei pe utilizator activ / lună"
          value={price}
          onChangeText={setPrice}
          placeholder="ex. 5"
          keyboardType="decimal-pad"
          error={priceInvalid ? 'Introdu o sumă validă, ex. 5 sau 4,50.' : null}
          hint={pricing && parsedPrice != null && !priceInvalid ? `${plural(pricing.billableUsers, 'utilizator', 'utilizatori')} × ${formatMoney(parsedPrice)} = ${formatMoney(Math.round(parsedPrice * pricing.billableUsers * 100) / 100)}` : undefined}
        />
      </ConfirmDialog>

      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </PageContainer>
  );
}
