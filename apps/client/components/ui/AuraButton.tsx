import { View, Text, Pressable, PressableProps, ActivityIndicator } from '@/src/web/reactNative';
import { LinearGradient } from '@/src/web/linearGradient';
import { MaterialIcons } from '@/src/web/expoVectorIcons';

interface AuraButtonProps extends PressableProps {
    label: string;
    loading?: boolean;
    variant?: 'primary' | 'secondary';
    className?: string;
    iconName?: keyof typeof MaterialIcons.glyphMap;
}

export default function AuraButton({ label, loading, variant = 'primary', className, iconName, ...props }: AuraButtonProps) {
    const disabled = Boolean(props.disabled || loading);

    return (
        <Pressable
            className={`rounded-lg shadow-lg active:scale-95 transition-transform ${className ?? ''} ${disabled ? 'opacity-70' : ''}`}
            {...props}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled, busy: Boolean(loading) }}
        >
            {variant === 'primary' ? (
                <LinearGradient
                    colors={['#1e3a8a', '#0ea5e9']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    className="min-h-[52px] rounded-lg items-center justify-center w-full shadow-blue-500/30 px-5"
                >
                    {loading ? (
                        <View className="flex-row items-center gap-3">
                            <ActivityIndicator color="white" size="small" />
                            <Text className="font-bold text-base text-white">Please wait</Text>
                        </View>
                    ) : (
                        <View className="flex-row items-center justify-center gap-2">
                            {iconName ? <MaterialIcons name={iconName} size={19} color="#FFFFFF" /> : null}
                            <Text className="font-bold text-base text-white text-center">{label}</Text>
                            <MaterialIcons name="arrow-forward" size={19} color="#FFFFFF" />
                        </View>
                    )}
                </LinearGradient>
            ) : (
                <View className="min-h-[52px] rounded-lg items-center justify-center bg-white/70 border border-slate-200 px-5">
                    <Text className="font-bold text-base text-gray-800 text-center">{label}</Text>
                </View>
            )}
        </Pressable>
    );
}
