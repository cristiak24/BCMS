import { useState } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';

/**
 * Labelled text field at admin density (44px control, 12.5px label), fully
 * token-driven. Shared by the profile forms and the schedule's event form.
 * `multiline` renders a growing textarea instead of a single line.
 */
export function FormField({
  label,
  icon,
  hint,
  error,
  secureTextEntry,
  ...inputProps
}: TextInputProps & {
  label: string;
  icon?: string;
  hint?: string;
  error?: string | null;
}) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const borderColor = error ? 'var(--c-danger)' : focused ? 'var(--c-brand-border)' : 'var(--c-border)';

  return (
    <View className="min-w-0">
      <Text className="text-[12.5px] font-semibold mb-1.5" style={{ color: 'var(--c-ink-soft)' }}>{label}</Text>
      <View
        className={`flex-row gap-2.5 rounded-[11px] border px-3 ${inputProps.multiline ? 'items-start py-2.5 min-h-[92px]' : 'items-center h-11'}`}
        style={{
          backgroundColor: 'var(--c-surface-2)',
          borderColor,
          boxShadow: focused ? '0 0 0 3px color-mix(in srgb, var(--c-brand-surface) 18%, transparent)' : 'none',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        } as any}
      >
        {icon ? <MaterialIcons name={icon} size={17} color={focused ? 'var(--c-brand-fg)' : 'var(--c-faint)'} /> : null}
        <TextInput
          {...inputProps}
          accessibilityLabel={label}
          secureTextEntry={secureTextEntry && !revealed}
          placeholderTextColor="var(--c-faint)"
          onFocus={(event: any) => {
            setFocused(true);
            inputProps.onFocus?.(event);
          }}
          onBlur={(event: any) => {
            setFocused(false);
            inputProps.onBlur?.(event);
          }}
          className={`flex-1 min-w-0 bg-transparent text-[14px] font-medium outline-none ${inputProps.multiline ? 'min-h-[72px] resize-none leading-5' : 'h-full'}`}
          style={{ color: 'var(--c-ink)', border: 'none' } as any}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setRevealed((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Ascunde parola' : 'Arată parola'}
            className="w-8 h-8 -mr-1 rounded-[8px] items-center justify-center"
          >
            <MaterialIcons name={revealed ? 'visibility' : 'visibility-off'} size={17} color="var(--c-muted)" />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text className="text-[12px] font-semibold mt-1.5" style={{ color: 'var(--c-danger-fg)' }} data-field-error>{error}</Text>
      ) : hint ? (
        <Text className="text-[12px] font-medium mt-1.5" style={{ color: 'var(--c-faint)' }}>{hint}</Text>
      ) : null}
    </View>
  );
}
