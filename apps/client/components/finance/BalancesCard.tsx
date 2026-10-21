import { parseApiDate } from '@/utils/dates';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import Button from '../ui/Button';
import { FinanceCard, FinanceCardHeader } from './FinanceCard';
import ConfirmDialog from '../ui/ConfirmDialog';
import FilterChips from '../ui/FilterChips';
import SelectField from '../ui/SelectField';
import { financeApi, type BalanceFee, type PaymentAllocation, type PlayerBalanceSummary } from '../../services/financeApi';
import { balancesCsvRows, downloadCsv, paymentsCsvRows } from './financeCsv';
import { plural } from '../../utils/plural';
import { playerStatusLabel } from '../../utils/playerStatus';

/**
 * Finanțe → Restanțe și solduri. What every player owes, from the same
 * calculation as their own Plăți page, and a way to record a desk payment
 * (admins and the accountant). The server splits the amount over the fees —
 * ticked ones first, then the oldest — and the dialog shows that split
 * before saving, so a partial payment is visibly partial. The list holds
 * each player's totals; the dialog loads that one player's fees.
 */

type Filter = 'overdue' | 'owing' | 'all';
type Method = 'cash' | 'transfer' | 'card' | 'other';

const METHOD_OPTIONS: { key: Method; label: string }[] = [
    { key: 'cash', label: 'Numerar' },
    { key: 'transfer', label: 'Transfer bancar' },
    { key: 'card', label: 'Card (POS)' },
    { key: 'other', label: 'Altă metodă' },
];

const PAGE = 30;

/** The last 12 months as export choices, newest first. */
function exportMonths() {
    const now = new Date();
    return Array.from({ length: 12 }, (_, index) => {
        const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const label = new Intl.DateTimeFormat('ro-RO', { month: 'long', year: 'numeric' }).format(date);
        // "Octombrie 2026": the button next to it already says "Export plăți"
        // (the "Plăți octombrie …" label was cut off on phones).
        return { key, label: label.charAt(0).toUpperCase() + label.slice(1) };
    });
}

function money(amount: number, currency = 'ron') {
    try {
        return new Intl.NumberFormat('ro-RO', { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: 2 }).format(amount);
    } catch {
        return `${amount} ${currency.toUpperCase()}`;
    }
}

function shortDate(value: string | null) {
    if (!value) return null;
    const date = parseApiDate(value);
    return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function todayIso() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function rowMeta(balance: PlayerBalanceSummary, currency: string) {
    if (balance.state === 'paid') return balance.credit ? `La zi · avans ${money(balance.credit, currency)}` : 'La zi';
    if (balance.state === 'overdue') {
        const since = shortDate(balance.oldestOverdue);
        return `${plural(balance.overdueCount, 'taxă restantă', 'taxe restante')}${since ? ` · din ${since}` : ''}`;
    }
    return balance.oldestDueDate ? `Scadent ${shortDate(balance.oldestDueDate)}` : 'De plată';
}

export default function BalancesCard({ onPaymentRecorded }: { onPaymentRecorded?: () => void }) {
    const [balances, setBalances] = useState<PlayerBalanceSummary[]>([]);
    const [currency, setCurrency] = useState('ron');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<Filter>('overdue');
    const [query, setQuery] = useState('');
    const [visibleCount, setVisibleCount] = useState(PAGE);

    const [target, setTarget] = useState<PlayerBalanceSummary | null>(null);
    // The target's fees, loaded when the dialog opens (null while loading).
    const [targetFees, setTargetFees] = useState<BalanceFee[] | null>(null);
    const [feesError, setFeesError] = useState<string | null>(null);
    const targetIdRef = useRef<number | null>(null);
    targetIdRef.current = target?.playerId ?? null;
    const [selectedFees, setSelectedFees] = useState<Set<string>>(new Set());
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState<Method>('cash');
    const [date, setDate] = useState(todayIso());
    const [description, setDescription] = useState('');
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [allocation, setAllocation] = useState<PaymentAllocation | null>(null);
    const [allocating, setAllocating] = useState(false);
    const monthOptions = useMemo(exportMonths, []);
    const [exportMonth, setExportMonth] = useState(monthOptions[0].key);
    const [exporting, setExporting] = useState(false);
    const [exportingBalances, setExportingBalances] = useState(false);

    // The list has totals only: the export asks for every fee once, on demand,
    // and keeps the rows (and order) on screen.
    const exportBalances = async () => {
        setExportingBalances(true);
        try {
            const data = await financeApi.getBalancesWithFees();
            const byId = new Map(data.players.map((balance) => [balance.playerId, balance]));
            const rows = filtered.map((row) => byId.get(row.playerId)).filter((balance): balance is NonNullable<typeof balance> => Boolean(balance));
            downloadCsv(balancesCsvRows(rows), 'solduri-jucatori.csv');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nu am putut exporta soldurile.');
        } finally {
            setExportingBalances(false);
        }
    };

    const exportPayments = async () => {
        setExporting(true);
        try {
            const [year, month] = exportMonth.split('-').map(Number);
            const last = new Date(year, month, 0).getDate();
            const data = await financeApi.getPaymentsExport(`${exportMonth}-01`, `${exportMonth}-${String(last).padStart(2, '0')}`);
            downloadCsv(paymentsCsvRows(data.payments), `plati-${exportMonth}.csv`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nu am putut exporta plățile.');
        } finally {
            setExporting(false);
        }
    };

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await financeApi.getBalances();
            setBalances(data.players);
            setCurrency(data.currency || 'ron');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nu am putut încărca soldurile.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const counts = useMemo(() => ({
        overdue: balances.filter((b) => b.state === 'overdue').length,
        owing: balances.filter((b) => b.outstanding > 0).length,
        all: balances.length,
    }), [balances]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return balances.filter((balance) => {
            if (filter === 'overdue' && balance.state !== 'overdue') return false;
            if (filter === 'owing' && balance.outstanding <= 0) return false;
            if (q && !`${balance.playerName} ${balance.teamName ?? ''}`.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [balances, filter, query]);

    const loadTargetFees = useCallback(async (playerId: number) => {
        setTargetFees(null);
        setFeesError(null);
        try {
            const { fees } = await financeApi.getPlayerBalance(playerId);
            // The admin may have closed the dialog or opened another player meanwhile.
            if (targetIdRef.current !== playerId) return;
            // Pre-select what is late (or everything owed when nothing is late yet).
            const preset = fees.filter((fee) => fee.status === 'overdue');
            const chosen = preset.length ? preset : fees;
            setTargetFees(fees);
            setSelectedFees(new Set(chosen.map((fee) => fee.id)));
            setAmount(String(chosen.reduce((sum, fee) => sum + fee.amount, 0)));
        } catch (err) {
            if (targetIdRef.current === playerId) setFeesError(err instanceof Error ? err.message : 'Nu am putut încărca taxele jucătorului.');
        }
    }, []);

    const openPayment = (balance: PlayerBalanceSummary) => {
        targetIdRef.current = balance.playerId;
        setTarget(balance);
        setSelectedFees(new Set());
        setAmount('');
        setMethod('cash');
        setDate(todayIso());
        setDescription('');
        setFormError(null);
        void loadTargetFees(balance.playerId);
    };

    const toggleFee = (fee: BalanceFee) => {
        if (!targetFees) return;
        setSelectedFees((current) => {
            const next = new Set(current);
            if (next.has(fee.id)) next.delete(fee.id); else next.add(fee.id);
            setAmount(String(targetFees.filter((item) => next.has(item.id)).reduce((sum, item) => sum + item.amount, 0)));
            return next;
        });
    };

    const parsedAmount = Number(amount.replace(',', '.'));
    const validAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(date).getTime()) && date <= todayIso();
    const canSave = !saving && validAmount && validDate;
    const selectedKey = Array.from(selectedFees).sort().join(',');

    // Ask the server how this amount would be split (the same calculation the
    // save uses), a moment after the admin stops typing.
    useEffect(() => {
        setAllocation(null);
        if (!target || !validAmount) return undefined;
        let cancelled = false;
        setAllocating(true);
        const timer = setTimeout(() => {
            financeApi.previewManualPayment({ playerId: target.playerId, amount: parsedAmount, feeIds: selectedKey ? selectedKey.split(',') : [] })
                .then((result) => { if (!cancelled) setAllocation(result); })
                // An older server has no preview: the dialog still saves.
                .catch(() => { if (!cancelled) setAllocation(null); })
                .finally(() => { if (!cancelled) setAllocating(false); });
        }, 300);
        return () => { cancelled = true; clearTimeout(timer); setAllocating(false); };
    }, [target, validAmount, parsedAmount, selectedKey]);

    const savePayment = async () => {
        if (!target || !canSave) return;
        setSaving(true);
        setFormError(null);
        try {
            await financeApi.createManualPayment({
                playerId: target.playerId,
                amount: parsedAmount,
                feeIds: Array.from(selectedFees),
                method,
                date,
                description: description.trim() || undefined,
            });
            setTarget(null);
            await load();
            onPaymentRecorded?.();
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Nu am putut înregistra plata.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <FinanceCard className="mb-5">
            <FinanceCardHeader
                icon="account-balance-wallet"
                tone="brand"
                title="Restanțe și solduri"
                subtitle="Calculat la fel ca pe pagina de plăți a fiecărui jucător."
                wideActions
                actions={
                    // Two groups that each stay on one line: balances (export, reload)
                    // and payments (month + export); on phones each fills the width.
                    <View className="flex-col lg:flex-row lg:items-center gap-2 w-full lg:w-auto">
                        <View className="flex-row items-center gap-2">
                            <Button size="sm" icon="file-download" label="Export solduri" className="flex-1 lg:flex-none" loading={exportingBalances} disabled={loading || !balances.length} onPress={() => void exportBalances()} />
                            <Button size="sm" icon="refresh" label="Reîncarcă" iconOnlyOnMobile onPress={() => void load()} disabled={loading} />
                        </View>
                        <View className="flex-row items-center gap-2">
                            <SelectField<string> label="Luna exportului de plăți" value={exportMonth} onChange={setExportMonth} options={monthOptions} className="flex-1 min-w-0 lg:flex-none lg:w-[170px]" />
                            <Button size="sm" icon="file-download" label="Export plăți" loading={exporting} onPress={() => void exportPayments()} />
                        </View>
                    </View>
                }
            />

            <View className="flex-col md:flex-row md:items-center gap-2 mb-3">
                <FilterChips<Filter>
                    label="Filtru solduri"
                    value={filter}
                    onChange={(next) => { setFilter(next); setVisibleCount(PAGE); }}
                    options={[
                        { key: 'overdue', label: 'Cu restanțe', count: counts.overdue, dot: 'var(--c-danger)' },
                        { key: 'owing', label: 'De plată', count: counts.owing, dot: 'var(--c-warning)' },
                        { key: 'all', label: 'Toți', count: counts.all },
                    ]}
                />
                <View className="flex-row items-center gap-2 rounded-[10px] px-3 h-9 border md:ml-auto md:w-[240px]" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}>
                    <MaterialIcons name="search" size={15} color="var(--c-faint)" />
                    <TextInput
                        value={query}
                        onChangeText={(text: string) => { setQuery(text); setVisibleCount(PAGE); }}
                        placeholder="Caută jucător sau echipă"
                        placeholderTextColor="var(--c-faint)"
                        accessibilityLabel="Caută jucător sau echipă"
                        className="flex-1 text-[13px]"
                        style={{ color: 'var(--c-ink)' }}
                    />
                </View>
            </View>

            {loading ? (
                <View className="py-8 items-center" accessibilityRole="progressbar" accessibilityLabel="Se încarcă soldurile">
                    <ActivityIndicator size="small" color="var(--c-brand-fg)" />
                </View>
            ) : error ? (
                <View className="py-6 items-center gap-2">
                    <Text className="text-[13px] font-medium" style={{ color: 'var(--c-danger-fg)' }}>{error}</Text>
                    <Button size="sm" label="Încearcă din nou" onPress={() => void load()} />
                </View>
            ) : filtered.length === 0 ? (
                <View className="py-6 items-center">
                    <Text className="text-[13px] font-medium" style={{ color: 'var(--c-muted)' }}>
                        {filter === 'overdue' ? 'Nicio restanță. Toți jucătorii sunt la zi.' : 'Niciun jucător nu corespunde filtrului.'}
                    </Text>
                </View>
            ) : (
                <View className="rounded-[12px] border overflow-hidden" style={{ borderColor: 'var(--c-border)' } as any}>
                    {filtered.slice(0, visibleCount).map((balance, index) => {
                        const late = balance.state === 'overdue';
                        return (
                            <View
                                key={balance.playerId}
                                className={`flex-row items-center gap-3 px-3.5 py-2.5 ${index ? 'border-t' : ''}`}
                                style={{ borderColor: 'var(--c-border)' } as any}
                            >
                                <View className="flex-1 min-w-0">
                                    <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
                                        {balance.playerName}{balance.status === 'inactive' ? ` (${playerStatusLabel(balance.status).toLowerCase()})` : ''}
                                    </Text>
                                    <Text className="t-meta mt-0.5" style={{ color: late ? 'var(--c-danger-fg)' : 'var(--c-muted)' }} numberOfLines={1}>
                                        {[balance.teamName, rowMeta(balance, currency)].filter(Boolean).join(' · ')}
                                    </Text>
                                </View>
                                <View className="items-end shrink-0">
                                    <Text className="t-num text-[14px] font-bold" style={{ color: late ? 'var(--c-danger-fg)' : 'var(--c-ink)' }}>
                                        {money(balance.outstanding, currency)}
                                    </Text>
                                    {late && balance.overdue !== balance.outstanding ? (
                                        <Text className="text-[11px] font-medium" style={{ color: 'var(--c-danger-fg)' }}>{money(balance.overdue, currency)} restant</Text>
                                    ) : null}
                                </View>
                                {balance.outstanding > 0 ? (
                                    <Button size="sm" variant="primary" icon="payments" label="Încasează" iconOnlyOnMobile accessibilityLabel={`Încasează de la ${balance.playerName}`} onPress={() => openPayment(balance)} />
                                ) : null}
                            </View>
                        );
                    })}
                </View>
            )}

            {!loading && filtered.length > visibleCount ? (
                <View className="items-center mt-3">
                    <Button size="sm" variant="ghost" label={`Arată încă ${Math.min(PAGE, filtered.length - visibleCount)} (din ${filtered.length})`} onPress={() => setVisibleCount((count) => count + PAGE)} />
                </View>
            ) : null}

            <ConfirmDialog
                visible={target != null}
                title={target ? `Încasare · ${target.playerName}` : ''}
                message="Bifează taxele pe care le acoperă plata. Suma se completează din ele și se împarte de la cea mai veche; o sumă mai mică le achită parțial."
                confirmLabel="Înregistrează plata"
                loading={saving}
                confirmDisabled={!canSave}
                icon="payments"
                onConfirm={() => void savePayment()}
                onCancel={() => { if (!saving) setTarget(null); }}
            >
                {target ? (
                    <View className="gap-3">
                        <View className="rounded-[10px] border overflow-hidden" style={{ borderColor: 'var(--c-border)', maxHeight: 220, overflowY: 'auto' } as any}>
                            {targetFees == null ? (
                                feesError ? (
                                    <View className="px-3 py-3 gap-2 items-start">
                                        <Text className="text-[12.5px] font-medium" style={{ color: 'var(--c-danger-fg)' }}>{feesError}</Text>
                                        <Button size="sm" label="Încearcă din nou" onPress={() => void loadTargetFees(target.playerId)} />
                                    </View>
                                ) : (
                                    <View className="py-4 items-center" accessibilityRole="progressbar" accessibilityLabel="Se încarcă taxele">
                                        <ActivityIndicator size="small" color="var(--c-brand-fg)" />
                                    </View>
                                )
                            ) : targetFees.map((fee, index) => {
                                const checked = selectedFees.has(fee.id);
                                return (
                                    <Pressable
                                        key={fee.id}
                                        onPress={() => toggleFee(fee)}
                                        // The web shim renders Pressable as role=button: a toggle
                                        // button announces its state through aria-pressed.
                                        {...({ 'aria-pressed': checked } as any)}
                                        accessibilityLabel={`${fee.label}, ${money(fee.amount, currency)}`}
                                        // shrink-0: inside the scrolling list a row must keep its height, or its two lines overlap.
                                        className={`flex-row items-center gap-2.5 px-3 py-2 shrink-0 ${index ? 'border-t' : ''}`}
                                        style={{ borderColor: 'var(--c-border)' } as any}
                                    >
                                        <MaterialIcons name={checked ? 'check-box' : 'check-box-outline-blank'} size={18} color={checked ? 'var(--c-brand-fg)' : 'var(--c-faint)'} />
                                        <View className="flex-1 min-w-0">
                                            <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{fee.label}</Text>
                                            <Text className="text-[11.5px]" style={{ color: fee.status === 'overdue' ? 'var(--c-danger-fg)' : 'var(--c-muted)' }}>
                                                {fee.status === 'overdue' ? 'Restanță' : 'Scadent'}{fee.dueDate ? ` · ${shortDate(fee.dueDate)}` : ''}
                                                {fee.paidAmount ? ` · achitat ${money(fee.paidAmount, currency)} din ${money(fee.amount + fee.paidAmount, currency)}` : ''}
                                            </Text>
                                        </View>
                                        <Text className="t-num text-[13px] font-bold" style={{ color: 'var(--c-ink)' }}>{money(fee.amount, currency)}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        <View className="flex-row gap-2">
                            <View className="flex-1">
                                <Text className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--c-muted)' }}>Suma (RON)</Text>
                                <TextInput
                                    value={amount}
                                    onChangeText={setAmount}
                                    keyboardType="decimal-pad"
                                    accessibilityLabel="Suma încasată"
                                    className="h-10 rounded-[10px] px-3 border text-[15px] font-bold"
                                    style={{ borderColor: 'var(--c-border)', color: 'var(--c-ink)', backgroundColor: 'var(--c-surface)' } as any}
                                />
                            </View>
                            <View className="flex-1">
                                <Text className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--c-muted)' }}>Data</Text>
                                <TextInput
                                    value={date}
                                    onChangeText={setDate}
                                    placeholder="AAAA-LL-ZZ"
                                    accessibilityLabel="Data plății"
                                    className="h-10 rounded-[10px] px-3 border text-[14px]"
                                    style={{ borderColor: validDate ? 'var(--c-border)' : 'var(--c-danger-border)', color: 'var(--c-ink)', backgroundColor: 'var(--c-surface)' } as any}
                                />
                            </View>
                        </View>

                        <AllocationPreview
                            allocation={allocation}
                            loading={allocating}
                            visible={validAmount}
                            noneSelected={selectedFees.size === 0}
                            currency={currency}
                        />

                        <SelectField<Method> label="Metoda de plată" value={method} onChange={setMethod} options={METHOD_OPTIONS} />

                        <TextInput
                            value={description}
                            onChangeText={setDescription}
                            placeholder="Notă (opțional) — ex. nr. chitanță"
                            placeholderTextColor="var(--c-faint)"
                            accessibilityLabel="Notă"
                            maxLength={500}
                            className="h-10 rounded-[10px] px-3 border text-[13px]"
                            style={{ borderColor: 'var(--c-border)', color: 'var(--c-ink)', backgroundColor: 'var(--c-surface)' } as any}
                        />

                        {!validDate ? (
                            <Text className="text-[12px]" style={{ color: 'var(--c-danger-fg)' }}>Data trebuie să fie de forma AAAA-LL-ZZ și nu poate fi în viitor.</Text>
                        ) : null}
                        {formError ? <Text className="text-[12px] font-medium" style={{ color: 'var(--c-danger-fg)' }}>{formError}</Text> : null}
                    </View>
                ) : null}
            </ConfirmDialog>
        </FinanceCard>
    );
}

/** „Cum se împarte plata”: what each fee gets from the amount typed. */
function AllocationPreview({ allocation, loading, visible, noneSelected, currency }: {
    allocation: PaymentAllocation | null;
    loading: boolean;
    visible: boolean;
    noneSelected: boolean;
    currency: string;
}) {
    if (!visible) return null;
    return (
        <View
            className="rounded-[10px] border px-3 py-2.5 gap-1.5"
            style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}
            accessibilityLabel="Cum se împarte plata"
            {...({ 'aria-live': 'polite' } as any)}
        >
            <View className="flex-row items-center justify-between gap-2">
                <Text className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--c-muted)' }}>Cum se împarte plata</Text>
                {loading ? <ActivityIndicator size="small" color="var(--c-faint)" /> : null}
            </View>
            {noneSelected ? (
                <Text className="text-[12px]" style={{ color: 'var(--c-muted)' }}>Nicio taxă bifată: suma merge pe cele mai vechi taxe.</Text>
            ) : null}
            {allocation ? (
                <>
                    {allocation.lines.map((line) => {
                        const settled = line.owedAfter <= 0;
                        return (
                            <View key={line.feeId} className="flex-row items-start gap-2">
                                <MaterialIcons
                                    name={settled ? 'check-circle' : 'access-time'}
                                    size={15}
                                    color={settled ? 'var(--c-success-fg)' : 'var(--c-warning-fg)'}
                                />
                                <View className="flex-1 min-w-0">
                                    <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{line.label}</Text>
                                    <Text className="text-[11.5px]" style={{ color: settled ? 'var(--c-muted)' : 'var(--c-warning-fg)' }}>
                                        {settled ? 'Achitată integral' : `Parțial · rămân ${money(line.owedAfter, currency)}`}
                                    </Text>
                                </View>
                                <Text className="t-num text-[12.5px] font-bold" style={{ color: 'var(--c-ink)' }}>{money(line.applied, currency)}</Text>
                            </View>
                        );
                    })}
                    {allocation.credit > 0 ? (
                        <View className="flex-row items-start gap-2">
                            <MaterialIcons name="account-balance-wallet" size={15} color="var(--c-brand-fg)" />
                            <Text className="flex-1 text-[12px]" style={{ color: 'var(--c-ink-soft)' }}>
                                Avans {money(allocation.credit, currency)}: depășește tot ce e de plată și acoperă automat următoarele taxe.
                            </Text>
                        </View>
                    ) : null}
                </>
            ) : !loading ? (
                <Text className="text-[12px]" style={{ color: 'var(--c-muted)' }}>Împărțirea nu e disponibilă acum; plata se salvează oricum.</Text>
            ) : null}
        </View>
    );
}
