import PageContainer from '../../components/ui/PageContainer';
import PageHeader from '../../components/ui/PageHeader';
import AuditLogList from '../../components/audit/AuditLogList';
import { superAdminApi } from '../../services/superAdminApi';

export default function AuditLogsScreen() {
  return (
    <PageContainer>
      <PageHeader
        keepTitleOnMobile
        title="Jurnal"
        subtitle="Acțiunile importante din toate cluburile: cluburi, conturi, roluri, invitații, taxe, plăți și documente."
      />
      <AuditLogList load={superAdminApi.listAuditLogs} platform />
    </PageContainer>
  );
}
