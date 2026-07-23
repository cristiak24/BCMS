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
            className={`rounded-[16px] px-4 py-3 flex-row items-center shadow-sm ${
                isPrimary
                    ? 'bg-[#123A97]'
                    : 'border border-[#DDE7F5] bg-white hover:border-blue-200'
            } ${disabled ? 'opacity-60' : ''} ${className ?? ''}`}
        >
            <MaterialIcons name={icon} size={18} color={isPrimary ? '#FFFFFF' : 'var(--c-ink-soft)'} />
            <Text className={`${isPrimary ? 'text-white' : 'text-slate-700'} font-bold ml-2`}>
                {label}
            </Text>
        </Pressable>
    );
}
