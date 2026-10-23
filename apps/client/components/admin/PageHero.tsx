import { createContext, useContext, type ReactNode } from 'react';
import { View, Text } from '@/src/web/reactNative';
import { usePathname } from '@/src/web/expoRouter';

/** Stat tiles drop the glass effect when there is no artwork behind them. */
const PlainHeader = createContext(false);

function CourtLines() {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 320 200"
            width="320"
            height="200"
            style={{ position: 'absolute', right: -40, bottom: -60, pointerEvents: 'none', opacity: 0.55 }}
        >
            <g fill="none" stroke="var(--c-border)" strokeWidth="1.5">
                <rect x="10" y="10" width="300" height="240" rx="2" />
                <rect x="110" y="10" width="100" height="110" />
                <circle cx="160" cy="120" r="40" />
                <path d="M40 10v50a120 120 0 0 0 240 0V10" />
                <circle cx="160" cy="34" r="8" />
            </g>
        </svg>
    );
}

/**
 * Page header. `hero`: soft tint circle + court lines in a card, display-font
 * title, actions, optional stat tiles below. `plain`: the same title, actions
 * and tiles straight on the page, no card or artwork.
 *
 * Admin work pages are plain (decided 2026-10-22: the hero belongs to Acasă
 * only, and admin Acasă has its own). Coach and player/parent pages keep the
 * hero until they get their own review — so the default follows the route,
 * which also covers screens shared between roles (Contacte, Documente).
 */
export default function PageHero({
    eyebrow,
    title,
    subtitle,
    actions,
    leading,
    children,
    className,
    variant,
}: {
    eyebrow: string;
    title: string;
    subtitle?: string;
    actions?: ReactNode;
    leading?: ReactNode;
    children?: ReactNode;
    className?: string;
    variant?: 'hero' | 'plain';
}) {
    const pathname = usePathname();
    const plain = (variant ?? (pathname.startsWith('/admin/') ? 'plain' : 'hero')) === 'plain';

    const heading = (
        <View className="flex-col md:flex-row md:items-center md:justify-between gap-3.5">
            <View className="flex-row items-center gap-3.5 min-w-0 flex-1">
                {leading}
                <View className="min-w-0 flex-1">
                    <Text className="t-eyebrow" style={{ color: 'var(--c-muted)' }}>{eyebrow}</Text>
                    <Text accessibilityRole="header" aria-level={1} className="f-display text-[22px] md:text-[26px] font-extrabold leading-tight mt-1" style={{ color: 'var(--c-ink-strong)', letterSpacing: '-0.035em' } as any}>
                        {title}
                    </Text>
                    {subtitle ? <Text className="text-[13px] mt-1" style={{ color: 'var(--c-muted)' }}>{subtitle}</Text> : null}
                </View>
            </View>
            {actions ? <View className="flex-row flex-wrap items-center gap-2">{actions}</View> : null}
        </View>
    );

    if (plain) {
        return (
            <PlainHeader.Provider value>
                <View className={`ui-rise gap-3.5 pt-1 md:pt-2 ${className ?? 'mb-5'}`}>
                    {heading}
                    {children}
                </View>
            </PlainHeader.Provider>
        );
    }

    return (
        <View
            className={`ui-rise relative overflow-hidden rounded-[16px] border ${className ?? 'mb-4'}`}
            style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
        >
            <View
                pointerEvents="none"
                className="page-hero-tint absolute rounded-full"
                style={{ width: 300, height: 300, right: -70, top: -130, backgroundColor: 'var(--c-surface-tint)', opacity: 0.85 }}
            />
            <CourtLines />
            <View className="relative gap-3.5 p-4 md:p-5">
                {heading}
                {children}
            </View>
        </View>
    );
}

/** Stat tile for PageHero: translucent over the hero artwork, a plain card in a plain header. */
export function GlassStat({
    value,
    suffix,
    label,
    shortLabel,
    hint,
    dot,
    danger,
    bar,
}: {
    value: string | number;
    suffix?: string;
    label: string;
    /** Phones: a one-word label for a tight row of tiles; the hint then shows from lg up. */
    shortLabel?: string;
    hint?: string;
    dot: string;
    danger?: boolean;
    bar?: number;
}) {
    const plain = useContext(PlainHeader);
    return (
        <View
            className={`${plain ? 'border' : 'glass'} rounded-[12px] ${shortLabel ? 'px-2.5 lg:px-3' : 'px-3'} py-2.5 min-w-0`}
            style={(plain
                ? { backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' }
                : { boxShadow: 'var(--e-sm)' }) as any}
        >
            <View className="flex-row items-baseline gap-1">
                <View className="w-[6px] h-[6px] rounded-full shrink-0 self-center" style={{ backgroundColor: dot }} />
                <Text className="f-display t-num text-[19px] font-extrabold leading-none" style={{ color: danger ? 'var(--c-danger-fg)' : 'var(--c-ink-strong)' }} numberOfLines={1}>{value}</Text>
                {suffix ? <Text className="text-[11.5px] font-semibold leading-none" style={{ color: 'var(--c-muted)' }}>{suffix}</Text> : null}
            </View>
            {shortLabel ? (
                <>
                    <Text className="lg:hidden text-[11px] font-medium mt-1.5" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{shortLabel}</Text>
                    <Text className="hidden lg:flex text-[11px] font-medium mt-1.5" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{label}</Text>
                </>
            ) : (
                <Text className="text-[11px] font-medium mt-1.5" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{label}</Text>
            )}
            {bar != null ? (
                <View className="h-1 rounded-full overflow-hidden mt-1.5" style={{ backgroundColor: 'var(--c-surface-3)' }}>
                    <View className="ui-bar h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, bar))}%`, backgroundColor: dot }} />
                </View>
            ) : null}
            {/* With a bar too: an attendance rate names its period under it. */}
            {hint ? (
                <Text className={`${shortLabel ? 'hidden lg:flex ' : ''}text-[10.5px] ${bar != null ? 'mt-1' : 'mt-0.5'}`} style={{ color: 'var(--c-faint)' }} numberOfLines={1}>{hint}</Text>
            ) : null}
        </View>
    );
}
