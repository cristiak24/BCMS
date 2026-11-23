import { useState } from 'react';
import { Pressable, Switch, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import Button from '../ui/Button';
import { FormNotice, ProfileCard } from '../profile/ProfileParts';
import { InstallInstructionsSheet } from './InstallApp';
import { disablePush, enablePush, usePushState, type PushState } from '../../src/pwa/push';
import { isStandalone } from '../../src/pwa/installApp';
import { pushApi, type PushKind } from '../../services/pushApi';
import { parseApiDate, isValidDate } from '../../utils/dates';
import { appLocale, tr } from '../../i18n';

/**
 * Profil → „Notificări pe dispozitiv” (Val 3B). Everything here applies at
 * once — it is about this device, not part of the form's „Salvează”. Hidden
 * when the server has no VAPID keys or the role receives no push.
 */

const KIND_COPY: Record<PushKind, { label: string; hint?: string }> = {
    event_new: { label: tr('Evenimente noi'), hint: tr('Antrenamente, meciuri și cantonamente adăugate în program') },
    event_changed: { label: tr('Program modificat sau anulat') },
    rsvp_reminder: { label: tr('Cereri de confirmare'), hint: tr('Când antrenorul așteaptă răspunsul la un eveniment') },
    payment_overdue: { label: tr('Plăți restante') },
    rsvp_declined: { label: tr('Absențe anunțate'), hint: tr('Când cineva din echipă anunță că nu vine') },
};

function cardDescription(kinds: PushKind[]) {
    return kinds.length === 1 && kinds[0] === 'rsvp_declined'
        ? tr('Afli pe ecran când cineva anunță că nu vine, chiar cu aplicația închisă.')
        : tr('Schimbările de program, cererile de confirmare și plățile restante apar pe ecran, chiar cu aplicația închisă.');
}

function blockedSteps() {
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)) {
        return tr('Pe iPhone: Setări → Notificări → BCMS → pornește „Permite notificările”.');
    }
    if (/Android/i.test(ua)) {
        return isStandalone()
            ? tr('Pe Android: ține apăsat pe iconița BCMS → Informații aplicație → Notificări → Permite.')
            : tr('Pe Android: atinge lacătul de lângă adresă → Permisiuni → Notificări → Permite.');
    }
    return tr('Pe calculator: apasă iconița de lângă adresă → Notificări → Permite.');
}

function sinceLabel(value: string | null) {
    const date = parseApiDate(value);
    if (!isValidDate(date)) return null;
    return tr('din {0}', { '0': new Intl.DateTimeFormat(appLocale(), { day: 'numeric', month: 'short' }).format(date) });
}

function StatusPill({ tone, label }: { tone: 'success' | 'warning'; label: string }) {
    return (
        <View
            className="self-start flex-row items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{ backgroundColor: tone === 'success' ? 'var(--c-success-bg)' : 'var(--c-warning-bg)' }}
        >
            <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tone === 'success' ? 'var(--c-success-fg)' : 'var(--c-warning-fg)' }} />
            <Text className="text-[12px] font-semibold" style={{ color: tone === 'success' ? 'var(--c-success-fg)' : 'var(--c-warning-fg)' }}>{label}</Text>
        </View>
    );
}

function Note({ children }: { children: string }) {
    return (
        <View className="flex-row items-start gap-2.5 rounded-[12px] border px-3.5 py-3" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border-soft)' } as any}>
            <MaterialIcons name="info-outline" size={16} color="var(--c-muted)" />
            <Text className="text-[13px] flex-1" style={{ color: 'var(--c-ink-soft)' }}>{children}</Text>
        </View>
    );
}

function SubHeading({ children }: { children: string }) {
    return <Text className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--c-muted)' }}>{children}</Text>;
}

function ActiveBody({ state, setState }: { state: PushState; setState: (updater: (s: PushState) => PushState) => void }) {
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [testing, setTesting] = useState(false);
    const [stopping, setStopping] = useState(false);

    const toggle = async (kind: PushKind, value: boolean) => {
        setError(null);
        setNotice(null);
        setState((s) => ({ ...s, preferences: { ...s.preferences, [kind]: value } }));
        try {
            const saved = await pushApi.setPreferences({ [kind]: value });
            setState((s) => ({ ...s, preferences: saved.preferences }));
        } catch {
            setState((s) => ({ ...s, preferences: { ...s.preferences, [kind]: !value } }));
            setError(tr('Preferința nu s-a salvat. Încearcă din nou.'));
        }
    };

    const sendTest = async () => {
        if (!state.currentEndpoint) return;
        setTesting(true);
        setError(null);
        setNotice(null);
        try {
            await pushApi.test(state.currentEndpoint);
            setNotice(tr('Am trimis notificarea. Ar trebui să apară în câteva secunde.'));
        } catch (err) {
            setError(err instanceof Error && err.message ? err.message : tr('Notificarea de probă nu a putut fi trimisă.'));
        } finally {
            setTesting(false);
        }
    };

    const remove = async (id: number) => {
        setError(null);
        const before = state.devices;
        setState((s) => ({ ...s, devices: s.devices.filter((device) => device.id !== id) }));
        try {
            await pushApi.removeDevice(id);
        } catch {
            setState((s) => ({ ...s, devices: before }));
            setError(tr('Dispozitivul nu a putut fi eliminat.'));
        }
    };

    const stop = async () => {
        setStopping(true);
        await disablePush();
        setStopping(false);
    };

    return (
        <View className="gap-3">
            <StatusPill tone="success" label={tr('Active pe acest dispozitiv')} />

            <SubHeading>{tr('Ce primești')}</SubHeading>
            <View className="rounded-[12px] border overflow-hidden" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border-soft)' } as any}>
                {state.kinds.map((kind, index) => {
                    const copy = KIND_COPY[kind];
                    const on = state.preferences[kind] !== false;
                    return (
                        <View
                            key={kind}
                            className={`flex-row items-center gap-3 px-3.5 py-2.5 ${index ? 'border-t' : ''}`}
                            style={{ borderColor: 'var(--c-border-soft)' } as any}
                        >
                            <View className="flex-1 min-w-0">
                                <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-ink)' }}>{copy.label}</Text>
                                {copy.hint ? <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>{copy.hint}</Text> : null}
                            </View>
                            <Switch value={on} onValueChange={(value: boolean) => void toggle(kind, value)} accessibilityLabel={copy.label} />
                        </View>
                    );
                })}
            </View>

            {state.devices.length ? (
                <>
                    <SubHeading>{tr('Dispozitivele tale')}</SubHeading>
                    <View className="rounded-[12px] border overflow-hidden" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border-soft)' } as any}>
                        {state.devices.map((device, index) => {
                            const current = device.endpoint === state.currentEndpoint;
                            const since = sinceLabel(device.createdAt);
                            const meta = [current ? tr('Acesta') : null, since].filter(Boolean).join(' · ');
                            return (
                                <View
                                    key={device.id}
                                    className={`flex-row items-center gap-3 px-3.5 py-2.5 ${index ? 'border-t' : ''}`}
                                    style={{ borderColor: 'var(--c-border-soft)' } as any}
                                >
                                    <MaterialIcons name={current ? 'smartphone' : 'devices'} size={17} color="var(--c-muted)" />
                                    <View className="flex-1 min-w-0">
                                        <Text className="text-[13.5px] font-semibold" numberOfLines={1} style={{ color: 'var(--c-ink)' }}>{device.label || tr('Dispozitiv')}</Text>
                                        {meta ? <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>{meta}</Text> : null}
                                    </View>
                                    {!current ? (
                                        <Pressable
                                            onPress={() => void remove(device.id)}
                                            accessibilityRole="button"
                                            accessibilityLabel={tr('Elimină {0}', { '0': device.label || tr('Dispozitiv') })}
                                            className="ui-press hit-44 px-2 py-1 rounded-[8px]"
                                        >
                                            <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-muted)' }}>{tr('Elimină')}</Text>
                                        </Pressable>
                                    ) : null}
                                </View>
                            );
                        })}
                    </View>
                </>
            ) : null}

            {notice ? <FormNotice tone="success" message={notice} /> : null}
            {error ? <FormNotice tone="danger" message={error} /> : null}

            <View className="flex-row flex-wrap items-center gap-2">
                <Button label={tr('Trimite o notificare de probă')} icon="send" onPress={() => void sendTest()} loading={testing} />
                <Button label={tr('Oprește pe acest dispozitiv')} variant="ghost" onPress={() => void stop()} loading={stopping} />
            </View>
        </View>
    );
}

export default function PushCard() {
    const { state, setState, reload } = usePushState();
    const [installOpen, setInstallOpen] = useState(false);
    const [enabling, setEnabling] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (state.loading || !state.serverEnabled || !state.kinds.length) return null;

    const enable = async () => {
        if (!state.publicKey) return;
        setEnabling(true);
        setError(null);
        // Straight from the tap: iOS shows the dialog only inside the gesture.
        const result = await enablePush(state.publicKey);
        setEnabling(false);
        if (result === 'failed') setError(tr('Notificările nu au putut fi activate. Încearcă din nou.'));
        await reload();
    };

    let body;
    if (state.support === 'ios-not-installed') {
        body = (
            <View className="gap-3">
                <Note>{tr('Pe iPhone, notificările vin doar din aplicația adăugată pe ecranul principal (iOS 16.4 sau mai nou). După instalare, deschide BCMS de pe ecranul principal și activează-le de aici.')}</Note>
                <Button label={tr('Cum instalez aplicația')} icon="smartphone" onPress={() => setInstallOpen(true)} />
                <InstallInstructionsSheet visible={installOpen} onClose={() => setInstallOpen(false)} />
            </View>
        );
    } else if (state.support === 'ios-too-old') {
        body = <Note>{tr('Actualizează iPhone-ul la iOS 16.4 sau mai nou ca să primești notificări.')}</Note>;
    } else if (state.support === 'unsupported') {
        body = <Note>{tr('Browserul acesta nu poate primi notificări. Deschide bcms.ro în Chrome, Edge, Firefox sau Safari.')}</Note>;
    } else if (state.currentEndpoint) {
        body = <ActiveBody state={state} setState={setState} />;
    } else if (state.permission === 'denied') {
        body = (
            <View className="gap-3">
                <StatusPill tone="warning" label={tr('Blocate din browser')} />
                <Text className="text-[13px]" style={{ color: 'var(--c-ink-soft)' }}>{tr('Ca să le primești, permite notificările pentru bcms.ro în setările dispozitivului.')}</Text>
                <Note>{blockedSteps()}</Note>
                <Button label={tr('Am schimbat setarea, verifică din nou')} icon="refresh" onPress={() => void reload()} />
            </View>
        );
    } else {
        body = (
            <View className="gap-2.5">
                <Button label={tr('Activează pe acest dispozitiv')} variant="primary" icon="notifications-active" onPress={() => void enable()} loading={enabling} />
                {error ? <FormNotice tone="danger" message={error} /> : (
                    <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>{tr('Browserul îți va cere permisiunea. Le poți opri oricând de aici.')}</Text>
                )}
            </View>
        );
    }

    return (
        <ProfileCard icon="notifications-active" tone="sky" title={tr('Notificări pe dispozitiv')} description={cardDescription(state.kinds)}>
            {body}
        </ProfileCard>
    );
}
