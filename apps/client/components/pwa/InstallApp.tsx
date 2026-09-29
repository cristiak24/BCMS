import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Share, SquarePlus, EllipsisVertical, Compass } from 'lucide-react';
import { Modal, Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import {
    dismissInstallBanner, useInstallApp, wasInstallBannerDismissed,
    type InstallPlatform, type IosBrowser,
} from '../../src/pwa/installApp';

type Step = { icon: ReactNode; text: ReactNode };

function Strong({ children }: { children: ReactNode }) {
    return <Text className="font-bold" style={{ color: 'var(--c-ink)' }}>{children}</Text>;
}

function stepsFor(platform: InstallPlatform, iosBrowser: IosBrowser | null): { intro?: string; steps: Step[] } {
    const shareIcon = <Share size={17} color="var(--c-brand-fg)" />;
    const addIcon = <SquarePlus size={17} color="var(--c-brand-fg)" />;
    const doneIcon = <MaterialIcons name="check-circle" size={17} color="var(--c-success-fg)" />;

    if (platform === 'ios') {
        if (iosBrowser === 'in-app') {
            return {
                intro: 'Ești într-un browser din altă aplicație, care nu poate instala BCMS.',
                steps: [
                    { icon: <Compass size={17} color="var(--c-brand-fg)" />, text: <>Deschide <Strong>bcms.ro</Strong> în <Strong>Safari</Strong>.</> },
                    { icon: shareIcon, text: <>Apasă <Strong>Partajează</Strong> în bara de jos.</> },
                    { icon: addIcon, text: <>Alege <Strong>Adaugă pe ecranul principal</Strong>, apoi <Strong>Adaugă</Strong>.</> },
                ],
            };
        }
        const where = iosBrowser === 'chrome' || iosBrowser === 'other'
            ? <>în bara de adresă, sus în dreapta</>
            : <>în bara de jos a Safari</>;
        return {
            intro: 'Pe iPhone aplicația se instalează din meniul Partajează — iOS nu afișează un buton de instalare.',
            steps: [
                { icon: shareIcon, text: <>Apasă butonul <Strong>Partajează</Strong> {where}.</> },
                { icon: addIcon, text: <>Derulează și alege <Strong>Adaugă pe ecranul principal</Strong>. Dacă nu apare, apasă <Strong>Editează acțiunile</Strong> și adaug-o.</> },
                { icon: doneIcon, text: <>Apasă <Strong>Adaugă</Strong>. BCMS apare pe ecran ca o aplicație.</> },
            ],
        };
    }

    return {
        steps: [
            { icon: <EllipsisVertical size={17} color="var(--c-brand-fg)" />, text: <>Deschide meniul browserului <Strong>⋮</Strong>.</> },
            { icon: addIcon, text: <>Alege <Strong>Instalează aplicația</Strong> sau <Strong>Adaugă pe ecranul principal</Strong>.</> },
            { icon: doneIcon, text: <>Confirmă. BCMS se deschide apoi ca o aplicație separată.</> },
        ],
    };
}

/** Bottom sheet with the manual install steps (iOS, or Android without a prompt). */
export function InstallInstructionsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    const { platform, iosBrowser } = useInstallApp();
    const { intro, steps } = stepsFor(platform, iosBrowser);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable className="ui-backdrop flex-1 justify-end lg:justify-center lg:items-center" style={{ backgroundColor: 'rgba(10,15,28,0.5)' }} onPress={onClose}>
                <Pressable
                    onPress={(event: any) => event?.stopPropagation?.()}
                    className="ui-sheet w-full lg:max-w-[440px] rounded-t-[22px] lg:rounded-[20px] px-5 pt-3 border"
                    style={{
                        backgroundColor: 'var(--c-surface)',
                        borderColor: 'var(--c-border)',
                        paddingBottom: 'max(24px, calc(env(safe-area-inset-bottom, 0px) + 16px))',
                        boxShadow: '0 -12px 32px -12px rgba(0,0,0,0.35)',
                    } as any}
                >
                    <View className="self-center w-10 h-1 rounded-full mb-4 lg:hidden" style={{ backgroundColor: 'var(--c-border-strong)' }} />
                    <View className="flex-row items-center gap-3 mb-3">
                        <img src="/apple-touch-icon.png" alt="" width={44} height={44} style={{ borderRadius: 11 }} />
                        <View className="flex-1 min-w-0">
                            <Text className="text-[17px] font-bold" style={{ color: 'var(--c-ink)' }}>Instalează BCMS</Text>
                            <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>Pe ecranul principal, pe tot ecranul, fără bara browserului.</Text>
                        </View>
                        <Pressable
                            onPress={onClose}
                            accessibilityRole="button"
                            accessibilityLabel="Închide"
                            className="ui-press w-9 h-9 rounded-full items-center justify-center shrink-0"
                            style={{ backgroundColor: 'var(--c-surface-2)' }}
                        >
                            <MaterialIcons name="close" size={18} color="var(--c-ink-soft)" />
                        </Pressable>
                    </View>

                    {intro ? (
                        <Text className="t-meta mb-3" style={{ color: 'var(--c-muted)' }}>{intro}</Text>
                    ) : null}

                    <View className="rounded-[14px] border overflow-hidden" style={{ borderColor: 'var(--c-border)' } as any}>
                        {steps.map((step, index) => (
                            <View
                                key={index}
                                className={`flex-row items-start gap-3 px-3.5 py-3 ${index > 0 ? 'border-t' : ''}`}
                                style={{ borderColor: 'var(--c-border-soft)', backgroundColor: 'var(--c-surface-2)' } as any}
                            >
                                <View className="w-8 h-8 rounded-[9px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                                    {step.icon}
                                </View>
                                <Text className="flex-1 text-[13.5px] leading-[19px] pt-1" style={{ color: 'var(--c-ink-soft)' }}>
                                    <Text className="font-bold t-num" style={{ color: 'var(--c-faint)' }}>{index + 1}. </Text>
                                    {step.text}
                                </Text>
                            </View>
                        ))}
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

/** Profile card: always reachable, even after the banner was dismissed. */
export function InstallAppCard() {
    const install = useInstallApp();
    const [open, setOpen] = useState(false);
    if (install.standalone) return null;

    const onPress = async () => {
        if (install.canPrompt) await install.promptInstall();
        else setOpen(true);
    };

    return (
        <View
            className="ui-rise rounded-[16px] border px-4 py-3.5 flex-row items-center gap-3"
            style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
        >
            <img src="/apple-touch-icon.png" alt="" width={40} height={40} style={{ borderRadius: 10, flexShrink: 0 }} />
            <View className="flex-1 min-w-0">
                <Text className="text-[14.5px] font-bold" style={{ color: 'var(--c-ink)' }}>Instalează aplicația</Text>
                <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>
                    {install.platform === 'desktop' ? 'Deschide BCMS într-o fereastră proprie.' : 'Adaug-o pe ecranul principal al telefonului.'}
                </Text>
            </View>
            <Pressable
                onPress={() => void onPress()}
                accessibilityRole="button"
                className="ui-press h-9 px-3.5 rounded-[10px] items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--c-brand-surface)' }}
            >
                <Text className="text-[13px] font-bold" style={{ color: 'var(--c-on-brand)' }}>
                    {install.canPrompt ? 'Instalează' : 'Cum?'}
                </Text>
            </Pressable>
            <InstallInstructionsSheet visible={open} onClose={() => setOpen(false)} />
        </View>
    );
}

const PUBLIC_PATHS = ['/', '/login', '/signup'];

/**
 * One-time nudge on phones (and not inside the installed app). Sits above the
 * bottom navigation; "Nu acum" hides it for 30 days — the profile card stays.
 */
export function InstallBanner() {
    const install = useInstallApp();
    const { pathname } = useLocation();
    const [visible, setVisible] = useState(false);
    const [sheetOpen, setSheetOpen] = useState(false);
    const onAppRoute = !PUBLIC_PATHS.includes(pathname) && !pathname.startsWith('/invite');

    useEffect(() => {
        if (!install.canOffer || install.platform === 'desktop' || wasInstallBannerDismissed()) {
            setVisible(false);
            return undefined;
        }
        // Not in the first seconds of a visit — let the page load first.
        const timer = window.setTimeout(() => setVisible(true), 4000);
        return () => window.clearTimeout(timer);
    }, [install.canOffer, install.platform]);

    if (!visible && !sheetOpen) return null;

    const close = () => {
        dismissInstallBanner();
        setVisible(false);
    };
    const onInstall = async () => {
        if (install.canPrompt) {
            await install.promptInstall();
            close();
        } else {
            setSheetOpen(true);
        }
    };

    return (
        <>
            {visible ? (
                <View
                    className="ui-rise lg:hidden flex-row items-center gap-3 rounded-[16px] border pl-3 pr-2 py-2.5"
                    style={{
                        position: 'fixed',
                        left: 12,
                        right: 12,
                        bottom: onAppRoute ? 'calc(88px + env(safe-area-inset-bottom, 0px))' : 'calc(16px + env(safe-area-inset-bottom, 0px))',
                        zIndex: 40,
                        backgroundColor: 'var(--c-surface)',
                        borderColor: 'var(--c-border)',
                        boxShadow: '0 12px 32px -10px rgba(0,0,0,0.35)',
                    } as any}
                    accessibilityRole={'status' as any}
                >
                    <img src="/apple-touch-icon.png" alt="" width={36} height={36} style={{ borderRadius: 9, flexShrink: 0 }} />
                    <View className="flex-1 min-w-0">
                        <Text className="text-[13.5px] font-bold" style={{ color: 'var(--c-ink)' }}>Instalează BCMS</Text>
                        <Text className="text-[12px]" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>Deschide-l direct de pe ecranul principal.</Text>
                    </View>
                    <Pressable
                        onPress={() => void onInstall()}
                        accessibilityRole="button"
                        className="ui-press h-9 px-3 rounded-[10px] items-center justify-center shrink-0"
                        style={{ backgroundColor: 'var(--c-brand-surface)' }}
                    >
                        <Text className="text-[13px] font-bold" style={{ color: 'var(--c-on-brand)' }}>{install.canPrompt ? 'Instalează' : 'Arată-mi'}</Text>
                    </Pressable>
                    <Pressable
                        onPress={close}
                        accessibilityRole="button"
                        accessibilityLabel="Nu acum"
                        className="ui-press w-8 h-8 rounded-full items-center justify-center shrink-0"
                    >
                        <MaterialIcons name="close" size={17} color="var(--c-faint)" />
                    </Pressable>
                </View>
            ) : null}
            <InstallInstructionsSheet
                visible={sheetOpen}
                onClose={() => {
                    setSheetOpen(false);
                    close();
                }}
            />
        </>
    );
}
