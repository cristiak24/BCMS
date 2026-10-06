import type { ReactNode } from 'react';
import { View, Text } from '@/src/web/reactNative';

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

/** Friendly page header: soft tint circle + court lines, display-font title, actions, optional stat tiles below. */
export default function PageHero({
    eyebrow,
    title,
    subtitle,
    actions,
    leading,
    children,
    className,
}: {
    eyebrow: string;
    title: string;
    subtitle?: string;
    actions?: ReactNode;
    leading?: ReactNode;
    children?: ReactNode;
    className?: string;
}) {
    return (
        <View
            className={`ui-rise relative overflow-hidden rounded-[16px] border ${className ?? 'mb-4'}`}
            style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
        >
            <View
                pointerEvents="none"
                className="absolute rounded-full"
                style={{ width: 300, height: 300, right: -70, top: -130, backgroundColor: 'var(--c-surface-tint)', opacity: 0.85 }}
            />
            <CourtLines />
            <View className="relative gap-3.5 p-4 md:p-5">
                <View className="flex-col md:flex-row md:items-center md:justify-between gap-3.5">
                    <View className="flex-row items-center gap-3.5 min-w-0 flex-1">
                        {leading}
                        <View className="min-w-0 flex-1">
                            <Text className="t-eyebrow" style={{ color: 'var(--c-muted)' }}>{eyebrow}</Text>
                            <Text className="f-display text-[22px] md:text-[26px] font-extrabold leading-tight mt-1" style={{ color: 'var(--c-ink-strong)', letterSpacing: '-0.035em' } as any}>
                                {title}
                            </Text>
                            {subtitle ? <Text className="text-[13px] mt-1" style={{ color: 'var(--c-muted)' }}>{subtitle}</Text> : null}
                        </View>
                    </View>
                    {actions ? <View className="flex-row flex-wrap items-center gap-2">{actions}</View> : null}
                </View>
                {children}
            </View>
        </View>
    );
}

/** Small translucent stat tile for use inside PageHero. */
export function GlassStat({
    value,
    suffix,
    label,
    hint,
    dot,
    danger,
    bar,
}: {
    value: string | number;
    suffix?: string;
    label: string;
    hint?: string;
    dot: string;
    danger?: boolean;
    bar?: number;
}) {
    return (
        <View className="glass rounded-[12px] px-3 py-2.5 min-w-0" style={{ boxShadow: 'var(--e-sm)' } as any}>
            <View className="flex-row items-baseline gap-1">
                <View className="w-[6px] h-[6px] rounded-full shrink-0 self-center" style={{ backgroundColor: dot }} />
                <Text className="f-display t-num text-[19px] font-extrabold leading-none" style={{ color: danger ? 'var(--c-danger-fg)' : 'var(--c-ink-strong)' }} numberOfLines={1}>{value}</Text>
                {suffix ? <Text className="text-[11.5px] font-semibold leading-none" style={{ color: 'var(--c-muted)' }}>{suffix}</Text> : null}
            </View>
            <Text className="text-[11px] font-medium mt-1.5" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{label}</Text>
            {bar != null ? (
                <View className="h-1 rounded-full overflow-hidden mt-1.5" style={{ backgroundColor: 'var(--c-surface-3)' }}>
                    <View className="ui-bar h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, bar))}%`, backgroundColor: dot }} />
                </View>
            ) : hint ? (
                <Text className="text-[10.5px] mt-0.5" style={{ color: 'var(--c-faint)' }} numberOfLines={1}>{hint}</Text>
            ) : null}
        </View>
    );
}
