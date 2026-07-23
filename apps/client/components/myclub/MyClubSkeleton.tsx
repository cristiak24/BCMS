import React from 'react';
import { View } from '@/src/web/reactNative';
import { Skeleton } from '../ui/Skeleton';

/** Loading placeholder that mirrors the KPI strip + card grid so the layout
 * doesn't jump when real data arrives. Replaces the full-screen spinner. */
export default function MyClubSkeleton() {
    return (
        <View className="w-full">
            {/* KPI strip */}
            <View className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6 w-full">
                {Array.from({ length: 6 }).map((_, i) => (
                    <View key={i} className="bg-white rounded-[18px] border border-[#DDE7F5] px-4 py-3.5 flex-col gap-2">
                        <Skeleton className="h-6 w-10" />
                        <Skeleton className="h-3 w-24" />
                    </View>
                ))}
            </View>

            {/* Filter bar */}
            <View className="bg-white rounded-[22px] border border-[#DDE7F5] p-4 mb-6 flex-col gap-3.5 w-full">
                <View className="flex-row items-center gap-3">
                    <Skeleton className="h-[38px] w-full sm:w-[280px] rounded-[12px]" />
                    <Skeleton className="h-[34px] w-40 rounded-[10px] ml-auto" />
                </View>
                <View className="flex-row flex-wrap gap-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton key={i} className="h-7 w-20 rounded-full" />
                    ))}
                </View>
            </View>

            {/* Card grid */}
            <View className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 w-full">
                {Array.from({ length: 6 }).map((_, i) => (
                    <View key={i} className="bg-white rounded-[20px] p-5 border border-[#E3E9F2] flex-col gap-3.5">
                        <View className="flex-row items-start gap-3">
                            <Skeleton className="w-11 h-11 rounded-[13px]" />
                            <View className="flex-1 gap-2">
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-3 w-1/2" />
                            </View>
                        </View>
                        <View className="flex-row gap-1.5">
                            <Skeleton className="h-5 w-24 rounded-full" />
                            <Skeleton className="h-5 w-16 rounded-full" />
                        </View>
                        <View className="flex-row gap-2.5">
                            <Skeleton className="flex-1 h-14 rounded-[13px]" />
                            <Skeleton className="flex-1 h-14 rounded-[13px]" />
                        </View>
                        <Skeleton className="h-10 w-full rounded-[12px]" />
                    </View>
                ))}
            </View>
        </View>
    );
}
