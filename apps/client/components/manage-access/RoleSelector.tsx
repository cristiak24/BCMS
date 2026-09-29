import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { Pressable, Text, View } from '@/src/web/reactNative';
import type { InviteRole } from '../../types/manageAccess';

export const ROLE_LABELS: Record<InviteRole, string> = {
    player: 'Jucător',
    parent: 'Părinte',
    coach: 'Antrenor',
};

const ROLE_OPTIONS: { role: InviteRole; icon: string }[] = [
    { role: 'player', icon: 'sports-basketball' },
    { role: 'parent', icon: 'family-restroom' },
    { role: 'coach', icon: 'sports' },
];

type Props = {
    selectedRole: InviteRole;
    onSelectRole: (role: InviteRole) => void;
};

/**
 * Role picker as one segmented control. It used to be three stacked 72px cards
 * (~250px of a phone screen), repeated in both the link and the code panel —
 * the main reason the page read as a wall of boxes.
 */
export default function RoleSelector({ selectedRole, onSelectRole }: Props) {
    return (
        <View
            className="flex-row p-[3px] rounded-[11px]"
            style={{ backgroundColor: 'var(--c-surface-3)' }}
            accessibilityRole={'radiogroup' as any}
            accessibilityLabel="Rol"
        >
            {ROLE_OPTIONS.map((option) => {
                const active = option.role === selectedRole;
                return (
                    <Pressable
                        key={option.role}
                        onPress={() => onSelectRole(option.role)}
                        accessibilityRole={'radio' as any}
                        accessibilityState={{ checked: active, selected: active }}
                        className="flex-1 min-w-0 h-9 rounded-[8px] flex-row items-center justify-center gap-1.5"
                        style={active
                            ? { backgroundColor: 'var(--c-surface)', boxShadow: 'var(--e-xs)' } as any
                            : undefined}
                    >
                        <MaterialIcons name={option.icon} size={15} color={active ? 'var(--c-brand-fg)' : 'var(--c-faint)'} />
                        <Text
                            numberOfLines={1}
                            className="text-[13px] font-semibold"
                            style={{ color: active ? 'var(--c-ink)' : 'var(--c-muted)' }}
                        >
                            {ROLE_LABELS[option.role]}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

/** Small uppercase field label used across the access panels. */
export function FieldLabel({ children, hint }: { children: string; hint?: string }) {
    return (
        <View className="flex-row items-baseline justify-between gap-2 mb-2">
            <Text className="t-eyebrow" style={{ color: 'var(--c-faint)' }}>{children}</Text>
            {hint ? <Text className="text-[11.5px]" style={{ color: 'var(--c-faint)' }}>{hint}</Text> : null}
        </View>
    );
}

/** Compact option chip (validity presets). */
export function OptionChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className="ui-press h-8 px-3 rounded-[9px] border items-center justify-center shrink-0"
            style={active
                ? { backgroundColor: 'var(--c-surface-tint)', borderColor: 'var(--c-brand-border)' } as any
                : { backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
        >
            <Text className="text-[12.5px] font-semibold" style={{ color: active ? 'var(--c-brand-fg)' : 'var(--c-ink-soft)' }}>
                {label}
            </Text>
        </Pressable>
    );
}

/** Plain surface card used by every access panel. */
export function AccessCard({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <View
            className={`ui-rise rounded-[16px] border p-4 md:p-5 ${className ?? ''}`}
            style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
        >
            {children}
        </View>
    );
}

export function AccessButton({
    label,
    icon,
    onPress,
    variant = 'primary',
    disabled,
    loading,
    className,
}: {
    label: string;
    icon?: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'danger';
    disabled?: boolean;
    loading?: boolean;
    className?: string;
}) {
    const inactive = Boolean(disabled || loading);
    const palette = variant === 'primary'
        ? { bg: 'var(--c-brand-surface)', border: 'transparent', fg: 'var(--c-on-brand)' }
        : variant === 'danger'
            ? { bg: 'var(--c-surface)', border: 'var(--c-danger-border)', fg: 'var(--c-danger-fg)' }
            : { bg: 'var(--c-surface)', border: 'var(--c-border)', fg: 'var(--c-ink-soft)' };
    return (
        <Pressable
            onPress={onPress}
            disabled={inactive}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: inactive, busy: Boolean(loading) }}
            className={`ui-press h-10 px-4 rounded-[10px] border flex-row items-center justify-center gap-1.5 ${className ?? ''}`}
            style={{
                backgroundColor: palette.bg,
                borderColor: palette.border,
                opacity: inactive && !loading ? 0.55 : 1,
                cursor: inactive ? 'not-allowed' : 'pointer',
            } as any}
        >
            {loading ? (
                <View className="w-3.5 h-3.5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--c-border)', borderTopColor: palette.fg } as any} />
            ) : icon ? (
                <MaterialIcons name={icon} size={16} color={palette.fg} />
            ) : null}
            <Text numberOfLines={1} className="text-[13px] font-bold" style={{ color: palette.fg }}>{label}</Text>
        </Pressable>
    );
}
