import { View, TextInput, Text, Pressable, TextInputProps } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useState } from 'react';

interface AuraInputProps extends TextInputProps {
    label: string;
    iconName: keyof typeof MaterialIcons.glyphMap;
    error?: string;
}

/**
 * Componenta AuraInput - Camp de text stilizat.
 * Include eticheta, icoana, si buton de ascundere parola (pentru secureTextEntry).
 */
export default function AuraInput({ label, iconName, error, secureTextEntry, className, ...props }: AuraInputProps) {
    const [isPasswordVisible, setPasswordVisible] = useState(false);
    const [isFocused, setFocused] = useState(false);
    const isPassword = secureTextEntry;
    const { editable: editableProp, onBlur, onFocus, ...inputProps } = props;
    const editable = editableProp !== false;

    return (
        <View className={`mb-1 ${className ?? ''}`}>
            <Text className="text-slate-600 text-xs font-black uppercase tracking-wider mb-2">
                {label}
            </Text>
            <View
                className={`bg-white border rounded-lg flex-row items-center px-4 min-h-[52px] transition-colors ${
                    error ? 'border-red-500' : isFocused ? 'border-blue-600' : 'border-slate-200'
                } ${editable ? '' : 'opacity-70'}`}
            >
                <MaterialIcons name={iconName} size={22} color="#2563EB" style={{ opacity: 0.8 }} />
                <TextInput
                    className="flex-1 ml-3 text-slate-900 text-base outline-none min-h-[48px] placeholder:text-slate-400"
                    placeholderTextColor="#9ca3af"
                    secureTextEntry={isPassword && !isPasswordVisible}
                    editable={editable}
                    accessibilityLabel={label}
                    onFocus={(event) => {
                        setFocused(true);
                        onFocus?.(event);
                    }}
                    onBlur={(event) => {
                        setFocused(false);
                        onBlur?.(event);
                    }}
                    {...inputProps}
                />
                {isPassword && (
                    <Pressable
                        onPress={() => setPasswordVisible(!isPasswordVisible)}
                        className="w-10 h-10 items-center justify-center"
                        accessibilityRole="button"
                        accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
                    >
                        <MaterialIcons
                            name={isPasswordVisible ? "visibility" : "visibility-off"}
                            size={22}
                            color="#2563EB"
                        />
                    </Pressable>
                )}
            </View>
            {error && <Text className="text-red-600 text-xs font-semibold mt-1">{error}</Text>}
        </View>
    );
}
