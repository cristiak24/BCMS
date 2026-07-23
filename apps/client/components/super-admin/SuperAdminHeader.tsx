import { useMemo, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { usePathname, useRouter } from '@/src/web/expoRouter';
import { useFirebaseAuth } from '../../context/AuthContext';

type Props = {
  initials: string;
  displayName: string;
  title?: string;
  onMenuPress?: () => void;
};

function segmentLabel(pathname: string) {
  const parts = pathname.split('/').filter(Boolean).filter((part) => part !== 'super-admin');
  if (parts.length === 0) return 'Dashboard';
  return parts
    .map((part) =>
      part
        .split('-')
        .map((piece) => piece.charAt(0).toUpperCase() + piece.slice(1))
        .join(' '),
    )
    .join(' / ');
}

export default function SuperAdminHeader({ initials, displayName, title = 'Aura Admin', onMenuPress }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useFirebaseAuth();
  const [search, setSearch] = useState('');
  const [accountMenuVisible, setAccountMenuVisible] = useState(false);
  const breadcrumb = useMemo(() => segmentLabel(pathname), [pathname]);

  const handleGoProfile = () => {
    setAccountMenuVisible(false);
    router.push('/profile');
  };

  const handleLogout = async () => {
    setAccountMenuVisible(false);
    await signOut();
    router.replace('/login');
  };

  return (
    <View className="bg-white border-b border-[#E7ECFF] px-5 md:px-8 py-4 md:py-5">
        <View className="relative flex-row items-center justify-between gap-4">
        <View className="flex-row items-center gap-3 flex-1 min-w-0">
          {onMenuPress ? (
            <Pressable
              onPress={onMenuPress}
              className="w-11 h-11 rounded-2xl bg-[#F4F7FF] border border-[#E7ECFF] items-center justify-center md:hidden"
            >
              <MaterialIcons name="menu" size={24} color="var(--c-brand-fg)" />
            </Pressable>
          ) : null}

          <View className="flex-1 min-w-0">
            <Text className="text-[#173AA8] text-[11px] font-black tracking-[0.3em] uppercase">
              Control Center
            </Text>
            <View className="flex-row flex-wrap items-center gap-2 mt-1">
              <Text className="text-[#102A72] text-[22px] md:text-[28px] font-black tracking-tight">
                {title}
              </Text>
              <Text className="text-[#8AA0D0] text-[13px] font-semibold">
                / {breadcrumb}
              </Text>
            </View>
          </View>
        </View>

        <View className="hidden md:flex flex-row items-center gap-3 flex-1 max-w-[520px] mx-6">
          <View className="flex-1 flex-row items-center gap-3 rounded-full border border-[#DDE6FF] bg-[#F7F9FF] px-4 py-3">
            <MaterialIcons name="search" size={20} color="var(--c-muted)" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search clubs, users, invites"
              placeholderTextColor="var(--c-faint)"
              className="flex-1 text-[#102A72] text-[14px]"
            />
          </View>
        </View>

        <View className="flex-row items-center gap-2 md:gap-3">
          <Pressable className="w-11 h-11 rounded-full bg-[#F4F7FF] border border-[#E7ECFF] items-center justify-center">
            <MaterialIcons name="notifications-none" size={22} color="var(--c-brand-fg)" />
          </Pressable>
          <Pressable
            onPress={() => setAccountMenuVisible((value) => !value)}
            className="flex-row items-center gap-3 rounded-full pl-1 pr-2 py-1 active:opacity-80"
          >
            <View className="hidden md:flex items-end mr-1">
              <Text className="text-[#102A72] text-[14px] font-black" numberOfLines={1}>
                {displayName}
              </Text>
              <Text className="text-[#7483A6] text-[12px]">Super admin</Text>
            </View>
            <View className="w-11 h-11 rounded-full bg-[#173AA8] items-center justify-center">
              <Text className="text-white font-black">{initials}</Text>
            </View>
          </Pressable>

          {accountMenuVisible ? (
            <Modal transparent animationType="fade" visible onRequestClose={() => setAccountMenuVisible(false)}>
              <View className="flex-1">
                <Pressable
                  className="absolute inset-0 bg-black/20"
                  onPress={() => setAccountMenuVisible(false)}
                />
                <View className="flex-1 items-end justify-start pt-[88px] pr-4">
                  <View className="w-[220px] rounded-[24px] border border-[#E7ECFF] bg-white shadow-lg shadow-slate-200/70 overflow-hidden">
                    <View className="px-4 py-4 border-b border-[#EEF2FF]">
                      <Text className="text-[#102A72] font-black" numberOfLines={1}>
                        {displayName}
                      </Text>
                      <Text className="text-[#7483A6] text-[12px] mt-1">Super admin account</Text>
                    </View>
                    <Pressable onPress={handleGoProfile} className="flex-row items-center gap-3 px-4 py-4">
                      <MaterialIcons name="person" size={20} color="var(--c-brand-fg)" />
                      <Text className="text-[#102A72] font-semibold">Open profile</Text>
                    </Pressable>
                    <Pressable onPress={handleLogout} className="flex-row items-center gap-3 px-4 py-4 border-t border-[#F2F5FF]">
                      <MaterialIcons name="logout" size={20} color="var(--c-danger)" />
                      <Text className="text-[#B91C1C] font-semibold">Logout</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Modal>
          ) : null}
        </View>
      </View>
    </View>
  );
}
