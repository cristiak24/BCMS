import type { ReactNode } from 'react';
import { View, Text } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';

/**
 * The card and header every Finanțe section uses. The sections used to mix
 * two styles: some with an icon chip and hardcoded rgba colours, others
 * (Restanțe, Alte taxe) with a bare title, so the page read as patched together.
 */
export type FinanceTone = 'brand' | 'warning' | 'sky' | 'success' | 'purple';

// Every card header shares one plain grey icon (no tile); a hue per card (sky,
// amber, green, purple) only decorated. `tone` stays in the props for the call sites.
const TILE = { bg: 'var(--c-surface-3)', fg: 'var(--c-muted)' };

export function FinanceCard({ children, className, nativeID }: { children: ReactNode; className?: string; nativeID?: string }) {
    return (
        <View
            nativeID={nativeID}
            className={`w-full min-w-0 rounded-[16px] p-4 md:p-5 border dash-fade-in ${className ?? ''}`}
            style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
        >
            {children}
        </View>
    );
}

/** Grey icon + title + one-line description; `actions` sit right from sm (lg with wideActions) up, below on phones. */
export function FinanceCardHeader({ icon, title, subtitle, actions, wideActions }: {
    icon: string;
    tone?: FinanceTone;
    title: string;
    subtitle?: string;
    actions?: ReactNode;
    /** A full toolbar: it shares the title's row only from lg up. */
    wideActions?: boolean;
}) {
    const colors = TILE;
    return (
        <View className={`flex-col gap-3 mb-4 ${wideActions ? 'lg:flex-row lg:items-center' : 'sm:flex-row sm:items-center'}`}>
            <View className="flex-row items-center gap-3 flex-1 min-w-0">
                <MaterialIcons name={icon} size={18} color={colors.fg} />
                <View className="flex-1 min-w-0">
                    <Text accessibilityRole="header" aria-level={2} className="f-display text-[16px] font-bold" style={{ color: 'var(--c-ink)', letterSpacing: '-0.015em' } as any}>{title}</Text>
                    {subtitle ? <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>{subtitle}</Text> : null}
                </View>
            </View>
            {actions ? <View className="flex-row items-center gap-2 flex-wrap">{actions}</View> : null}
        </View>
    );
}
