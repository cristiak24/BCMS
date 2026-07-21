import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import GlassCard from '../../components/ui/GlassCard';
import InviteForm from '../../components/user-access/InviteForm';
import { getHomeRouteForRole, isSuperadmin } from '../../utils/authSession';
import { useFirebaseAuth } from '../../context/AuthContext';

export default function CreateClubAdminScreen() {
  const router = useRouter();
  const { session, initializing, reloadSession, signOut } = useFirebaseAuth();

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
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!session || !isSuperadmin(session)) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-4">
        <GlassCard className="items-center px-6 py-10 max-w-xl">
          <MaterialIcons name="lock-outline" size={34} color="#475569" />
          <Text className="text-2xl font-black text-slate-900 mt-4 text-center">Superadmin access required</Text>
          <Text className="text-slate-500 text-center mt-2">
            This page is restricted to superadmin accounts only.
          </Text>
          <Pressable
            onPress={() => router.replace(getHomeRouteForRole(session?.role ?? 'player'))}
            className="mt-6 rounded-2xl bg-blue-700 px-5 py-3"
          >
            <Text className="text-white font-bold">Go back</Text>
          </Pressable>
        </GlassCard>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerStyle={{ padding: 20, gap: 20 }}>
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1">
          <Text className="text-4xl font-black text-slate-900 tracking-tight">Create Club Admin</Text>
          <Text className="text-slate-500 mt-2 max-w-2xl">
            Superadmins can create a club, issue an admin invite, and send the signup email without exposing raw invite tokens.
          </Text>
        </View>

        <View className="flex-row gap-3">
          <Pressable
            onPress={reloadSession}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 flex-row items-center gap-2"
          >
            <MaterialIcons name="refresh" size={18} color="#0F172A" />
            <Text className="font-bold text-slate-900">Refresh</Text>
          </Pressable>

          <Pressable
            onPress={signOut}
            className="rounded-2xl bg-slate-900 px-4 py-3 flex-row items-center gap-2"
          >
            <MaterialIcons name="logout" size={18} color="#FFFFFF" />
            <Text className="font-black text-white uppercase tracking-[0.2em] text-[11px]">Logout</Text>
          </Pressable>
        </View>
      </View>

      <InviteForm />

      <View className="flex-row flex-wrap gap-4">
        <GlassCard className="p-6 flex-1 min-w-[280px]">
          <Text className="text-xl font-black text-slate-900">Club creation</Text>
          <Text className="text-slate-500 mt-3 leading-6">
            The backend normalizes the club name, creates the club document if needed, and keeps admin membership in adminIds.
          </Text>
        </GlassCard>

        <GlassCard className="p-6 flex-1 min-w-[280px]">
          <Text className="text-xl font-black text-slate-900">Invite safety</Text>
          <Text className="text-slate-500 mt-3 leading-6">
            Invite tokens are hashed before persistence. The client only sees safe invite metadata and never receives the raw token from Firestore.
          </Text>
        </GlassCard>
      </View>
    </ScrollView>
  );
}
