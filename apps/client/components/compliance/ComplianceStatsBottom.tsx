import React from 'react';
import { View, Text } from '@/src/web/reactNative';
import { Users, CheckCircle, ShieldCheck } from 'lucide-react';

export default function ComplianceStatsBottom() {
  return (
    <View className="flex-col md:flex-row gap-6 mt-8 w-full">
      <View className="flex-1 bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex-row items-center gap-4">
        <View className="w-12 h-12 rounded-full bg-blue-50 items-center justify-center">
          <Users size={20} color="#1D3E90" />
        </View>
        <View>
          <Text className="text-2xl font-black text-[#0D2040]">48</Text>
          <Text className="text-[10px] font-black uppercase tracking-widest text-gray-500 mt-1">Pending Reviews</Text>
        </View>
      </View>

      <View className="flex-1 bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex-row items-center gap-4">
        <View className="w-12 h-12 rounded-full bg-teal-50 items-center justify-center">
          <CheckCircle size={20} color="#0f766e" />
        </View>
        <View>
          <Text className="text-2xl font-black text-[#0D2040]">102</Text>
          <Text className="text-[10px] font-black uppercase tracking-widest text-gray-500 mt-1">Cleared Athletes</Text>
        </View>
      </View>

      <View className="flex-1 bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex-row items-center gap-4">
        <View className="w-12 h-12 rounded-full bg-slate-100 items-center justify-center">
          <ShieldCheck size={20} color="#0f172a" />
        </View>
        <View>
          <Text className="text-2xl font-black text-[#0D2040]">100%</Text>
          <Text className="text-[10px] font-black uppercase tracking-widest text-gray-500 mt-1">Audit Ready</Text>
        </View>
      </View>
    </View>
  );
}
