import { useEffect } from 'react';
import { Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import { DEFAULT_SEARCH_PLACEHOLDER, useHeader } from '../../components/HeaderContext';
import CreateClubAccountForm from '../../components/manage-access/CreateClubAccountForm';

export default function CreateAccountScreen() {
    const router = useRouter();
    const { setSearchPlaceholder, setSearchValue, setHeaderActions, setMobileFab } = useHeader();

    useEffect(() => {
        setSearchPlaceholder('Create coach or player invites...');
        setHeaderActions(
            <View className="flex-row gap-3">
                <Pressable
                    onPress={() => router.push('/admin/manage-accounts')}
                    className="bg-white border border-gray-200 px-5 py-2.5 rounded-[14px] flex-row items-center gap-2 shadow-sm"
                >
                    <MaterialIcons name="groups" size={16} color="#0D2040" />
                    <Text className="text-[#0D2040] font-black text-[12px] uppercase tracking-wider">Manage Accounts</Text>
                </Pressable>
            </View>
        );
        setMobileFab(null);

        return () => {
            setSearchPlaceholder(DEFAULT_SEARCH_PLACEHOLDER);
            setSearchValue('');
            setHeaderActions(null);
            setMobileFab(null);
        };
    }, [router, setHeaderActions, setMobileFab, setSearchPlaceholder, setSearchValue]);

    return (
        <ScrollView
            className="flex-1 bg-[#F1F5F9]"
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 40, paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
        >
            <View className="w-full max-w-[980px] self-center gap-6">
                <View className="rounded-[32px] border border-[#E8EEFF] bg-white px-6 py-5 shadow-sm">
                    <Text className="text-[#173AA8] text-[11px] font-black tracking-[0.3em] uppercase">
                        Club User Management
                    </Text>
                    <Text className="text-[#102A72] text-[28px] font-black tracking-tight mt-2">
                        Create account invitation
                    </Text>
                    <Text className="text-[#7483A6] text-[14px] mt-2 max-w-[760px] leading-6">
                        Invite coaches and players directly into your club without leaving the admin area.
                    </Text>
                </View>

                <View className="flex-row flex-wrap gap-3">
                    <Pressable
                        onPress={() => router.push('/admin/manage-access')}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 flex-row items-center"
                    >
                        <MaterialIcons name="verified-user" size={18} color="#334155" />
                        <Text className="text-slate-700 font-bold ml-2">Manage Access</Text>
                    </Pressable>
                    <Pressable
                        onPress={() => router.push('/admin/manage-accounts')}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 flex-row items-center"
                    >
                        <MaterialIcons name="groups" size={18} color="#334155" />
                        <Text className="text-slate-700 font-bold ml-2">Manage Accounts</Text>
                    </Pressable>
                </View>

                <CreateClubAccountForm onCreated={() => router.push('/admin/manage-accounts')} />
            </View>
        </ScrollView>
    );
}
