import type { ComponentProps } from 'react';
import { Pressable, Text } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';

type IconName = keyof typeof MaterialIcons.glyphMap;

type AdminActionButtonProps = {
    label: string;
    icon: IconName;
    onPress: () => void;
    variant?: 'primary' | 'secondary';
    className?: string;
    disabled?: boolean;
} & Pick<ComponentProps<typeof Pressable>, 'accessibilityLabel'>;

export default function AdminActionButton({
    label,
    icon,
    onPress,
    variant = 'secondary',
    className,
    disabled,
    accessibilityLabel,
}: AdminActionButtonProps) {
    const isPrimary = variant === 'primary';

    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityLabel={accessibilityLabel ?? label}
            className={`rounded-[10px] h-10 px-3.5 flex-row items-center ${disabled ? 'opacity-60' : ''} ${className ?? ''}`}
            style={isPrimary
                ? { backgroundColor: 'var(--c-brand-surface)', boxShadow: 'var(--e-brand)' } as any
                : { backgroundColor: 'var(--c-surface)', borderWidth: 1, borderColor: 'var(--c-border)' } as any}
        >
            <MaterialIcons name={icon} size={16} color={isPrimary ? 'var(--c-on-brand)' : 'var(--c-ink-soft)'} />
            <Text className="font-semibold ml-2 text-[13px]" style={{ color: isPrimary ? 'var(--c-on-brand)' : 'var(--c-ink-soft)' }}>
                {label}
            </Text>
        </Pressable>
    );
}
