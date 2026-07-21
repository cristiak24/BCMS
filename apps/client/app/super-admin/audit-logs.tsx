import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from '@/src/web/reactNative';
import { superAdminApi } from '../../services/superAdminApi';

export default function AuditLogsScreen() {
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    superAdminApi.listAuditLogs().then((response) => setLogs(response.logs)).finally(() => setLoading(false));
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
        <Text className="text-[#102A72] text-[22px] font-black">Audit Logs</Text>
        <Text className="text-[#7483A6] text-[13px] mt-1">Track high-value actions like invites, club creation, and access changes.</Text>
      </View>
      <View className="bg-white rounded-[28px] border border-[#E8EEFF] overflow-hidden">
        {logs.map((log, index) => (
          <View key={index} className="p-5 border-b border-[#E8EEFF]">
            <Text className="text-[#102A72] font-black">{String(log.action ?? 'action')}</Text>
            <Text className="text-[#7483A6] text-[12px] mt-1">{String(log.entityType ?? 'entity')} • {String(log.createdAt ?? '')}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
