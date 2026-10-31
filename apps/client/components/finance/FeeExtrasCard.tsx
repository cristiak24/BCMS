import { useEffect, useState } from 'react';
import { View, Text, TextInput } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import Button from '../ui/Button';
import ConfirmDialog from '../ui/ConfirmDialog';
import type { ToastVariant } from '../ui/Toast';
import { FinanceCard, FinanceCardHeader } from './FinanceCard';
import { financeApi, type FinancialSettings } from '../../services/financeApi';

/**
 * The fees that were billed but had no screen (training levy, facility fee)
 * and the month from which unpaid fees count as arrears. The same edit model
 * as the tiles beside it: values first, „Modifică”, then fields with
 * „Renunță” / „Salvează” (it used to be an always-open form next to them).
 */

function monthLabel(value: string) {
    if (!value) return 'Necompletat';
    const [year, month] = value.split('-').map(Number);
    const label = new Date(year, month - 1, 1).toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function FeeExtrasCard({ settings, onSaved, onNotify, readOnly = false, className }: {
    settings: FinancialSettings | null;
    onSaved: (next: FinancialSettings) => void;
    onNotify?: (toast: { variant: ToastVariant; message: string }) => void;
    /** The accountant sees the fees but only the club admin changes them. */
    readOnly?: boolean;
    className?: string;
}) {
    const [levy, setLevy] = useState('');
    const [facility, setFacility] = useState('');
    const [startMonth, setStartMonth] = useState('');
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);
    // Fee changes reach every unpaid month: asked first, like the monthly fee.
    const [confirming, setConfirming] = useState(false);
    const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

    const reset = () => {
        if (!settings) return;
        setLevy(String(settings.trainingLevy ?? 0));
        setFacility(String(settings.facilityFee ?? 0));
        setStartMonth(settings.billingStartMonth ?? '');
    };
    useEffect(() => {
        if (!settings) return;
        setLevy(String(settings.trainingLevy ?? 0));
        setFacility(String(settings.facilityFee ?? 0));
        setStartMonth(settings.billingStartMonth ?? '');
    }, [settings]);

    const levyValue = Number(levy.replace(',', '.'));
    const facilityValue = Number(facility.replace(',', '.'));
    const monthValid = startMonth === '' || (/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth) && startMonth <= currentMonth());
    const valid = Number.isFinite(levyValue) && levyValue >= 0 && Number.isFinite(facilityValue) && facilityValue >= 0 && monthValid;
    const dirty = settings != null && (
        levyValue !== Number(settings.trainingLevy ?? 0)
        || facilityValue !== Number(settings.facilityFee ?? 0)
        || startMonth !== (settings.billingStartMonth ?? '')
    );

    const save = async () => {
        if (!valid || !dirty) return;
        setSaving(true);
        setMessage(null);
        try {
            const next = await financeApi.updateSettings({
                trainingLevy: levyValue,
                facilityFee: facilityValue,
                billingStartMonth: startMonth || null,
            });
            onSaved(next);
            setEditing(false);
            setConfirming(false);
            onNotify?.({ variant: 'success', message: 'Taxele au fost salvate.' });
        } catch (err) {
            setConfirming(false);
            setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Nu am putut salva setările.' });
        } finally {
            setSaving(false);
        }
    };

    // Label above a bordered field with the unit inside it, bottom-aligned so a
    // label that wraps on a narrow column doesn't push its field out of line.
    const field = (label: string, value: string, onChange: (text: string) => void, suffix: string, invalid = false, placeholder?: string) => (
        <View className="min-w-0 justify-end">
            <Text className="text-[12.5px] font-semibold mb-1.5" style={{ color: 'var(--c-ink-soft)' }}>{label}</Text>
            <View
                className="flex-row items-center h-10 [@media(pointer:coarse)]:h-[42px] rounded-[10px] border pr-3"
                style={{ borderColor: invalid ? 'var(--c-danger-border)' : 'var(--c-border)', backgroundColor: readOnly ? 'var(--c-surface-2)' : 'var(--c-surface)' } as any}
            >
                <TextInput
                    value={value}
                    onChangeText={onChange}
                    placeholder={placeholder}
                    placeholderTextColor="var(--c-faint)"
                    accessibilityLabel={label}
                    editable={!readOnly}
                    className="flex-1 h-full px-3 text-[15px] font-semibold t-num"
                    style={{ color: 'var(--c-ink)' }}
                />
                <Text className="text-[12px] font-medium shrink-0" style={{ color: 'var(--c-faint)' }}>{suffix}</Text>
            </View>
        </View>
    );

    return (
        <FinanceCard className={className}>
            <FinanceCardHeader
                icon="tune"
                tone="purple"
                title="Alte taxe și restanțe"
                subtitle="Se adaugă cotizației pentru fiecare jucător activ."
                actions={!readOnly && !editing && settings ? (
                    <Button size="sm" variant="ghost" icon="edit" label="Modifică" accessibilityLabel="Modifică alte taxe și restanțe" onPress={() => { setMessage(null); setEditing(true); }} />
                ) : undefined}
            />

            {!editing ? (
                // Rows (label · value): three tiles in the half-width card cut every label.
                <View className="rounded-[12px] border overflow-hidden mb-3" style={{ borderColor: 'var(--c-border)' }}>
                    {[
                        { label: 'Contribuție antrenament', value: `${settings?.trainingLevy ?? 0}`, unit: 'RON / lună' },
                        { label: 'Taxă bază sportivă', value: `${settings?.facilityFee ?? 0}`, unit: 'RON / lună' },
                        { label: 'Restanțe începând cu luna', value: monthLabel(settings?.billingStartMonth ?? ''), unit: '' },
                    ].map((item, index) => (
                        <View key={item.label} className={`flex-row items-baseline justify-between gap-3 px-3.5 py-2.5 ${index ? 'border-t' : ''}`} style={{ borderColor: 'var(--c-border)' }}>
                            <Text className="flex-1 min-w-0 text-[13px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>{item.label}</Text>
                            <View className="flex-row items-baseline gap-1.5 shrink-0">
                                <Text className="t-num text-[15px] font-bold" style={{ color: 'var(--c-ink-strong)' }}>{item.value}</Text>
                                {item.unit ? <Text className="text-[12px] font-medium" style={{ color: 'var(--c-muted)' }}>{item.unit}</Text> : null}
                            </View>
                        </View>
                    ))}
                </View>
            ) : null}

            {editing ? (
            <View className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                {field('Contribuție antrenament', levy, setLevy, 'RON / lună', !(Number.isFinite(levyValue) && levyValue >= 0))}
                {field('Taxă bază sportivă', facility, setFacility, 'RON / lună', !(Number.isFinite(facilityValue) && facilityValue >= 0))}
                {/* A month picker (same YYYY-MM value) instead of typing AAAA-LL; browsers without one show a text field with the hint. */}
                <View className="min-w-0 justify-end">
                    <Text className="text-[12.5px] font-semibold mb-1.5" style={{ color: 'var(--c-ink-soft)' }}>Restanțe începând cu luna</Text>
                    <input
                        type="month"
                        value={startMonth}
                        max={currentMonth()}
                        placeholder="ex. 2026-09"
                        disabled={readOnly}
                        onChange={(event) => setStartMonth(event.target.value)}
                        aria-label="Restanțe începând cu luna"
                        aria-invalid={monthValid ? undefined : true}
                        className="w-full h-10 rounded-[10px] border px-3 text-[15px] font-semibold t-num outline-none"
                        style={{ borderColor: monthValid ? 'var(--c-border)' : 'var(--c-danger-border)', color: 'var(--c-ink)', backgroundColor: readOnly ? 'var(--c-surface-2)' : 'var(--c-surface)', colorScheme: 'light dark' }}
                    />
                </View>
            </View>
            ) : null}

            <View className="flex-row items-start gap-2 rounded-[10px] px-3 py-2.5 mb-3" style={{ backgroundColor: 'var(--c-surface-2)' }}>
                <MaterialIcons name="info-outline" size={15} color="var(--c-muted)" style={{ marginTop: 1 }} />
                <Text className="flex-1 text-[12px] leading-[17px]" style={{ color: 'var(--c-muted)' }}>
                    {startMonth
                        ? 'Taxele neplătite din această lună încoace rămân de plată și devin restanțe după ziua limită. Lunile dinaintea înscrierii unui jucător nu se facturează.'
                        : 'Necompletat: se cere doar luna curentă, iar lunile trecute neplătite nu apar ca restanțe.'}
                </Text>
            </View>

            {readOnly ? (
                <Text className="text-[12px] font-medium" style={{ color: 'var(--c-muted)' }}>Doar administratorul clubului poate modifica taxele.</Text>
            ) : editing ? (
                <View className="flex-row items-center gap-2 flex-wrap">
                    <Button size="sm" label="Renunță" disabled={saving} onPress={() => { reset(); setMessage(null); setEditing(false); }} />
                    <Button variant="primary" size="sm" icon="save" label="Salvează" loading={saving} disabled={!valid || !dirty} onPress={() => setConfirming(true)} />
                    {message?.tone === 'error' ? (
                        <Text className="text-[12px] font-medium" style={{ color: 'var(--c-danger-fg)' }}>{message.text}</Text>
                    ) : null}
                </View>
            ) : null}

            <ConfirmDialog
                visible={confirming}
                icon="tune"
                title="Schimbi taxele?"
                message="Sumele noi se aplică fiecărei luni încă neplătite, inclusiv restanțelor de acum. Lunile deja plătite rămân cum sunt. Familiile văd sumele noi imediat."
                confirmLabel="Salvează taxele"
                focusCancel
                loading={saving}
                onConfirm={() => void save()}
                onCancel={() => { if (!saving) setConfirming(false); }}
            />
        </FinanceCard>
    );
}
