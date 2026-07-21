import React from 'react';
import { Pressable } from '@/src/web/reactNative';
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
    return (
        <Pressable
            onPress={(event: any) => {
                event?.stopPropagation?.();
                onToggle();
            }}
            accessibilityLabel={ariaLabel}
            className={`items-center justify-center rounded-[7px] border-2 transition-colors ${
                checked
                    ? 'bg-[#1D3E90] border-[#1D3E90]'
                    : 'bg-white border-[#CBD5E1] hover:border-[#1D3E90]'
            }`}
            style={{ width: size, height: size }}
        >
            {checked && <Check size={Math.round(size * 0.62)} color="#ffffff" strokeWidth={3.5} />}
        </Pressable>
    );
}
