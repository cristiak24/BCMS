import type { ReactNode } from 'react';
import { Text, View } from '@/src/web/reactNative';

type AdminHeroProps = {
    title: string;
    subtitle: string;
    children?: ReactNode;
    className?: string;
};

export default function AdminHero({ title, subtitle, children, className }: AdminHeroProps) {
    return (
        <View className={`mb-8 bg-[#123A97] rounded-[32px] p-6 md:p-8 shadow-xl border border-white/40 ${className ?? ''}`}>
            <View className="flex-1 pr-0 md:pr-6">
                <Text className="text-white text-[28px] md:text-[36px] font-black tracking-tight leading-tight">
                    {title}
                </Text>
                <Text className="text-[#D6E6FF] text-[14px] font-semibold mt-2">
                    {subtitle}
                </Text>
            </View>
            {children}
        </View>
    );
}

export function AdminMetricCard({ label, value }: { label: string; value: string | number }) {
    return (
        <View className="px-5 py-4 min-w-[150px] bg-white/95 border border-white/70 rounded-[24px] shadow-lg">
            <Text className="text-[11px] uppercase tracking-[1.5px] font-black text-slate-500">{label}</Text>
            <Text className="text-3xl font-black text-slate-900 mt-2">{value}</Text>
        </View>
    );
}
