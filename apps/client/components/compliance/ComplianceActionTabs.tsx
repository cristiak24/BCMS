import React from 'react';
import { View, Text, Pressable } from '@/src/web/reactNative';
import { Filter } from 'lucide-react';

interface ComplianceActionTabsProps {
  activeTab: 'active' | 'archives';
  onChangeTab: (tab: 'active' | 'archives') => void;
}

export default function ComplianceActionTabs({ activeTab, onChangeTab }: ComplianceActionTabsProps) {
  return (
    <View className="flex-col md:flex-row justify-between items-center mb-6">
      <Text className="text-2xl font-black text-[#0D2040] mb-4 md:mb-0 tracking-tight">Compliance Directory</Text>
      
      <View className="flex-row items-center gap-4">
        {/* Tabs Container */}
        <View className="bg-gray-100/80 p-1 rounded-full flex-row">
          <Pressable 
            onPress={() => onChangeTab('active')}
            className={`px-6 py-2 rounded-full transition-colors ${activeTab === 'active' ? 'bg-white shadow-sm border border-gray-200' : ''}`}
          >
            <Text className={`text-[13px] font-bold ${activeTab === 'active' ? 'text-[#1D3E90]' : 'text-gray-500'}`}>Active Roster</Text>
          </Pressable>
          <Pressable 
            onPress={() => onChangeTab('archives')}
            className={`px-6 py-2 rounded-full transition-colors ${activeTab === 'archives' ? 'bg-white shadow-sm border border-gray-200' : ''}`}
          >
            <Text className={`text-[13px] font-bold ${activeTab === 'archives' ? 'text-[#1D3E90]' : 'text-gray-500'}`}>Archives</Text>
          </Pressable>
        </View>

        {/* Filter Button */}
        <Pressable className="bg-gray-50 border border-gray-200 px-4 py-2.5 rounded-full flex-row items-center gap-2 hover:bg-gray-100 transition-colors">
           <Filter size={16} color="var(--c-muted)" />
           <Text className="text-[13px] font-bold text-gray-600">Filter</Text>
        </Pressable>
      </View>
    </View>
  );
}
