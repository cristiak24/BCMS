import React from 'react';
import { View, Text, Modal, Pressable, TouchableOpacity, ScrollView } from '@/src/web/reactNative';
import { X, Check, Users, UserCog, Eye } from 'lucide-react';
import { Team } from '../../../services/teamsApi';
import { EVENT_TYPE_META, EventType } from '../scheduleShared';

const EVENT_TYPES: EventType[] = ['training', 'match', 'camp', 'admin'];

function SectionLabel({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center gap-2 mb-3">
      {icon}
      <Text className="text-[11px] font-black text-slate-400 uppercase tracking-[0.18em]">{children}</Text>
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
      className={`flex-row items-center gap-2 rounded-full px-4 py-2.5 border ${
        active ? 'bg-[#1D3E90] border-[#1D3E90]' : 'bg-[#F4F7FC] border-[#E3EAF5] hover:bg-[#EAF1FB]'
      }`}
    >
      {dotColor ? (
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: active ? '#FFFFFF' : dotColor,
          }}
        />
      ) : null}
      <Text className={`text-[12.5px] font-bold ${active ? 'text-white' : 'text-[#334155]'}`} numberOfLines={1}>
        {label}
      </Text>
      {active ? <Check size={13} color="#FFFFFF" /> : null}
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
  const activeCount =
    (filterType ? 1 : 0) + (filterCoachId ? 1 : 0) + (filterTeamId ? 1 : 0) + (showCancelled ? 1 : 0);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable className="flex-1 bg-black/45 items-center justify-center p-5" onPress={onClose}>
        <View
          className="bg-white rounded-[28px] w-full overflow-hidden"
          style={{ maxWidth: 640, maxHeight: '88%', boxShadow: '0 24px 60px rgba(11,30,61,0.28)' } as any}
          onStartShouldSetResponder={() => true}
        >
          {/* Header */}
          <View className="px-7 pt-6 pb-5 border-b border-[#EEF3F9] flex-row items-start justify-between gap-4">
            <View className="flex-1">
              <Text className="text-[26px] font-black text-[#0E2041]">Filters</Text>
              <Text className="text-slate-400 text-[12px] font-bold mt-1">
                {activeCount === 0 ? 'No filters applied' : `${activeCount} filter${activeCount === 1 ? '' : 's'} applied`}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="w-10 h-10 rounded-full bg-[#F4F7FC] border border-[#E3EAF5] items-center justify-center"
              accessibilityLabel="Close filters"
            >
              <X color="#334155" size={18} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 22, paddingBottom: 24 }}>
            <View className="mb-7">
              <SectionLabel>Event category</SectionLabel>
              <View className="flex-row flex-wrap gap-2">
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

            <View className="mb-7">
              <SectionLabel icon={<UserCog size={13} color="#94A3B8" />}>Assignee / coach</SectionLabel>
              {coaches.length === 0 ? (
                <Text className="text-slate-400 text-[13px] font-semibold">No coaches available.</Text>
              ) : (
                // Wrap instead of a horizontal scroller: names were getting
                // clipped mid-word and the scrollbar looked broken.
                <View className="flex-row flex-wrap gap-2">
                  {coaches.map((coach) => (
                    <Chip
                      key={coach.id}
                      label={coach.name}
                      active={filterCoachId === coach.id}
                      onPress={() => setFilterCoachId(filterCoachId === coach.id ? null : coach.id)}
                    />
                  ))}
                </View>
              )}
            </View>

            <View className="mb-7">
              <SectionLabel icon={<Users size={13} color="#94A3B8" />}>Club / team</SectionLabel>
              {teams.length === 0 ? (
                <Text className="text-slate-400 text-[13px] font-semibold">No teams available.</Text>
              ) : (
                <View className="flex-row flex-wrap gap-2">
                  {teams.map((team) => (
                    <Chip
                      key={team.id}
                      label={team.name}
                      active={filterTeamId === team.id}
                      onPress={() => setFilterTeamId(filterTeamId === team.id ? null : team.id)}
                    />
                  ))}
                </View>
              )}
            </View>

            <View>
              <SectionLabel icon={<Eye size={13} color="#94A3B8" />}>Visibility</SectionLabel>
              <TouchableOpacity
                onPress={() => setShowCancelled(!showCancelled)}
                activeOpacity={0.85}
                className="flex-row items-center justify-between rounded-2xl border border-[#E3EAF5] bg-[#F8FAFD] px-5 py-4"
              >
                <View className="flex-1 pr-4">
                  <Text className="text-[14px] font-black text-[#0E2041]">Show cancelled events</Text>
                  <Text className="text-[12px] font-semibold text-slate-400 mt-0.5">
                    Include events that were called off.
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
          <View className="px-7 py-5 border-t border-[#EEF3F9] bg-[#FBFCFE] flex-row items-center justify-between gap-4">
            <TouchableOpacity
              onPress={() => {
                setFilterType(null);
                setFilterCoachId(null);
                setFilterTeamId(null);
                setShowCancelled(false);
              }}
              disabled={activeCount === 0}
              className={activeCount === 0 ? 'opacity-40' : ''}
            >
              <Text className="text-slate-500 font-black text-[12px] uppercase tracking-widest">Clear all</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onClose}
              className="bg-[#1D3E90] rounded-full px-9 h-12 items-center justify-center"
              style={{ boxShadow: '0 10px 22px rgba(29,62,144,0.28)' } as any}
            >
              <Text className="text-white font-black uppercase tracking-widest text-[12px]">Apply filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}
