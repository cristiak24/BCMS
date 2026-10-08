import { useCallback, useEffect, useState } from 'react';
import { View, Text, Platform } from '@/src/web/reactNative';
import Button from '../ui/Button';
import { financeApi, type StripeConnectStatus } from '../../services/financeApi';

/**
 * Finanțe → Plăți online: the club's own Stripe account. Once connected and
 * verified by Stripe, families' online payments go straight to the club.
 * Until then they go to the platform account, as before.
 */
export default function StripeConnectCard({ returned }: { returned?: boolean }) {
    const [status, setStatus] = useState<StripeConnectStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setStatus(await financeApi.getConnectStatus());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nu am putut citi starea contului Stripe.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load, returned]);

    const start = async () => {
        setStarting(true);
        setError(null);
        try {
            const { url } = await financeApi.startConnectOnboarding();
            if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.assign(url);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nu am putut porni conectarea.');
            setStarting(false);
        }
    };

    const ready = Boolean(status?.connected && status.chargesEnabled);
    const headline = !status?.available
        ? 'Stripe nu este configurat pe server.'
        : ready
            ? 'Conectat: plățile online ajung direct în contul clubului.'
            : status?.connected
                ? 'Configurare începută: Stripe mai are nevoie de date (firmă, cont bancar, identitate).'
                : 'Neconectat: plățile online ajung acum în contul platformei, nu al clubului.';

    return (
        <View className="w-full rounded-[16px] p-4 md:p-5 border mb-5" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}>
            <Text className="f-display text-[16px] font-bold" style={{ color: 'var(--c-ink)' }}>Contul Stripe al clubului</Text>
            <Text className="t-meta mt-0.5 mb-3" style={{ color: 'var(--c-muted)' }}>
                Clubul primește direct banii plătiți online de familii și apare ca beneficiar pe plată.
            </Text>

            {loading ? (
                <Text className="text-[13px]" style={{ color: 'var(--c-muted)' }}>Se verifică…</Text>
            ) : (
                <View className="gap-3">
                    <View className="flex-row items-center gap-2">
                        <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ready ? 'var(--c-success)' : status?.connected ? 'var(--c-warning)' : 'var(--c-faint)' }} />
                        <Text className="text-[13.5px] font-semibold flex-1" style={{ color: 'var(--c-ink)' }}>{headline}</Text>
                    </View>
                    {status?.connected ? (
                        <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>
                            Cont {status.accountId} · plăți {status.chargesEnabled ? 'active' : 'inactive'} · transferuri în bancă {status.payoutsEnabled ? 'active' : 'inactive'}
                        </Text>
                    ) : null}
                    {status?.available && status.canManage && !ready ? (
                        <View className="flex-row">
                            <Button variant="primary" size="sm" icon="account-balance" loading={starting} label={status.connected ? 'Continuă configurarea în Stripe' : 'Conectează contul clubului'} onPress={() => void start()} />
                        </View>
                    ) : null}
                    {status?.available && !status.canManage && !ready ? (
                        <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>Doar administratorul clubului poate conecta contul.</Text>
                    ) : null}
                </View>
            )}
            {error ? <Text className="text-[12px] font-medium mt-2" style={{ color: 'var(--c-danger-fg)' }}>{error}</Text> : null}
        </View>
    );
}
