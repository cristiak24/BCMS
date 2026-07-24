import { View } from '@/src/web/reactNative';
import GlassCard from './GlassCard';

/**
 * Lightweight shimmer placeholders. Rendering these while data loads keeps the
 * layout stable (no full-screen spinner → no content jump) and signals progress.
 */

type SkeletonProps = {
    className?: string;
};

/**
 * A single shimmering block. Size/shape is controlled via `className`.
 *
 * The fill is token-driven rather than a fixed `bg-slate-200`, which stayed a
 * bright light-grey slab on dark backgrounds. `aria-hidden` keeps the loading
 * scaffold out of the accessibility tree — the surrounding region announces the
 * loading state instead.
 */
export function Skeleton({ className }: SkeletonProps) {
    return (
        <View
            aria-hidden="true"
            className={`rounded-lg animate-pulse ${className ?? ''}`}
            style={{ backgroundColor: 'var(--c-surface-3)' }}
        />
    );
}

/** Placeholder that mirrors an account / request card layout. */
export function SkeletonCard() {
    return (
        <GlassCard className="p-5">
            <View className="flex-row items-start justify-between gap-4">
                <View className="flex-1">
                    <Skeleton className="h-5 w-2/5 mb-3" />
                    <Skeleton className="h-4 w-3/5 mb-2" />
                    <Skeleton className="h-4 w-1/3" />
                </View>
                <Skeleton className="h-6 w-20 rounded-full" />
            </View>
            <View className="mt-5 flex-row gap-3">
                <Skeleton className="h-11 w-28 rounded-2xl" />
                <Skeleton className="h-11 w-28 rounded-2xl" />
            </View>
        </GlassCard>
    );
}

/** Renders `count` card skeletons with consistent spacing. */
export function SkeletonList({ count = 3 }: { count?: number }) {
    return (
        <View className="gap-4" accessibilityRole="progressbar" accessibilityLabel="Se încarcă...">
            {Array.from({ length: count }).map((_, index) => (
                <SkeletonCard key={index} />
            ))}
        </View>
    );
}
