import { ScrollView, View } from '@/src/web/reactNative';
import PageContainer from '../../components/ui/PageContainer';
import PageHero from '../../components/admin/PageHero';
import AuditLogList from '../../components/audit/AuditLogList';
import { clubAdminApi } from '../../services/clubAdminApi';

/** Jurnal: who changed what in the club (roles, fees, documents, payments). */
export default function ClubAuditLogScreen() {
  return (
    <View className="flex-1" style={{ backgroundColor: 'var(--c-bg)' }}>
      <ScrollView className="flex-1" contentContainerClassName="pb-32" showsVerticalScrollIndicator={false}>
        <PageContainer>
          <PageHero
            eyebrow="Jurnal"
            title="Jurnalul clubului"
            subtitle="Cine a schimbat roluri, taxe, documente și plăți — și când."
            className="mb-4"
          />
          <AuditLogList load={clubAdminApi.listAuditLogs} />
        </PageContainer>
      </ScrollView>
    </View>
  );
}
