import { parseApiDate } from '@/utils/dates';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, ActivityIndicator } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import Button from '../ui/Button';
import { FinanceCard, FinanceCardHeader } from './FinanceCard';
import ConfirmDialog from '../ui/ConfirmDialog';
import FilterChips from '../ui/FilterChips';
import SelectField from '../ui/SelectField';
import ActionSheet, { type SheetAction } from '../ui/ActionSheet';
import { financeApi, type BalanceFee, type PaymentAllocation, type PlayerBalanceSummary } from '../../services/financeApi';
import { teamsApi } from '../../services/teamsApi';
import type { ToastVariant } from '../ui/Toast';
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
        // "Octombrie 2026": the sheet's title already asks which month's payments.
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
    if (balance.state === 'paid') return balance.credit ? `Plătit · avans ${money(balance.credit, currency)}` : 'Plătit';
    if (balance.state === 'overdue') {
        const since = shortDate(balance.oldestOverdue);
        return `${plural(balance.overdueCount, 'taxă restantă', 'taxe restante')}${since ? ` · din ${since}` : ''}`;
    }
    return balance.oldestDueDate ? `Scadent ${shortDate(balance.oldestDueDate)}` : 'De plată';
}

export type RecordedPayment = { paymentId: number | null; amount: number; playerName: string; currency: string; undoWindowMs: number };

/**
 * `onPaymentRecorded` gets what the page needs for its confirmation (and the
 * „Anulează” it offers); `reloadKey` is bumped by the page after a storno so
 * the balances follow.
 */
export default function BalancesCard({ onPaymentRecorded, onNotify, reloadKey = 0 }: {
    onPaymentRecorded?: (payment: RecordedPayment) => void;
    /** Where the reminder outcome is said (the page's toasts). */
    onNotify?: (toast: { variant: ToastVariant; message: string }) => void;
    reloadKey?: number;
}) {
    const [balances, setBalances] = useState<PlayerBalanceSummary[]>([]);
    // Payment reminders, as on Lot: they notify families, so only after a confirmation.
    const [confirmReminders, setConfirmReminders] = useState(false);
    const [sendingReminders, setSendingReminders] = useState(false);
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
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState<Method>('cash');
    const [date, setDate] = useState(todayIso());
    const [description, setDescription] = useState('');
    // The suggested amount, to tell a typed one apart; and the „drop it?” question.
    const [suggestedAmount, setSuggestedAmount] = useState('');
    const [confirmDiscard, setConfirmDiscard] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [allocation, setAllocation] = useState<PaymentAllocation | null>(null);
    const [allocating, setAllocating] = useState(false);
    const monthOptions = useMemo(exportMonths, []);
    const [exporting, setExporting] = useState(false);
    // One „Exportă” menu instead of two buttons and a month picker in the header:
    // first what (balances / payments), then for payments which month.
    const [exportStep, setExportStep] = useState<'closed' | 'what' | 'month'>('closed');
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

    const exportPayments = async (exportMonth: string) => {
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

    useEffect(() => { void load(); }, [load, reloadKey]);

    const counts = useMemo(() => ({
        overdue: balances.filter((b) => b.state === 'overdue').length,
        owing: balances.filter((b) => b.outstanding > 0).length,
        all: balances.length,
    }), [balances]);

    const sendReminders = async () => {
        setSendingReminders(true);
        try {
            const result = await teamsApi.sendPaymentReminders();
            const owing = result.players ?? result.recipients.length;
            const skipped = result.skipped ?? 0;
            onNotify?.(owing
                ? {
                    variant: 'success',
                    message: `${plural(result.sent, 'notificare trimisă', 'notificări trimise')} pentru ${plural(owing, 'jucător cu restanțe', 'jucători cu restanțe')}.${skipped ? ` ${plural(skipped, 'cont a primit', 'conturi au primit')} deja un memento în ultimele 7 zile.` : ''}`,
                }
                : { variant: 'info', message: 'Nimeni nu are restanțe. Plățile care nu au ajuns la scadență nu primesc memento.' });
            setConfirmReminders(false);
        } catch (error) {
            onNotify?.({ variant: 'error', message: error instanceof Error ? error.message : 'Mementourile de plată nu au putut fi trimise.' });
        } finally {
            setSendingReminders(false);
        }
    };

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
            // Suggest what is late (or everything owed when nothing is late yet).
            const preset = fees.filter((fee) => fee.status === 'overdue');
            const chosen = preset.length ? preset : fees;
            setTargetFees(fees);
            // Only into an empty field: on a slow connection the fees arrive after
            // the admin typed a sum, which used to be replaced without a word.
            const suggestion = String(chosen.reduce((sum, fee) => sum + fee.amount, 0));
            setSuggestedAmount(suggestion);
            setAmount((current) => (current.trim() ? current : suggestion));
        } catch (err) {
            if (targetIdRef.current === playerId) setFeesError(err instanceof Error ? err.message : 'Nu am putut încărca taxele jucătorului.');
        }
    }, []);

    const openPayment = (balance: PlayerBalanceSummary) => {
        targetIdRef.current = balance.playerId;
        setTarget(balance);
        setAmount('');
        setSuggestedAmount('');
        setMethod('cash');
        setDate(todayIso());
        setDescription('');
        setFormError(null);
        void loadTargetFees(balance.playerId);
    };

    // The typed amount is the only input: the server splits it oldest first
    // and each fee row shows what it gets. Ticks used to be a second model that
    // rewrote the amount and disagreed with the split.
    const amountText = amount.trim().replace(/\s/g, '').replace(',', '.');
    const parsedAmount = /^\d+(\.\d{1,2})?$/.test(amountText) ? Number(amountText) : NaN;
    const validAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
    const amountError = !amount.trim() || validAmount
        ? null
        : Number.isFinite(parsedAmount) ? 'Introdu o sumă mai mare ca 0.' : 'Scrie suma în cifre, de ex. 150 sau 150,50.';
    const appliedByFee = useMemo(() => new Map((allocation?.lines ?? []).map((line) => [line.feeId, line])), [allocation]);
    // What the server's split leaves over after every fee: booked as an advance.
    const advance = validAmount && allocation ? allocation.credit : 0;
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(date).getTime()) && date <= todayIso();
    const canSave = !saving && validAmount && validDate;

    // Ask the server how this amount would be split (the same calculation the
    // save uses), a moment after the admin stops typing.
    useEffect(() => {
        setAllocation(null);
        if (!target || !validAmount) return undefined;
        let cancelled = false;
        setAllocating(true);
        const timer = setTimeout(() => {
            financeApi.previewManualPayment({ playerId: target.playerId, amount: parsedAmount })
                .then((result) => { if (!cancelled) setAllocation(result); })
                // An older server has no preview: the dialog still saves.
                .catch(() => { if (!cancelled) setAllocation(null); })
                .finally(() => { if (!cancelled) setAllocating(false); });
        }, 300);
        return () => { cancelled = true; clearTimeout(timer); setAllocating(false); };
    }, [target, validAmount, parsedAmount]);

    const savePayment = async () => {
        if (!target || !canSave) return;
        setSaving(true);
        setFormError(null);
        try {
            const result = await financeApi.createManualPayment({
                playerId: target.playerId,
                amount: parsedAmount,
                method,
                date,
                description: description.trim() || undefined,
            });
            const playerName = target.playerName;
            setTarget(null);
            await load();
            onPaymentRecorded?.({
                paymentId: result.payment?.id ?? null,
                amount: parsedAmount,
                playerName,
                currency,
                undoWindowMs: result.undoWindowMs ?? 0,
            });
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
                    // Two controls, not four: the exports (balances, a month of payments)
                    // live in one menu.
                    <View className="flex-row items-center gap-2">
                        <Button size="sm" icon="file-download" label="Exportă" loading={exporting || exportingBalances} onPress={() => setExportStep('what')} />
                        <Button size="sm" icon="refresh" label="Reîncarcă" iconOnlyOnMobile onPress={() => void load()} disabled={loading} />
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
                        { key: 'owing', label: 'De plată', count: counts.owing, dot: 'var(--c-faint)' },
                        { key: 'all', label: 'Toți', count: counts.all },
                    ]}
                />
                {/* Reminders lived only on Lot; this is where the arrears are worked. */}
                {counts.overdue > 0 ? (
                    <Button
                        size="sm"
                        icon="notifications-active"
                        label={`Trimite mementouri (${counts.overdue})`}
                        loading={sendingReminders}
                        onPress={() => setConfirmReminders(true)}
                        className="self-start md:self-auto"
                    />
                ) : null}
                <View className="flex-row items-center gap-2 rounded-[10px] px-3 h-9 [@media(pointer:coarse)]:h-[42px] border md:ml-auto md:w-[240px]" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}>
                    <MaterialIcons name="search" size={15} color="var(--c-faint)" />
                    <TextInput
                        value={query}
                        onChangeText={(text: string) => { setQuery(text); setVisibleCount(PAGE); }}
                        placeholder="Caută jucător sau echipă"
                        placeholderTextColor="var(--c-faint)"
                        accessibilityLabel="Caută jucător sau echipă"
                        className="flex-1 self-stretch text-[13px]"
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
                    <Button size="sm" icon="refresh" label="Reîncearcă" onPress={() => void load()} />
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
                                {/* Phone: the reason („2 taxe restante · din …”) gets the full width under name and
                                    amount, where it used to be cut. md+: it sits under the name, the amount spans both rows. */}
                                <View className="flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-start">
                                    <Text className="col-span-2 md:col-span-1 col-start-1 row-start-1 min-w-0 text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
                                        {balance.playerName}{balance.status === 'inactive' ? ` (${playerStatusLabel(balance.status).toLowerCase()})` : ''}
                                    </Text>
                                    {/* The amount to chase leads: what is past due, not the total that includes fees not yet due. */}
                                    {/* Phones: under the name, so the "Încasează" button and the amount stack no
                                        longer squeeze the name to "L…". md+: right column, spanning both rows. */}
                                    <View className="col-span-2 row-start-2 flex-row flex-wrap items-baseline gap-x-1.5 md:col-span-1 md:col-start-2 md:row-start-1 md:row-span-2 md:flex-col md:items-end md:self-center">
                                        <Text className="t-num text-[14px] font-bold" style={{ color: late ? 'var(--c-danger-fg)' : 'var(--c-ink)' }}>
                                            {money(late ? balance.overdue : balance.outstanding, currency)}
                                        </Text>
                                        {late ? (
                                            <Text className="t-meta t-num" style={{ color: 'var(--c-muted)' }}>
                                                {balance.overdue !== balance.outstanding ? `restant din ${money(balance.outstanding, currency)}` : 'restant'}
                                            </Text>
                                        ) : null}
                                    </View>
                                    <Text className="col-span-2 md:col-span-1 row-start-3 md:row-start-2 t-meta mt-0.5" style={{ color: 'var(--c-muted)' }} numberOfLines={2}>
                                        {[balance.teamName, rowMeta(balance, currency)].filter(Boolean).join(' · ')}
                                    </Text>
                                </View>
                                {balance.outstanding > 0 ? (
                                    <Button size="sm" variant="primary" icon="payments" label="Încasează" accessibilityLabel={`Încasează de la ${balance.playerName}`} onPress={() => openPayment(balance)} />
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

            <ActionSheet
                visible={exportStep !== 'closed'}
                title={exportStep === 'month' ? 'Plățile din ce lună?' : 'Exportă (CSV)'}
                subtitle={exportStep === 'month' ? 'Toate încasările lunii alese.' : undefined}
                onClose={() => setExportStep('closed')}
                actions={exportStep === 'month'
                    ? monthOptions.map((option): SheetAction => ({ key: option.key, label: option.label, icon: 'event', onPress: () => void exportPayments(option.key) }))
                    : [
                        ...(balances.length ? [{ key: 'balances', label: 'Solduri', icon: 'account-balance-wallet', hint: 'Jucătorii din listă, cu restanța și ce mai e de plată.', onPress: () => void exportBalances() }] : []),
                        { key: 'payments', label: 'Plăți pe o lună', icon: 'payments', hint: 'Alegi luna la pasul următor.', keepOpen: true, onPress: () => setExportStep('month') },
                    ]}
            />

            <ConfirmDialog
                visible={confirmReminders}
                title="Trimiți mementouri de plată?"
                message={`${counts.overdue === 1 ? 'Jucătorul cu restanțe primește' : `Cei ${plural(counts.overdue, 'jucător', 'jucători')} cu restanțe primesc`}, împreună cu părinții, o notificare în aplicație. Cine a primit deja un memento în ultimele 7 zile nu îl mai primește acum.`}
                confirmLabel="Trimite mementouri"
                // Families get notified: it opens on „Renunță”, Enter alone doesn't send.
                focusCancel
                icon="notifications-active"
                loading={sendingReminders}
                onConfirm={() => void sendReminders()}
                onCancel={() => { if (!sendingReminders) setConfirmReminders(false); }}
            />

            <ConfirmDialog
                visible={target != null}
                title={target ? `Încasare · ${target.playerName}` : ''}
                // What is owed, before anything else: the amount used to be checked against a row left behind.
                message={target
                    ? `${target.overdue > 0 ? `Restant ${money(target.overdue, currency)} · ` : ''}de plătit ${money(target.outstanding, currency)}. Suma se împarte de la cea mai veche taxă.`
                    : undefined}
                // The amount on the button: the last look before it is booked. The
                // advance it leaves sits on its own line right above, in a warning
                // tone with the button (on the button, a long label pushed
                // „Renunță” out of the card).
                confirmLabel={validAmount ? `Înregistrează ${money(parsedAmount, currency)}` : 'Înregistrează plata'}
                confirmVariant={validAmount && advance > 0 ? 'warning' : undefined}
                // One warning, fixed above the buttons (it was also repeated inside the form).
                footerNote={validAmount && advance > 0 ? `${money(advance, currency)} peste tot ce e de plată: rămân avans pentru taxele următoare. Verifică suma.` : undefined}
                loading={saving}
                confirmDisabled={!canSave}
                icon="payments"
                role="dialog"
                // Phones: a bottom sheet with the name on top and the button always in reach.
                sheetOnPhone
                dismissOnBackdrop={false}
                onConfirm={() => void savePayment()}
                // Esc and „Renunță” used to drop a typed amount and receipt note at once.
                onCancel={() => {
                    if (saving) return;
                    const typed = (amount.trim() && amount.trim() !== suggestedAmount) || description.trim();
                    if (typed) setConfirmDiscard(true);
                    else setTarget(null);
                }}
            >
                {target ? (
                    <View className="gap-3">
                        <View className="rounded-[10px] border overflow-hidden" style={{ borderColor: 'var(--c-border)' } as any}>
                            {/* What the typed amount does, in one line that is announced as it changes. */}
                            <View
                                className="flex-row items-center justify-between gap-2 px-3 py-2 border-b"
                                style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}
                                {...({ 'aria-live': 'polite' } as any)}
                            >
                                <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>Cum se împarte plata</Text>
                                {allocating ? (
                                    <ActivityIndicator size="small" color="var(--c-faint)" />
                                ) : (
                                    <Text className="text-[12px] text-right" style={{ color: 'var(--c-muted)' }}>{splitSummary(allocation, validAmount, targetFees != null)}</Text>
                                )}
                            </View>
                            <View style={{ maxHeight: 220, overflowY: 'auto' } as any}>
                                {targetFees == null ? (
                                    feesError ? (
                                        <View className="px-3 py-3 gap-2 items-start">
                                            <Text className="text-[12.5px] font-medium" style={{ color: 'var(--c-danger-fg)' }}>{feesError}</Text>
                                            <Button size="sm" label="Reîncearcă" onPress={() => void loadTargetFees(target.playerId)} />
                                        </View>
                                    ) : (
                                        <View className="py-4 items-center" accessibilityRole="progressbar" accessibilityLabel="Se încarcă taxele">
                                            <ActivityIndicator size="small" color="var(--c-brand-fg)" />
                                        </View>
                                    )
                                ) : targetFees.map((fee, index) => {
                                    const line = appliedByFee.get(fee.id);
                                    const settled = Boolean(line && line.owedAfter <= 0);
                                    const effect = !validAmount || !allocation
                                        ? null
                                        : !line
                                            ? { icon: 'radio-button-unchecked', color: 'var(--c-faint)', text: 'Neatinsă' }
                                            : settled
                                                ? { icon: 'check-circle', color: 'var(--c-success-fg)', text: 'Achitată integral' }
                                                : { icon: 'access-time', color: 'var(--c-warning-fg)', text: `Parțial · rămân ${money(line.owedAfter, currency)}` };
                                    return (
                                        <View
                                            key={fee.id}
                                            // shrink-0: inside the scrolling list a row must keep its height, or its lines overlap.
                                            className={`flex-row items-start gap-2.5 px-3 py-2 shrink-0 ${index ? 'border-t' : ''}`}
                                            style={{ borderColor: 'var(--c-border)' } as any}
                                        >
                                            <View className="flex-1 min-w-0">
                                                {/* Two lines: on a phone „Contribuție antrenament …” lost its month and two rows read the same. */}
                                                <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={2}>{fee.label}</Text>
                                                <Text className="text-[11.5px]" style={{ color: fee.status === 'overdue' ? 'var(--c-danger-fg)' : 'var(--c-muted)' }}>
                                                    {fee.status === 'overdue' ? 'Restanță' : 'Scadent'}{fee.dueDate ? ` · ${shortDate(fee.dueDate)}` : ''}
                                                    {fee.paidAmount ? ` · achitat ${money(fee.paidAmount, currency)} din ${money(fee.amount + fee.paidAmount, currency)}` : ''}
                                                </Text>
                                                {effect ? (
                                                    <View className="flex-row items-center gap-1 mt-0.5">
                                                        <MaterialIcons name={effect.icon as any} size={13} color={effect.color} />
                                                        <Text className="text-[11.5px] font-medium" style={{ color: effect.icon === 'radio-button-unchecked' ? 'var(--c-muted)' : effect.color }}>{effect.text}</Text>
                                                    </View>
                                                ) : null}
                                            </View>
                                            <View className="items-end shrink-0">
                                                <Text className="t-num text-[13px] font-bold" style={{ color: 'var(--c-ink)' }}>{money(fee.amount, currency)}</Text>
                                                {line ? (
                                                    <Text className="t-num text-[11.5px] font-semibold" style={{ color: settled ? 'var(--c-success-fg)' : 'var(--c-warning-fg)' }}>{`−${money(line.applied, currency)}`}</Text>
                                                ) : null}
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>

                        {/* Four fields in two rows, each with a visible label: on a phone the method
                            and the receipt note sat below the fold, so cash was booked unseen. */}
                        <View className="grid grid-cols-2 gap-x-2 gap-y-3">
                            <View className="min-w-0">
                                <FieldLabel>Suma (RON)</FieldLabel>
                                <TextInput
                                    value={amount}
                                    onChangeText={setAmount}
                                    keyboardType="decimal-pad"
                                    accessibilityLabel="Suma încasată"
                                    aria-invalid={amountError ? true : undefined}
                                    className="h-10 rounded-[10px] px-3 border text-[15px] font-bold"
                                    style={{ borderColor: 'var(--c-border)', color: 'var(--c-ink)', backgroundColor: 'var(--c-surface)' } as any}
                                />
                            </View>
                            <View className="min-w-0">
                                <FieldLabel>Data plății</FieldLabel>
                                {/* The browser's date picker (same YYYY-MM-DD value) instead of typing AAAA-LL-ZZ. */}
                                <input
                                    type="date"
                                    value={date}
                                    max={new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' })}
                                    onChange={(event) => setDate(event.target.value)}
                                    aria-label="Data plății"
                                    aria-invalid={validDate ? undefined : true}
                                    className="w-full h-10 rounded-[10px] px-3 border text-[14px] outline-none"
                                    style={{ borderColor: validDate ? 'var(--c-border)' : 'var(--c-danger-border)', color: 'var(--c-ink)', backgroundColor: 'var(--c-surface)', colorScheme: 'light dark' }}
                                />
                            </View>
                            <View className="min-w-0">
                                <FieldLabel>Metoda</FieldLabel>
                                <SelectField<Method> label="Metoda de plată" value={method} onChange={setMethod} options={METHOD_OPTIONS} />
                            </View>
                            <View className="min-w-0">
                                <FieldLabel>Notă (opțional)</FieldLabel>
                                <TextInput
                                    value={description}
                                    onChangeText={setDescription}
                                    placeholder="ex. nr. chitanță"
                                    placeholderTextColor="var(--c-faint)"
                                    accessibilityLabel="Notă"
                                    maxLength={500}
                                    className="h-10 rounded-[10px] px-3 border text-[13px]"
                                    style={{ borderColor: 'var(--c-border)', color: 'var(--c-ink)', backgroundColor: 'var(--c-surface)' } as any}
                                />
                            </View>
                        </View>
                        {amountError ? (
                            <Text className="text-[12px]" style={{ color: 'var(--c-danger-fg)' }}>{amountError}</Text>
                        ) : null}

                        {!validDate ? (
                            <Text className="text-[12px]" style={{ color: 'var(--c-danger-fg)' }}>Alege o dată de azi sau din trecut.</Text>
                        ) : null}
                        {formError ? <Text className="text-[12px] font-medium" style={{ color: 'var(--c-danger-fg)' }}>{formError}</Text> : null}
                    </View>
                ) : null}
            </ConfirmDialog>
            <ConfirmDialog
                visible={confirmDiscard}
                destructive
                icon="delete-outline"
                title="Renunți la încasare?"
                message={`Suma${description.trim() ? ' și nota' : ''} pe care le-ai scris nu se înregistrează.`}
                confirmLabel="Renunță la încasare"
                cancelLabel="Continuă încasarea"
                onConfirm={() => { setConfirmDiscard(false); setTarget(null); }}
                onCancel={() => setConfirmDiscard(false)}
            />
        </FinanceCard>
    );
}

/** A form field's visible label, the FormField style (12.5px, sentence case). */
function FieldLabel({ children }: { children: string }) {
    return <Text className="text-[12.5px] font-semibold mb-1.5" style={{ color: 'var(--c-ink-soft)' }}>{children}</Text>;
}

/** One line over the fee list: what the typed amount does overall. */
function splitSummary(allocation: PaymentAllocation | null, validAmount: boolean, feesLoaded: boolean): string {
    if (!validAmount) return feesLoaded ? 'Scrie suma încasată' : '';
    if (!allocation) return 'Indisponibilă acum; plata se salvează oricum';
    const full = allocation.lines.filter((line) => line.owedAfter <= 0).length;
    const partial = allocation.lines.length - full;
    if (!full && !partial) return 'Nu acoperă nicio taxă';
    return [full ? `${plural(full, 'taxă', 'taxe')} integral` : '', partial ? `${partial} parțial` : ''].filter(Boolean).join(' · ');
}
