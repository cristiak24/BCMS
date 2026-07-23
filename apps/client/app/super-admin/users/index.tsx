import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from '@/src/web/reactNative';
import { superAdminApi, type SuperAdminUser } from '../../../services/superAdminApi';

const ROLE_FILTERS = ['all', 'admin', 'coach', 'staff', 'player'] as const;

export default function UsersDirectoryScreen() {
  const [users, setUsers] = useState<SuperAdminUser[]>([]);
  const [roleFilter, setRoleFilter] = useState<(typeof ROLE_FILTERS)[number]>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const response = await superAdminApi.listUsers();
      setUsers(response.users);
    } catch (error) {
      Alert.alert('Users', error instanceof Error ? error.message : 'Could not load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((user) => {
      const roleOk = roleFilter === 'all' || user.role === roleFilter;
      const searchOk = !q || `${user.name} ${user.email} ${user.clubName ?? ''}`.toLowerCase().includes(q);
      return roleOk && searchOk;
    });
  }, [search, roleFilter, users]);

  const deactivate = async (id: string | number) => {
    try {
      await superAdminApi.deactivateUser(id);
      await load();
    } catch (error) {
      Alert.alert('Deactivate', error instanceof Error ? error.message : 'Could not deactivate user.');
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-[#EEF3FF]">
        <ActivityIndicator size="large" color="var(--c-brand-fg)" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-[#EEF3FF]" contentContainerStyle={{ padding: 20, gap: 16 }}>
      <View className="bg-white rounded-[28px] border border-[#E8EEFF] p-5">
        <Text className="text-[#102A72] text-[22px] font-black">User Directory</Text>
        <Text className="text-[#7483A6] text-[13px] mt-1">Search, filter and manage club users across the platform.</Text>
        <View className="mt-4 gap-3">
          <TextInput value={search} onChangeText={setSearch} placeholder="Search by name, email, club..." className="rounded-2xl bg-[#F7F9FF] px-4 py-4 text-[#102A72]" placeholderTextColor="var(--c-faint)" />
          <View className="flex-row flex-wrap gap-2">
            {ROLE_FILTERS.map((item) => (
              <Pressable key={item} onPress={() => setRoleFilter(item)} className={`px-4 py-3 rounded-full border ${roleFilter === item ? 'bg-[#173AA8] border-[#173AA8]' : 'bg-[#F7F9FF] border-[#E4EAF7]'}`}>
                <Text className={`font-bold text-[12px] capitalize ${roleFilter === item ? 'text-white' : 'text-[#56627F]'}`}>{item}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <View className="bg-white rounded-[28px] border border-[#E8EEFF] overflow-hidden">
        {filtered.map((user) => (
          <View key={`${user.source}-${user.id}`} className="p-5 border-b border-[#E8EEFF] flex-row items-center justify-between gap-4">
            <View className="flex-1">
              <Text className="text-[#102A72] font-black text-[16px]">{user.name}</Text>
              <Text className="text-[#7483A6] text-[12px] mt-1">{user.email}</Text>
              <Text className="text-[#7483A6] text-[12px] mt-1">{user.clubName ?? 'No club'} • {user.role} • {user.status}</Text>
            </View>
            <Pressable onPress={() => deactivate(user.id)} className="px-4 py-3 rounded-full bg-[#FDECEC]">
              <Text className="text-[#B91C1C] font-bold text-[12px]">
                {user.source === 'invite' ? 'Cancel invite' : 'Deactivate'}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
