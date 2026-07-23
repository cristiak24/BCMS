import React from 'react';
import { View, Text } from '@/src/web/reactNative';
import { AlertCircle, CalendarClock } from 'lucide-react';

export default function ComplianceStatsTop() {
  return (
    <View className="flex-col md:flex-row gap-6 mb-8 w-full">
      {/* Global Club Compliance */}
      <View className="flex-1 bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex-row justify-between items-center">
        <View className="flex-1 pr-4">
          <Text className="text-xl font-black text-[#0D2040] mb-2 leading-tight">Global Club{"\n"}Compliance</Text>
          <Text className="text-[13px] text-gray-500 font-medium leading-snug mb-4">Overall health of player visas and medical clearance documents.</Text>
          <View className="bg-blue-50 px-3 py-1.5 rounded-full self-start">
             <Text className="text-xs font-bold text-[#1D3E90]">Updated 2h ago</Text>
          </View>
        </View>
        
        {/* Mock Donut Chart */}
        <View className="w-28 h-28 rounded-full border-[10px] border-blue-50 border-r-[#1D3E90] border-b-[#1D3E90] border-l-[#1D3E90] items-center justify-center bg-white">
           <Text className="text-2xl font-black text-[#0D2040]">84%</Text>
           <Text className="text-[9px] font-black uppercase text-gray-400 tracking-widest mt-1">Secure</Text>
        </View>
      </View>

      {/* Expired Visas */}
      <View className="flex-1 bg-white rounded-3xl p-6 shadow-sm border-2 border-r-gray-100 border-b-gray-100 border-t-gray-100 border-l-red-600 relative overflow-hidden flex-col justify-between">
         <View className="flex-row justify-between items-start mb-4">
             <View className="w-8 h-8 rounded-full bg-red-50 items-center justify-center">
                <AlertCircle size={18} color="var(--c-danger)" />
             </View>
             <Text className="text-4xl font-black text-red-600">04</Text>
         </View>
         <View>
             <Text className="text-lg font-black text-[#0D2040] mb-1">Expired Visas</Text>
             <Text className="text-[13px] text-gray-500 font-medium leading-snug">Requires immediate renewal action</Text>
         </View>
      </View>

      {/* Due Next 30 Days */}
      <View className="flex-1 bg-white rounded-3xl p-6 shadow-sm border-2 border-r-gray-100 border-b-gray-100 border-t-gray-100 border-l-[#3b82f6] relative overflow-hidden flex-col justify-between">
         <View className="flex-row justify-between items-start mb-4">
             <View className="w-8 h-8 rounded-full bg-blue-50 items-center justify-center">
                <CalendarClock size={18} color="var(--c-blue)" />
             </View>
             <Text className="text-4xl font-black text-[#0D2040]">12</Text>
         </View>
         <View>
             <Text className="text-lg font-black text-[#0D2040] mb-1">Due Next 30 Days</Text>
             <Text className="text-[13px] text-gray-500 font-medium leading-snug">Documentation updates scheduled</Text>
         </View>
      </View>
    </View>
  );
}
