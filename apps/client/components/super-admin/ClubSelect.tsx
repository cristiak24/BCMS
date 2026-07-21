import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import type { SuperAdminClub } from '../../services/superAdminApi';

type Props = {
  clubs: SuperAdminClub[];
  value: number | null;
  onChange: (clubId: number) => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
};

export default function ClubSelect({
  clubs,
  value,
  onChange,
  loading = false,
  disabled = false,
  placeholder = 'Select a club',
}: Props) {
  const [open, setOpen] = useState(false);

  const selectedClub = useMemo(
    () => clubs.find((club) => club.id === value) ?? null,
    [clubs, value],
  );

  const handleSelect = (clubId: number) => {
    onChange(clubId);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        className={`rounded-2xl border px-4 py-4 bg-[#F7F9FF] flex-row items-center justify-between ${disabled ? 'opacity-60' : ''}`}
        style={{ borderColor: '#DDE6FF' }}
      >
        <View className="flex-1 pr-3">
          <Text className="text-[11px] font-black uppercase tracking-[0.18em] text-[#6B7AA6] mb-1">
            Club
          </Text>
          <Text className={`text-[15px] font-semibold ${selectedClub ? 'text-[#102A72]' : 'text-[#9AA7C2]'}`}>
            {selectedClub ? selectedClub.name : placeholder}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color="#173AA8" />
        ) : (
          <MaterialIcons name="keyboard-arrow-down" size={24} color="#6B7AA6" />
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 justify-center px-4">
          <Pressable className="absolute inset-0 bg-black/45" onPress={() => setOpen(false)} />
          <View
            className="w-full max-w-[560px] self-center rounded-[28px] bg-white border border-[#E8EEFF] overflow-hidden z-10"
          >
            <View className="px-5 py-4 border-b border-[#E8EEFF] flex-row items-center justify-between">
              <View>
                <Text className="text-[#102A72] text-[20px] font-black">Choose club</Text>
                <Text className="text-[#7483A6] text-[12px] mt-1">The user will be linked to the selected club.</Text>
              </View>
              <Pressable onPress={() => setOpen(false)} className="w-10 h-10 rounded-full bg-[#F4F7FF] items-center justify-center">
                <MaterialIcons name="close" size={20} color="#6B7AA6" />
              </Pressable>
            </View>

            <ScrollView className="max-h-[360px]" contentContainerStyle={{ padding: 12 }}>
              {clubs.length === 0 ? (
                <View className="px-4 py-8 items-center">
                  <Text className="text-[#7483A6] text-[13px] text-center">
                    No clubs are available yet.
                  </Text>
                </View>
              ) : (
                clubs.map((club) => {
                  const active = club.id === value;

                  return (
                    <Pressable
                      key={club.id}
                      onPress={() => handleSelect(club.id)}
                      className={`rounded-2xl px-4 py-4 mb-2 border ${active ? 'bg-[#E7EEFF] border-[#173AA8]' : 'bg-[#F7F9FF] border-transparent'}`}
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1 pr-3">
                          <Text className="text-[#102A72] font-bold text-[15px]">{club.name}</Text>
                          <Text className="text-[#7483A6] text-[12px] mt-1">
                            {club.usersCount ?? club.userCount} users • {club.adminsCount ?? club.adminCount} admins • {club.pendingInviteCount} pending invites
                          </Text>
                        </View>
                        {active ? <MaterialIcons name="check-circle" size={22} color="#173AA8" /> : null}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
