import { useEffect, useState } from 'react';
import { View, Text, TextInput } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import Button from '../ui/Button';
import { FinanceCard, FinanceCardHeader } from './FinanceCard';
import { financeApi, type FinancialSettings } from '../../services/financeApi';

/**
 * The fees that were billed but had no screen (training levy, facility fee)
 * and the month from which unpaid fees count as arrears.
 */

function currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function FeeExtrasCard({ settings, onSaved, readOnly = false, className }: {
    settings: FinancialSettings | null;
    onSaved: (next: FinancialSettings) => void;
    /** The accountant sees the fees but only the club admin changes them. */
    readOnly?: boolean;
    className?: string;
}) {
    const [levy, setLevy] = useState('');
    const [facility, setFacility] = useState('');
    const [startMonth, setStartMonth] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

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
            setMessage({ tone: 'ok', text: 'Setările au fost salvate.' });
        } catch (err) {
            setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Nu am putut salva setările.' });
        } finally {
            setSaving(false);
        }
    };

    // Label above a bordered field with the unit inside it, bottom-aligned so a
    // label that wraps on a narrow column doesn't push its field out of line.
    const field = (label: string, value: string, onChange: (text: string) => void, suffix: string, invalid = false, placeholder?: string) => (
        <View className="min-w-0 justify-end">
            <Text className="text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--c-muted)' }}>{label}</Text>
            <View
                className="flex-row items-center h-10 rounded-[10px] border pr-3"
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
            />

            <View className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                {field('Contribuție antrenament', levy, setLevy, 'RON / lună', !(Number.isFinite(levyValue) && levyValue >= 0))}
                {field('Taxă bază sportivă', facility, setFacility, 'RON / lună', !(Number.isFinite(facilityValue) && facilityValue >= 0))}
                {field('Restanțe începând cu luna', startMonth, setStartMonth, 'AAAA-LL', !monthValid, 'ex. 2026-09')}
            </View>

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
            ) : (
                <View className="flex-row items-center gap-3 flex-wrap">
                    <Button variant="primary" size="sm" icon="save" label="Salvează" loading={saving} disabled={!valid || !dirty} onPress={() => void save()} />
                    {message ? (
                        <Text className="text-[12px] font-medium" style={{ color: message.tone === 'ok' ? 'var(--c-success-fg)' : 'var(--c-danger-fg)' }}>{message.text}</Text>
                    ) : null}
                </View>
            )}
        </FinanceCard>
    );
}
