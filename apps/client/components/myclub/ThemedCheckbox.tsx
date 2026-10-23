import React from 'react';
import { Pressable, View } from '@/src/web/reactNative';
import { Check } from 'lucide-react';

export default function ThemedCheckbox({
    checked,
    onToggle,
    ariaLabel,
    size = 20,
}: {
    checked: boolean;
    onToggle: () => void;
    ariaLabel?: string;
    size?: number;
}) {
    // 32px touch target around the drawn box; layout unchanged (negative margin).
    const hit = Math.max(size, 40); // ≥40px to touch; the negative margin keeps the layout
    return (
        <Pressable
            onPress={(event: any) => {
                event?.stopPropagation?.();
                onToggle();
            }}
            accessibilityRole="checkbox"
            accessibilityLabel={ariaLabel}
            aria-checked={checked}
            className="items-center justify-center shrink-0"
            style={{ width: hit, height: hit, margin: -(hit - size) / 2 }}
        >
            {/* Theme tokens: the fixed navy/white box stayed a white square on
                the dark theme (WP7-E9). */}
            <View
                className="items-center justify-center rounded-[7px] border-2 transition-colors"
                style={{
                    width: size,
                    height: size,
                    backgroundColor: checked ? 'var(--c-brand-surface)' : 'var(--c-surface)',
                    borderColor: checked ? 'var(--c-brand-surface)' : 'var(--c-border-strong)',
                } as any}
            >
                {checked && <Check size={Math.round(size * 0.62)} color="var(--c-on-brand)" strokeWidth={3.5} />}
            </View>
        </Pressable>
    );
}
