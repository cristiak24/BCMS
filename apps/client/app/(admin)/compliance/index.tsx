import React, { useState, useEffect, useMemo } from 'react';
import { View, ScrollView, Text, Pressable, ActivityIndicator } from '@/src/web/reactNative';
import { useHeader } from '../../../components/HeaderContext';
import { Plus, PenLine } from 'lucide-react';

// Import Components
import ComplianceStatsTop from '../../../components/compliance/ComplianceStatsTop';
import ComplianceActionTabs from '../../../components/compliance/ComplianceActionTabs';
import ComplianceTable from '../../../components/compliance/ComplianceTable';
import ComplianceStatsBottom from '../../../components/compliance/ComplianceStatsBottom';
import AddAppointmentModal from '../../../components/compliance/modals/AddAppointmentModal';
import UpdateFileModal from '../../../components/compliance/modals/UpdateFileModal';

import { computeComplianceMetrics } from '../../../components/compliance/complianceMetrics';

import { teamsApi, Player } from '../../../services/teamsApi';

export default function ComplianceDashboard() {
  const { setSearchPlaceholder, setHeaderActions } = useHeader();
  
  const [activeTab, setActiveTab] = useState<'active' | 'archives'>('active');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isNewEntryOpen, setIsNewEntryOpen] = useState(false);
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);

  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  // Sync Header Context
  useEffect(() => {
    setSearchPlaceholder("Căutare atleți sau documente...");
    setHeaderActions(
        <View className="flex-row gap-3">
          <Pressable 
            onPress={() => setIsNewEntryOpen(true)}
            className="bg-[#1D3E90] px-5 py-2.5 rounded-[14px] flex-row items-center gap-2 shadow-sm hover:scale-105 transition-transform"
          >
            <Plus size={16} color="white" strokeWidth={3} />
            <Text className="text-white font-black text-[12px] uppercase tracking-wider">New Entry</Text>
          </Pressable>
          <Pressable 
            onPress={() => setIsUpdateOpen(true)}
            className="bg-white border border-gray-200 px-5 py-2.5 rounded-[14px] flex-row items-center gap-2 shadow-sm hover:bg-gray-50 transition-colors"
          >
            <PenLine size={16} color="var(--c-ink)" />
            <Text className="text-[#0D2040] font-black text-[12px] uppercase tracking-wider">Update File</Text>
          </Pressable>
        </View>
    );

    return () => {
      setSearchPlaceholder('Căutare atleți, meciuri, rapoarte...');
      setHeaderActions(null);
    };
  }, [setHeaderActions, setSearchPlaceholder]);

  const loadData = async () => {
      setLoading(true);
      try {
          // get roster gets everyone in the db tracking
          const allPlayers = await teamsApi.getRoster();
          setPlayers(allPlayers);
      } catch(e) { console.error(e); }
      finally { setLoading(false); }
  };

  useEffect(() => {
      loadData();
  }, []);

  // KPIs are derived from the loaded roster rather than hardcoded, so the
  // headline figures always describe this club.
  const metrics = useMemo(() => computeComplianceMetrics(players), [players]);

  const handleToggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  return (
    <View className="flex-1 w-full mx-auto bg-[#F1F5F9] pb-20">
      <ScrollView className="flex-1 w-full px-4 md:px-6 pt-5" showsVerticalScrollIndicator={false}>

          <View className="mb-5">
            <Text className="text-[24px] font-bold tracking-tight leading-tight" style={{ color: 'var(--c-ink-strong)' }}>Compliance Manager</Text>
            <Text className="text-[13px] font-medium mt-1" style={{ color: 'var(--c-muted)' }}>Vize medicale & reînnoiri</Text>
          </View>

          <ComplianceStatsTop metrics={metrics} loading={loading} />

          <View className="mt-6">
            <ComplianceActionTabs activeTab={activeTab} onChangeTab={setActiveTab} />
            <View className="mb-6">
                {loading ? (
                    <View className="bg-white rounded-3xl p-12 items-center justify-center border border-gray-100">
                        <ActivityIndicator size="large" color="var(--c-brand-fg)" />
                    </View>
                ) : (
                    <ComplianceTable 
                      data={activeTab === 'active' ? players : []}
                      selectedIds={selectedIds}
                      onToggleSelect={handleToggleSelect}
                      onSelectAll={setSelectedIds}
                    />
                )}
            </View>
          </View>

          <ComplianceStatsBottom metrics={metrics} />

      </ScrollView>

      {/* Appointment Modal -> mostly UI only until API endpoints created but teams selector made dynamic */}
      <AddAppointmentModal 
        visible={isNewEntryOpen} 
        onClose={() => setIsNewEntryOpen(false)} 
        preSelectedPlayerIds={selectedIds}
      />

      {/* Update Medical File Modal -> Dynamic and functioning */}
      <UpdateFileModal
        visible={isUpdateOpen}
        onClose={() => setIsUpdateOpen(false)}
        onSuccess={loadData}
      />
    </View>
  );
}
