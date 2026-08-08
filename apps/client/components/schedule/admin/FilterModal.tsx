import React, { useMemo, useState } from 'react';
import { View, Text, Modal, Pressable, TouchableOpacity, ScrollView, TextInput } from '@/src/web/reactNative';
import { X, Check, Users, UserCog, Eye, Search } from 'lucide-react';
import { Team } from '../../../services/teamsApi';
import { EVENT_TYPE_META, EventType } from '../scheduleShared';
import { useResponsive } from '../../../hooks/useResponsive';

const EVENT_TYPES: EventType[] = ['training', 'match', 'camp', 'medical', 'admin'];

// Above this many options a chip wall becomes unusable, so we show a search box.
const SEARCH_THRESHOLD = 8;

function SectionLabel({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center gap-2 mb-3">
      {icon}
      <Text className="text-[11px] font-black text-slate-400 uppercase tracking-[0.18em]">{children}</Text>
    </View>
  );
}

/** Compact search input reused for the coach and team pickers. */
function InlineSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <View className="relative mb-3">
      <View className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
        <Search size={14} color="var(--c-faint)" />
      </View>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="var(--c-faint)"
        className="w-full h-[34px] rounded-[10px] border border-[#E3EAF5] bg-[#F8FAFC] pl-9 pr-3 text-[12.5px] font-semibold text-[#0E2041]"
      />
    </View>
  );
}

/** Pill used for every selectable option so all filter groups read the same. */
function Chip({
  label,
  active,
  onPress,
  dotColor,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  dotColor?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className="flex-row items-center gap-1.5 rounded-[9px] px-2.5 h-8 border"
      style={active
        ? { backgroundColor: 'var(--c-brand-surface)', borderColor: 'transparent' }
        : { backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' }}
    >
      {dotColor ? (
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: active ? 'var(--c-on-brand)' : dotColor,
          }}
        />
      ) : null}
      <Text className="text-[12px] font-semibold" style={{ color: active ? 'var(--c-on-brand)' : 'var(--c-ink-soft)' }} numberOfLines={1}>
        {label}
      </Text>
      {active ? <Check size={12} color="var(--c-on-brand)" /> : null}
    </TouchableOpacity>
  );
}

export function FilterModal({
  visible,
  onClose,
  filterType,
  setFilterType,
  filterCoachId,
  setFilterCoachId,
  filterTeamId,
  setFilterTeamId,
  showCancelled,
  setShowCancelled,
  coaches,
  teams,
}: {
  visible: boolean;
  onClose: () => void;
  filterType: string | null;
  setFilterType: (v: string | null) => void;
  filterCoachId: number | null;
  setFilterCoachId: (v: number | null) => void;
  filterTeamId: number | null;
  setFilterTeamId: (v: number | null) => void;
  showCancelled: boolean;
  setShowCancelled: (v: boolean) => void;
  coaches: { id: number; name: string }[];
  teams: Team[];
}) {
  const { isMobile } = useResponsive();
  const [coachQuery, setCoachQuery] = useState('');
  const [teamQuery, setTeamQuery] = useState('');

  const activeCount =
    (filterType ? 1 : 0) + (filterCoachId ? 1 : 0) + (filterTeamId ? 1 : 0) + (showCancelled ? 1 : 0);

  // Keep the active option visible even when it doesn't match the query.
  const filteredCoaches = useMemo(() => {
    const q = coachQuery.trim().toLowerCase();
    if (!q) return coaches;
    return coaches.filter((c) => c.id === filterCoachId || c.name.toLowerCase().includes(q));
  }, [coaches, coachQuery, filterCoachId]);

  const filteredTeams = useMemo(() => {
    const q = teamQuery.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter((t) => t.id === filterTeamId || t.name.toLowerCase().includes(q));
  }, [teams, teamQuery, filterTeamId]);

  return (
    <Modal visible={visible} transparent animationType={isMobile ? 'slide' : 'fade'}>
      <Pressable className={`flex-1 bg-black/45 ${isMobile ? 'justify-end' : 'items-center justify-center p-5'}`} onPress={onClose}>
        <View
          className={`bg-white w-full overflow-hidden ${isMobile ? 'rounded-t-[24px]' : 'rounded-[20px]'}`}
          style={{ maxWidth: isMobile ? undefined : 640, maxHeight: isMobile ? '92%' : '88%', boxShadow: '0 24px 60px rgba(11,30,61,0.28)' } as any}
          onStartShouldSetResponder={() => true}
        >
          {/* Header */}
          <View className={`${isMobile ? 'px-5 pt-4 pb-4' : 'px-6 pt-5 pb-4'} border-b border-[#EEF3F9] flex-row items-start justify-between gap-4`}>
            <View className="flex-1">
              <Text className="text-[20px] font-bold text-[#0E2041]">Filtre</Text>
              <Text className="text-slate-400 text-[12px] font-medium mt-0.5">
                {activeCount === 0 ? 'Niciun filtru aplicat' : `${activeCount} ${activeCount === 1 ? 'filtru aplicat' : 'filtre aplicate'}`}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="w-9 h-9 rounded-[10px] bg-[#F4F7FC] border border-[#E3EAF5] items-center justify-center"
              accessibilityLabel="Închide filtrele"
            >
              <X color="var(--c-ink-soft)" size={18} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: isMobile ? 18 : 24, paddingTop: 18, paddingBottom: 24 }}>
            <View className="mb-6">
              <SectionLabel>Categorie eveniment</SectionLabel>
              <View className="flex-row flex-wrap gap-1.5">
                {EVENT_TYPES.map((type) => (
                  <Chip
                    key={type}
                    label={EVENT_TYPE_META[type].label}
                    dotColor={EVENT_TYPE_META[type].solid}
                    active={filterType === type}
                    onPress={() => setFilterType(filterType === type ? null : type)}
                  />
                ))}
              </View>
            </View>

            <View className="mb-6">
              <SectionLabel icon={<UserCog size={13} color="var(--c-faint)" />}>Antrenor</SectionLabel>
              {coaches.length === 0 ? (
                <Text className="text-slate-400 text-[13px] font-semibold">Niciun antrenor disponibil.</Text>
              ) : (
                <>
                  {coaches.length > SEARCH_THRESHOLD && (
                    <InlineSearch value={coachQuery} onChange={setCoachQuery} placeholder="Caută antrenor…" />
                  )}
                  {filteredCoaches.length === 0 ? (
                    <Text className="text-slate-400 text-[13px] font-semibold">Niciun antrenor găsit.</Text>
                  ) : (
                    // Capped + nested-scroll: with 20+ coaches a plain wrap grew
                    // to ~10 rows and buried the Club/Team section below it.
                    <ScrollView
                      style={{ maxHeight: 148 }}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                    >
                      <View className="flex-row flex-wrap gap-1.5">
                        {filteredCoaches.map((coach) => (
                          <Chip
                            key={coach.id}
                            label={coach.name}
                            active={filterCoachId === coach.id}
                            onPress={() => setFilterCoachId(filterCoachId === coach.id ? null : coach.id)}
                          />
                        ))}
                      </View>
                    </ScrollView>
                  )}
                </>
              )}
            </View>

            <View className="mb-6">
              <SectionLabel icon={<Users size={13} color="var(--c-faint)" />}>Club / echipă</SectionLabel>
              {teams.length === 0 ? (
                <Text className="text-slate-400 text-[13px] font-semibold">Nicio echipă disponibilă.</Text>
              ) : (
                <>
                  {teams.length > SEARCH_THRESHOLD && (
                    <InlineSearch value={teamQuery} onChange={setTeamQuery} placeholder="Caută echipă…" />
                  )}
                  {filteredTeams.length === 0 ? (
                    <Text className="text-slate-400 text-[13px] font-semibold">Nicio echipă găsită.</Text>
                  ) : (
                    <ScrollView
                      style={{ maxHeight: 148 }}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                    >
                      <View className="flex-row flex-wrap gap-1.5">
                        {filteredTeams.map((team) => (
                          <Chip
                            key={team.id}
                            label={team.name}
                            active={filterTeamId === team.id}
                            onPress={() => setFilterTeamId(filterTeamId === team.id ? null : team.id)}
                          />
                        ))}
                      </View>
                    </ScrollView>
                  )}
                </>
              )}
            </View>

            <View>
              <SectionLabel icon={<Eye size={13} color="var(--c-faint)" />}>Vizibilitate</SectionLabel>
              <TouchableOpacity
                onPress={() => setShowCancelled(!showCancelled)}
                activeOpacity={0.85}
                className="flex-row items-center justify-between rounded-2xl border border-[#E3EAF5] bg-[#F8FAFC] px-5 py-4"
              >
                <View className="flex-1 pr-4">
                  <Text className="text-[14px] font-black text-[#0E2041]">Arată evenimentele anulate</Text>
                  <Text className="text-[12px] font-semibold text-slate-400 mt-0.5">
                    Include evenimentele care au fost anulate.
                  </Text>
                </View>
                <View
                  className={`w-12 h-7 rounded-full px-[3px] flex-row items-center ${
                    showCancelled ? 'bg-[#1D3E90] justify-end' : 'bg-slate-300 justify-start'
                  }`}
                >
                  <View className="w-[22px] h-[22px] rounded-full bg-white" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.2)' } as any} />
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Footer */}
          <View className={`${isMobile ? 'px-5 py-4' : 'px-6 py-4'} border-t border-[#EEF3F9] bg-[#FBFCFE] flex-row items-center justify-between gap-4`}>
            <TouchableOpacity
              onPress={() => {
                setFilterType(null);
                setFilterCoachId(null);
                setFilterTeamId(null);
                setShowCancelled(false);
                setCoachQuery('');
                setTeamQuery('');
              }}
              disabled={activeCount === 0}
              className={activeCount === 0 ? 'opacity-40' : ''}
            >
              <Text className="text-slate-500 font-black text-[12px] uppercase tracking-widest">Șterge tot</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onClose}
              className="rounded-[10px] px-6 h-11 items-center justify-center"
              style={{ backgroundColor: 'var(--c-brand-surface)', boxShadow: 'var(--e-brand)' } as any}
            >
              <Text className="text-white font-semibold uppercase tracking-wide text-[12px]">Aplică</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}
