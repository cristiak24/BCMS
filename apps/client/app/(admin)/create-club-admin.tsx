import { useEffect } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import GlassCard from '../../components/ui/GlassCard';
import PageContainer from '../../components/ui/PageContainer';
import PageHero from '../../components/admin/PageHero';
import Button from '../../components/ui/Button';
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
            Acces doar pentru superadmin
          </Text>
          <Text className="text-center mt-2" style={{ color: 'var(--c-muted)' }}>
            Această pagină este rezervată conturilor de superadmin.
          </Text>
          <View className="mt-6">
            <Button
              label="Înapoi"
              icon="arrow-back"
              onPress={() => router.replace(getHomeRouteForRole(session?.role ?? 'player'))}
            />
          </View>
        </GlassCard>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <PageContainer className="gap-5">
        <PageHero
          eyebrow="Superadmin"
          title="Club nou și administrator"
          subtitle="Creează un club și trimite invitația de administrator pe email."
          className="mb-0"
          actions={(
            <>
              <Button label="Reîncarcă" icon="refresh" size="sm" onPress={reloadSession} />
              <Button label="Deconectare" icon="logout" size="sm" onPress={signOut} />
            </>
          )}
        />

        <View className="w-full max-w-[640px]">
          <InviteForm />
        </View>

        <View className="flex-row flex-wrap gap-4">
          <GlassCard className="p-6 flex-1 min-w-[280px]">
            <Text className="f-display text-[17px] font-extrabold" style={{ color: 'var(--c-ink-strong)' }}>Crearea clubului</Text>
            <Text className="mt-3 leading-6" style={{ color: 'var(--c-muted)' }}>
              Serverul normalizează numele clubului, creează clubul dacă nu există și păstrează administratorii în lista de administratori a clubului.
            </Text>
          </GlassCard>

          <GlassCard className="p-6 flex-1 min-w-[280px]">
            <Text className="f-display text-[17px] font-extrabold" style={{ color: 'var(--c-ink-strong)' }}>Siguranța invitațiilor</Text>
            <Text className="mt-3 leading-6" style={{ color: 'var(--c-muted)' }}>
              Token-urile de invitație sunt criptate înainte de salvare. Aplicația vede doar metadatele sigure și nu primește niciodată token-ul brut.
            </Text>
          </GlassCard>
        </View>
      </PageContainer>
    </ScrollView>
  );
}
