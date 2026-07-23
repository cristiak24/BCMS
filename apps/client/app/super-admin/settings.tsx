import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from '@/src/web/reactNative';
import { superAdminApi } from '../../services/superAdminApi';

export default function SettingsScreen() {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    superAdminApi.getSettings().then((response) => setSettings(response.settings)).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-[#EEF3FF]">
        <ActivityIndicator size="large" color="var(--c-brand-fg)" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-[#EEF3FF]" contentContainerStyle={{ padding: 20 }}>
      <View className="bg-white rounded-[28px] border border-[#E8EEFF] p-5">
        <Text className="text-[#102A72] text-[22px] font-black">System Settings</Text>
        <Text className="text-[#7483A6] text-[13px] mt-1">Invite TTL, Resend branding, and platform-level settings.</Text>
        <View className="mt-5 gap-3">
          {Object.entries(settings).map(([key, value]) => (
            <View key={key} className="rounded-2xl bg-[#F7F9FF] border border-[#E8EEFF] p-4">
              <Text className="text-[#102A72] font-black">{key}</Text>
              <Text className="text-[#7483A6] text-[13px] mt-1">{String(value)}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
