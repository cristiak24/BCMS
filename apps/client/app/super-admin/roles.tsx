import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from '@/src/web/reactNative';
import { superAdminApi } from '../../services/superAdminApi';

export default function RolesScreen() {
  const [roles, setRoles] = useState<{ code: string; label: string; scope: string; permissions: string[] }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    superAdminApi.listRoles().then((response) => setRoles(response.roles)).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-[#EEF3FF]">
        <ActivityIndicator size="large" color="#173AA8" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-[#EEF3FF]" contentContainerStyle={{ padding: 20, gap: 16 }}>
      <View className="bg-white rounded-[28px] border border-[#E8EEFF] p-5">
        <Text className="text-[#102A72] text-[22px] font-black">Role Management</Text>
        <Text className="text-[#7483A6] text-[13px] mt-1">Define what each role can do across the platform.</Text>
      </View>
      <View className="flex-row flex-wrap gap-4">
        {roles.map((role) => (
          <View key={role.code} className="flex-1 min-w-[250px] bg-white rounded-[28px] border border-[#E8EEFF] p-5">
            <Text className="text-[#102A72] text-[18px] font-black">{role.label}</Text>
            <Text className="text-[#7483A6] text-[12px] mt-1 uppercase tracking-[0.2em]">{role.scope}</Text>
            <View className="mt-4 gap-2">
              {role.permissions.map((permission) => (
                <Text key={permission} className="text-[#56627F] text-[13px]">• {permission}</Text>
              ))}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
