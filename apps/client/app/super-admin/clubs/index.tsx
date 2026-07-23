import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useFocusEffect } from '@/src/web/reactNavigationNative';
import CreateClubModal from '../../../components/super-admin/CreateClubModal';
import {
  getCachedSuperAdminClubs,
  subscribeToClubs,
  superAdminApi,
  type SuperAdminClub,
} from '../../../services/superAdminApi';

export default function ClubsDirectoryScreen() {
  const [clubs, setClubs] = useState<SuperAdminClub[]>(getCachedSuperAdminClubs() ?? []);
  const [loading, setLoading] = useState(!getCachedSuperAdminClubs());
  const [createClubOpen, setCreateClubOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await superAdminApi.refreshClubs();
      setClubs(response.clubs);
    } catch (error) {
      Alert.alert('Clubs', error instanceof Error ? error.message : 'Could not load clubs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToClubs((nextClubs) => {
      setClubs(nextClubs);
      setLoading(false);
    });

    if (!getCachedSuperAdminClubs()) {
      void load();
    }

    return unsubscribe;
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading && clubs.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-[#EEF3FF]">
        <ActivityIndicator size="large" color="var(--c-brand-fg)" />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        className="flex-1 bg-[#EEF3FF]"
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 20, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="rounded-[32px] border border-[#E8EEFF] bg-white px-6 py-5 shadow-sm">
          <View className="flex-row items-start justify-between gap-4">
            <View className="flex-1">
              <Text className="text-[#173AA8] text-[11px] font-black tracking-[0.3em] uppercase">
                Club Management
              </Text>
              <Text className="text-[#102A72] text-[28px] font-black tracking-tight mt-2">
                Club Directory
              </Text>
              <Text className="text-[#7483A6] text-[14px] mt-2 max-w-[760px] leading-6">
                Create or inspect clubs, admins, and pending invites. Club updates are pushed instantly into the directory and the create-user dropdown.
              </Text>
            </View>

            <Pressable
              onPress={() => setCreateClubOpen(true)}
              className="rounded-full bg-[#173AA8] px-4 py-3 flex-row items-center gap-2"
            >
              <MaterialIcons name="add" size={18} color="#fff" />
              <Text className="text-white font-black text-[12px] tracking-[0.12em] uppercase">
                Create Club
              </Text>
            </Pressable>
          </View>
        </View>

        {clubs.length === 0 ? (
          <View className="rounded-[28px] border border-dashed border-[#DDE6FF] bg-white px-6 py-8 items-center">
            <MaterialIcons name="apartment" size={32} color="var(--c-brand-fg)" />
            <Text className="text-[#102A72] text-[18px] font-black mt-4">No clubs yet</Text>
            <Text className="text-[#7483A6] text-[13px] mt-2 text-center max-w-[520px] leading-6">
              Create the first club so super-admin invitations can be linked to it and the Create User dropdown can populate immediately.
            </Text>
            <Pressable
              onPress={() => setCreateClubOpen(true)}
              className="mt-5 rounded-full bg-[#173AA8] px-4 py-3"
            >
              <Text className="text-white font-black text-[12px] tracking-[0.12em] uppercase">
                Create Club
              </Text>
            </Pressable>
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-4">
            {clubs.map((club) => (
              <View key={club.id} className="flex-1 min-w-[250px] bg-white rounded-[28px] border border-[#E8EEFF] p-5">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-[#102A72] text-[18px] font-black">{club.name}</Text>
                    <Text className="text-[#7483A6] text-[12px] mt-1">
                      {club.usersCount ?? club.userCount} users • {club.adminsCount ?? club.adminCount} admins • {club.pendingInviteCount} pending invites
                    </Text>
                  </View>
                  <View className="w-11 h-11 rounded-2xl bg-[#E7EEFF] items-center justify-center">
                    <MaterialIcons name="verified" size={20} color="var(--c-brand-fg)" />
                  </View>
                </View>

                <View className="mt-4 gap-2">
                  <Text className="text-[#7483A6] text-[12px]">Status: active</Text>
                  <Text className="text-[#7483A6] text-[12px]">Created by: {club.createdBy ?? 'System'}</Text>
                  <Text className="text-[#7483A6] text-[12px]">Created at: {club.createdAt}</Text>
                </View>

                <View className="mt-4 gap-2">
                  <Text className="text-[#7483A6] text-[12px]">Admins: {club.adminCount}</Text>
                  <Text className="text-[#7483A6] text-[12px]">Coaches: {club.coachCount}</Text>
                  <Text className="text-[#7483A6] text-[12px]">Staff: {club.staffCount}</Text>
                  <Text className="text-[#7483A6] text-[12px]">Players: {club.playerCount}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <CreateClubModal visible={createClubOpen} onClose={() => setCreateClubOpen(false)} />
    </>
  );
}
