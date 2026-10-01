import React, { useState, useEffect, useMemo } from 'react';
import { View, ScrollView, Text, Pressable, ActivityIndicator, TouchableOpacity } from '@/src/web/reactNative';
import { useHeader } from '../../../components/HeaderContext';
import { useResponsive } from '../../../hooks/useResponsive';
import { Plus, PenLine } from 'lucide-react';

// Import Components
import ComplianceStatsTop from '../../../components/compliance/ComplianceStatsTop';
import ComplianceActionTabs from '../../../components/compliance/ComplianceActionTabs';
import ComplianceTable from '../../../components/compliance/ComplianceTable';
import ComplianceStatsBottom from '../../../components/compliance/ComplianceStatsBottom';
import AddAppointmentModal from '../../../components/compliance/modals/AddAppointmentModal';
import UpdateFileModal from '../../../components/compliance/modals/UpdateFileModal';
import RosterPagination from '../../../components/roster/RosterPagination';
import { ErrorState } from '../../../components/dashboard/ScreenStates';

const PLAYERS_PER_PAGE = 24;

import { computeComplianceMetrics } from '../../../components/compliance/complianceMetrics';

import { teamsApi, Player } from '../../../services/teamsApi';

export default function ComplianceDashboard() {
  const { setSearchPlaceholder, setHeaderActions, setMobileFab } = useHeader();
  const { isMobile } = useResponsive();

  const [activeTab, setActiveTab] = useState<'active' | 'archives'>('active');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isNewEntryOpen, setIsNewEntryOpen] = useState(false);
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);

  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync Header Context. On mobile the header actions row has no room for two
  // buttons (and the desktop header that renders `headerActions` isn't even
  // shown on phones — see (admin)/_layout.tsx), so New Entry moves to a FAB
  // and Update File follows it as a second stacked FAB.
  useEffect(() => {
    setSearchPlaceholder("Căutare atleți sau documente...");

    if (isMobile) {
      setHeaderActions(null);
      setMobileFab(
        <View style={{ position: 'absolute', bottom: 96, right: 24, gap: 12, alignItems: 'flex-end', zIndex: 30 }}>
          <TouchableOpacity
            onPress={() => setIsUpdateOpen(true)}
            style={{
              width: 48, height: 48, borderRadius: 24,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'var(--c-surface)', borderWidth: 1, borderColor: 'var(--c-border)',
              boxShadow: 'var(--e-card)',
            } as any}
          >
            <PenLine color="var(--c-ink)" size={19} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setIsNewEntryOpen(true)}
            style={{
              width: 56, height: 56, borderRadius: 28,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'var(--c-brand-surface)', boxShadow: 'var(--e-brand)',
            } as any}
          >
            <Plus color="var(--c-on-brand)" size={24} strokeWidth={3} />
          </TouchableOpacity>
        </View>
      );
    } else {
      setMobileFab(null);
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
              className="bg-[var(--c-surface)] border border-gray-200 px-5 py-2.5 rounded-[14px] flex-row items-center gap-2 shadow-sm hover:bg-gray-50 transition-colors"
            >
              <PenLine size={16} color="var(--c-ink)" />
              <Text className="text-[#0D2040] font-black text-[12px] uppercase tracking-wider">Update File</Text>
            </Pressable>
          </View>
      );
    }

    return () => {
      setSearchPlaceholder('Căutare atleți, meciuri, rapoarte...');
      setHeaderActions(null);
      setMobileFab(null);
    };
  }, [isMobile, setHeaderActions, setMobileFab, setSearchPlaceholder]);

  const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
          // get roster gets everyone in the db tracking
          const allPlayers = await teamsApi.getRoster();
          setPlayers(allPlayers);
      } catch(e) {
          console.error(e);
          setError('Nu am putut încărca lista de conformitate.');
      }
      finally { setLoading(false); }
  };

  useEffect(() => {
      loadData();
  }, []);

  // KPIs are derived from the loaded roster rather than hardcoded, so the
  // headline figures always describe this club.
  const metrics = useMemo(() => computeComplianceMetrics(players), [players]);

  const tableData = activeTab === 'active' ? players : [];
  const totalPages = Math.max(1, Math.ceil(tableData.length / PLAYERS_PER_PAGE));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * PLAYERS_PER_PAGE;
    return tableData.slice(start, start + PLAYERS_PER_PAGE);
  }, [tableData, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleToggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  return (
    <View className="flex-1 w-full mx-auto bg-[#F1F5F9] pb-20">
      <ScrollView className="flex-1 w-full px-4 md:px-6 pt-5" showsVerticalScrollIndicator={false}>

          {/* Desktop only — the mobile app header already names the page. */}
          <View className="hidden lg:flex mb-5">
            <Text className="text-[24px] font-bold tracking-tight leading-tight" style={{ color: 'var(--c-ink-strong)' }}>Conformitate</Text>
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
                ) : error && !players.length ? (
                    <ErrorState title="Nu am putut încărca lista" message={error} onRetry={loadData} />
                ) : (
                    <>
                      <ComplianceTable
                        data={paginatedData}
                        selectedIds={selectedIds}
                        onToggleSelect={handleToggleSelect}
                        onSelectAll={setSelectedIds}
                      />
                      <RosterPagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={tableData.length}
                        pageSize={PLAYERS_PER_PAGE}
                        onPageChange={setCurrentPage}
                      />
                    </>
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
