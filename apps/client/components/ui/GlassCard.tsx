import { View, ViewProps } from '@/src/web/reactNative';
import type { ReactNode } from 'react';

interface GlassCardProps extends ViewProps {
    children: ReactNode;
    className?: string;
}

export default function GlassCard({ children, className, ...props }: GlassCardProps) {
    return (
        <View
            className={`bg-white border border-[#DDE7F5] rounded-lg shadow-lg p-6 overflow-hidden ${className ?? ''}`}
            {...props}
        >
            {children}
        </View>
    );
}
