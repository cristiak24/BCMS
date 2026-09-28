import { useEffect } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import GlassCard from '../../components/ui/GlassCard';
import AdminHero from '../../components/admin/AdminHero';
import AdminActionButton from '../../components/admin/AdminActionButton';
import InviteForm from '../../components/user-access/InviteForm';
import { getHomeRouteForRole, isSuperadmin } from '../../utils/authSession';
import { useSession } from '../../context/AuthContext';

export default function CreateClubAdminScreen() {
  const router = useRouter();
  const { session, initializing, reloadSession, signOut } = useSession();

  useEffect(() => {
    if (initializing) {
      return;
    }

    if (!session) {
      router.replace('/login');
      return;
    }

    if (!isSuperadmin(session)) {
      router.replace(getHomeRouteForRole(session.role));
    }
  }, [initializing, router, session]);

  if (initializing) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: 'var(--c-bg)' }}>
        <ActivityIndicator size="large" color="var(--c-blue)" />
      </View>
    );
  }

  if (!session || !isSuperadmin(session)) {
    return (
      <View className="flex-1 items-center justify-center px-4" style={{ backgroundColor: 'var(--c-bg)' }}>
        <GlassCard className="items-center px-6 py-10 max-w-xl">
          <MaterialIcons name="lock-outline" size={34} color="var(--c-muted)" />
          <Text className="text-2xl font-black mt-4 text-center" style={{ color: 'var(--c-ink-strong)' }}>
            Superadmin access required
          </Text>
          <Text className="text-center mt-2" style={{ color: 'var(--c-muted)' }}>
            This page is restricted to superadmin accounts only.
          </Text>
          <View className="mt-6">
            <AdminActionButton
              label="Go back"
              icon="arrow-back"
              variant="primary"
              onPress={() => router.replace(getHomeRouteForRole(session?.role ?? 'player'))}
            />
          </View>
        </GlassCard>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <View className="w-full max-w-[1000px] mx-auto px-4 md:px-0 pt-6 gap-5">
        <AdminHero
          title="Create Club Admin"
          subtitle="Create a club, issue an admin invite, and send the signup email without exposing raw invite tokens."
        >
          <View className="flex-row flex-wrap gap-2.5">
            <AdminActionButton label="Refresh" icon="refresh" onPress={reloadSession} />
            <AdminActionButton label="Logout" icon="logout" onPress={signOut} />
          </View>
        </AdminHero>

        <InviteForm />

        <View className="flex-row flex-wrap gap-4">
          <GlassCard className="p-6 flex-1 min-w-[280px]">
            <Text className="text-xl font-black" style={{ color: 'var(--c-ink-strong)' }}>Club creation</Text>
            <Text className="mt-3 leading-6" style={{ color: 'var(--c-muted)' }}>
              The backend normalizes the club name, creates the club document if needed, and keeps admin membership in adminIds.
            </Text>
          </GlassCard>

          <GlassCard className="p-6 flex-1 min-w-[280px]">
            <Text className="text-xl font-black" style={{ color: 'var(--c-ink-strong)' }}>Invite safety</Text>
            <Text className="mt-3 leading-6" style={{ color: 'var(--c-muted)' }}>
              Invite tokens are hashed before persistence. The client only sees safe invite metadata and never receives the raw token from Firestore.
            </Text>
          </GlassCard>
        </View>
      </View>
    </ScrollView>
  );
}
