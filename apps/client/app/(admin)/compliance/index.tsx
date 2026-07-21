import React, { useState, useEffect } from 'react';
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
            <PenLine size={16} color="#0D2040" />
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

  const handleToggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  return (
    <View className="flex-1 w-full mx-auto bg-[#F1F5F9] pb-20">
      <ScrollView className="flex-1 w-full px-4 md:px-12 pt-10" showsVerticalScrollIndicator={false}>
          
          <View className="mb-8">
            <Text className="text-[#1D3E90] text-[32px] font-black tracking-tight leading-tight">Compliance Manager</Text>
            <Text className="text-[#64748B] text-[14px] font-semibold mt-1">Medical Clearances & Visa renewals</Text>
          </View>

          <ComplianceStatsTop />

          <View className="mt-6">
            <ComplianceActionTabs activeTab={activeTab} onChangeTab={setActiveTab} />
            <View className="mb-6">
                {loading ? (
                    <View className="bg-white rounded-3xl p-12 items-center justify-center border border-gray-100">
                        <ActivityIndicator size="large" color="#1D3E90" />
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

          <ComplianceStatsBottom />

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
