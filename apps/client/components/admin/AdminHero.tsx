import type { ReactNode } from 'react';
import { Text, View } from '@/src/web/reactNative';

type AdminHeroProps = {
    title: string;
    subtitle: string;
    children?: ReactNode;
    className?: string;
};

export default function AdminHero({ title, subtitle, children, className }: AdminHeroProps) {
    // Was a full-bleed 32px navy slab, ~180px tall, that repeated the page title
    // already shown in the app header and pushed real content down. Now a plain
    // titled header row on the page background — the title carries the section,
    // actions sit inline, no coloured block.
    return (
        <View className={`mb-5 flex-row flex-wrap items-center justify-between gap-3 ${className ?? ''}`}>
            <View className="flex-1 min-w-[220px]">
                <Text className="text-[24px] md:text-[28px] font-bold tracking-tight leading-tight" style={{ color: 'var(--c-ink-strong)' }}>
                    {title}
                </Text>
                <Text className="text-[13px] font-medium mt-1" style={{ color: 'var(--c-muted)' }}>
                    {subtitle}
                </Text>
            </View>
            {children}
        </View>
    );
}

export function AdminMetricCard({ label, value }: { label: string; value: string | number }) {
    // Compact tokenised stat cell. Was a white-on-navy card sized for the old
    // hero slab (2xl/3xl value, 24px radius); on the light page it now reads as
    // a small, quiet metric next to the title.
    return (
        <View
            className="min-w-[92px] px-3.5 py-2.5 rounded-[12px] border"
            style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
        >
            <Text
                numberOfLines={1}
                className="text-[10px] uppercase tracking-wider font-semibold"
                style={{ color: 'var(--c-faint)' }}
            >
                {label}
            </Text>
            <Text className="text-[20px] font-bold mt-1 tabular" style={{ color: 'var(--c-ink)' }}>{value}</Text>
        </View>
    );
}
