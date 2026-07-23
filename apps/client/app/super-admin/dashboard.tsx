import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { Link } from '@/src/web/expoRouter';
import StatCard from '../../components/super-admin/StatCard';
import { superAdminApi, type SuperAdminDashboardResponse } from '../../services/superAdminApi';

export default function SuperAdminDashboardScreen() {
  const [data, setData] = useState<SuperAdminDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    superAdminApi.getDashboard()
      .then((response) => mounted && setData(response))
      .catch((error) => mounted && Alert.alert('Dashboard', error instanceof Error ? error.message : 'Could not load dashboard.'))
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-[#EEF3FF]">
        <ActivityIndicator size="large" color="var(--c-brand-fg)" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-[#EEF3FF]" contentContainerStyle={{ padding: 20, gap: 18 }}>
      <View className="flex-row flex-wrap gap-4">
        <StatCard label="Total Clubs" value={data?.stats.clubs ?? 0} subtitle="platform-wide" />
        <StatCard label="Total Users" value={data?.stats.users ?? 0} subtitle="all roles" accent="sky" />
        <StatCard label="Pending Invites" value={data?.stats.pendingInvites ?? 0} subtitle="waiting acceptance" accent="indigo" />
        <StatCard label="Inactive Users" value={data?.stats.inactiveUsers ?? 0} subtitle="manually disabled" accent="red" />
      </View>

      <View className="flex-row flex-wrap gap-4">
        <View className="flex-1 min-w-[320px] bg-white rounded-[28px] border border-[#E8EEFF] p-5 shadow-sm">
          <View className="flex-row items-center justify-between mb-4">
            <View>
              <Text className="text-[#102A72] text-[22px] font-black">Recent Clubs</Text>
              <Text className="text-[#7483A6] text-[13px] mt-1">Grouped by role and activity.</Text>
            </View>
            <Link href="/super-admin/clubs" asChild>
              <Pressable className="px-4 py-3 rounded-full bg-[#173AA8]">
                <Text className="text-white font-bold text-[12px]">View all</Text>
              </Pressable>
            </Link>
          </View>

          <View className="gap-3">
            {data?.clubs.map((club) => (
              <View key={club.id} className="rounded-2xl bg-[#F7F9FF] border border-[#E8EEFF] p-4">
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text className="text-[#102A72] font-black text-[16px]">{club.name}</Text>
                    <Text className="text-[#7483A6] text-[12px] mt-1">{club.userCount} users • {club.adminCount} admins</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color="#8AA0D0" />
                </View>
              </View>
            ))}
          </View>
        </View>

        <View className="flex-1 min-w-[320px] bg-white rounded-[28px] border border-[#E8EEFF] p-5 shadow-sm">
          <Text className="text-[#102A72] text-[22px] font-black">Latest Activity</Text>
          <Text className="text-[#7483A6] text-[13px] mt-1 mb-4">Important platform actions.</Text>

          <View className="gap-3">
            {data?.recentAuditLogs.map((log, index) => (
              <View key={`${String(log.action)}-${index}`} className="rounded-2xl bg-[#F7F9FF] border border-[#E8EEFF] p-4">
                <Text className="text-[#102A72] font-bold">{String(log.action)}</Text>
                <Text className="text-[#7483A6] text-[12px] mt-1">{String(log.clubName ?? 'Global')}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

