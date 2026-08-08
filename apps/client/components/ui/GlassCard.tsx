import { View, ViewProps } from '@/src/web/reactNative';
import type { ReactNode } from 'react';

interface GlassCardProps extends ViewProps {
    children: ReactNode;
    className?: string;
}

export default function GlassCard({ children, className, ...props }: GlassCardProps) {
    return (
        <View
            className={`relative rounded-[16px] border p-5 overflow-hidden ${className ?? ''}`}
            style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
            {...props}
        >
            {children}
        </View>
    );
}
