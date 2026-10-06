import { ScrollView } from '@/src/web/reactNative';
import PageContainer from '../../components/ui/PageContainer';
import PageHero from '../../components/admin/PageHero';
import FamilyRequestsPanel from '../../components/family/FamilyRequestsPanel';
import { ToastHost, useToasts } from '../../components/ui/Toast';

/**
 * A coach's inbox of team-code signups for the teams they coach — parents
 * registering a child, teenage players registering themselves.
 */
export default function CoachRequestsScreen() {
  const { toasts, showToast, dismissToast } = useToasts();
  return (
    <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-32">
      <PageContainer>
        <PageHero eyebrow="Înscrieri" title="Cereri" subtitle="Părinți și jucători care s-au înscris cu codul echipei tale." />
        <FamilyRequestsPanel onNotify={showToast} />
      </PageContainer>
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </ScrollView>
  );
}
