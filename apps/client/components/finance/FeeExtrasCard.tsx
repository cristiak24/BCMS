import { useEffect, useState } from 'react';
import { View, Text, TextInput } from '@/src/web/reactNative';
import Button from '../ui/Button';
import { financeApi, type FinancialSettings } from '../../services/financeApi';

/**
 * The fees that were billed but had no screen (training levy, facility fee)
 * and the month from which unpaid fees count as arrears.
 */

function currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function FeeExtrasCard({ settings, onSaved }: { settings: FinancialSettings | null; onSaved: (next: FinancialSettings) => void }) {
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

    const field = (label: string, value: string, onChange: (text: string) => void, suffix: string, invalid = false, placeholder?: string) => (
        <View className="flex-1 min-w-[150px]">
            <Text className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--c-muted)' }}>{label}</Text>
            <View className="flex-row items-center gap-2">
                <TextInput
                    value={value}
                    onChangeText={onChange}
                    placeholder={placeholder}
                    placeholderTextColor="var(--c-faint)"
                    accessibilityLabel={label}
                    className="flex-1 h-10 rounded-[10px] px-3 border text-[15px] font-semibold"
                    style={{ borderColor: invalid ? 'var(--c-danger-border)' : 'var(--c-border)', color: 'var(--c-ink)', backgroundColor: 'var(--c-surface)' } as any}
                />
                <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-faint)' }}>{suffix}</Text>
            </View>
        </View>
    );

    return (
        <View className="w-full rounded-[16px] p-4 md:p-5 border mb-5" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}>
            <Text className="f-display text-[16px] font-bold" style={{ color: 'var(--c-ink)' }}>Alte taxe și evidența restanțelor</Text>
            <Text className="t-meta mt-0.5 mb-3" style={{ color: 'var(--c-muted)' }}>
                Taxele lunare de mai jos se adaugă cotizației pentru fiecare jucător activ.
            </Text>

            <View className="flex-row flex-wrap gap-3 mb-3">
                {field('Contribuție antrenament', levy, setLevy, 'RON / lună', !(Number.isFinite(levyValue) && levyValue >= 0))}
                {field('Taxă bază sportivă', facility, setFacility, 'RON / lună', !(Number.isFinite(facilityValue) && facilityValue >= 0))}
                {field('Restanțe din luna', startMonth, setStartMonth, 'AAAA-LL', !monthValid, 'ex. 2026-09')}
            </View>

            <Text className="text-[12px] mb-3" style={{ color: 'var(--c-muted)' }}>
                {startMonth
                    ? 'Taxele neplătite din această lună încoace rămân de plată și devin restanțe după ziua limită. Lunile dinaintea înscrierii unui jucător nu se facturează.'
                    : 'Necompletat: se cere doar luna curentă, iar lunile trecute neplătite nu apar ca restanțe.'}
            </Text>

            <View className="flex-row items-center gap-3 flex-wrap">
                <Button variant="primary" size="sm" icon="save" label="Salvează" loading={saving} disabled={!valid || !dirty} onPress={() => void save()} />
                {message ? (
                    <Text className="text-[12px] font-medium" style={{ color: message.tone === 'ok' ? 'var(--c-success-fg)' : 'var(--c-danger-fg)' }}>{message.text}</Text>
                ) : null}
            </View>
        </View>
    );
}
