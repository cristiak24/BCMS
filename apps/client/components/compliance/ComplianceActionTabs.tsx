import React from 'react';
import { View, Text, Pressable } from '@/src/web/reactNative';
import { Filter } from 'lucide-react';

interface ComplianceActionTabsProps {
  activeTab: 'active' | 'archives';
  onChangeTab: (tab: 'active' | 'archives') => void;
}

export default function ComplianceActionTabs({ activeTab, onChangeTab }: ComplianceActionTabsProps) {
  return (
    <View className="flex-col md:flex-row md:justify-between md:items-center gap-3 mb-4">
      <Text className="text-[17px] font-bold tracking-tight" style={{ color: 'var(--c-ink)' }}>Compliance Directory</Text>

      <View className="flex-row items-center gap-2">
        {/* Segmented tabs */}
        <View className="p-[3px] rounded-[10px] flex-row" style={{ backgroundColor: 'var(--c-surface-3)' }}>
          <Pressable
            onPress={() => onChangeTab('active')}
            className="px-3.5 h-8 rounded-[8px] justify-center"
            style={activeTab === 'active' ? { backgroundColor: 'var(--c-surface)', boxShadow: 'var(--e-xs)' } as any : undefined}
          >
            <Text className="text-[12px] font-semibold" style={{ color: activeTab === 'active' ? 'var(--c-ink)' : 'var(--c-muted)' }}>Active Roster</Text>
          </Pressable>
          <Pressable
            onPress={() => onChangeTab('archives')}
            className="px-3.5 h-8 rounded-[8px] justify-center"
            style={activeTab === 'archives' ? { backgroundColor: 'var(--c-surface)', boxShadow: 'var(--e-xs)' } as any : undefined}
          >
            <Text className="text-[12px] font-semibold" style={{ color: activeTab === 'archives' ? 'var(--c-ink)' : 'var(--c-muted)' }}>Archives</Text>
          </Pressable>
        </View>

        <Pressable className="h-9 px-3 rounded-[10px] flex-row items-center gap-1.5 border" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
           <Filter size={14} color="var(--c-muted)" />
           <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>Filter</Text>
        </Pressable>
      </View>
    </View>
  );
}
