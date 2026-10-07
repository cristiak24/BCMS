import { ScrollView, Text, View } from '@/src/web/reactNative';
import AuditLogList from '../../components/audit/AuditLogList';
import { superAdminApi } from '../../services/superAdminApi';

export default function AuditLogsScreen() {
  return (
    <ScrollView className="flex-1" style={{ backgroundColor: 'var(--c-bg)' }} contentContainerStyle={{ padding: 20, gap: 16 }}>
      <View className="rounded-[20px] border p-5" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}>
        <Text className="text-[22px] font-black" style={{ color: 'var(--c-ink)' }}>Jurnal de audit</Text>
        <Text className="text-[13px] mt-1" style={{ color: 'var(--c-muted)' }}>
          Acțiunile importante din toate cluburile: invitații, cluburi create, roluri, taxe, plăți și documente.
        </Text>
      </View>
      <AuditLogList load={superAdminApi.listAuditLogs} />
    </ScrollView>
  );
}
