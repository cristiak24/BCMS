import { View, Text, TextInput, Pressable, ActivityIndicator, Alert } from '@/src/web/reactNative';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import { useCallback, useEffect, useState } from 'react';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { usersApi, User } from '../../../services/usersApi';
import { useResponsive } from '../../../hooks/useResponsive';

const ROLES: User['role'][] = ['admin', 'coach', 'player', 'parent', 'accountant'];

export default function UserDetail() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { isMobile } = useResponsive();
    const [user, setUser] = useState<User | null>(null);
    const [name, setName] = useState('');
    const [role, setRole] = useState<User['role']>('coach');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const fetchUser = useCallback(async () => {
        if (!id) return;

        try {
            const data = await usersApi.getUserById(String(id));
            setUser(data);
            setName(data.name);
            setRole(data.role);
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Could not load user data');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchUser();
    }, [fetchUser]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await usersApi.updateUser(String(id), { name, role });
            Alert.alert('Success', 'User updated successfully');
            router.back();
        } catch {
            Alert.alert('Error', 'Failed to save changes');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <ActivityIndicator size="large" className="mt-10" />;
    if (!user) return <Text className="p-8 text-red-500">User not found</Text>;

    return (
        <View className="max-w-3xl mx-auto w-full pt-6 px-4">
            <View className={`mb-6 ${isMobile ? 'gap-3' : 'flex-row items-center'}`}>
                <Pressable onPress={() => router.back()} className="mr-4 min-h-[44px] px-4 py-2 bg-white border border-slate-200 rounded-2xl shadow-sm hover:bg-slate-50 flex-row items-center">
                    <MaterialIcons name="arrow-back" size={17} color="var(--c-brand-fg)" />
                    <Text className="ml-2 text-slate-700 font-black">Back</Text>
                </Pressable>
                <Text className={`${isMobile ? 'text-2xl' : 'text-3xl'} font-black text-[#0E2041]`}>Edit User</Text>
            </View>

            <View className={`bg-white ${isMobile ? 'p-5' : 'p-8'} rounded-[28px] shadow-sm border border-slate-100`}>
                <View className={`mb-8 pb-6 border-b border-gray-100 ${isMobile ? 'gap-3' : 'flex-row items-center'}`}>
                    <View className="w-16 h-16 rounded-3xl bg-[#EBF1FF] items-center justify-center mr-4">
                        <Text className="text-2xl font-black text-[#1D3E90]">{user.name.charAt(0)}</Text>
                    </View>
                    <View>
                        <Text className="text-xl font-black text-[#0E2041]">{user.email}</Text>
                        <Text className="text-sm font-bold text-slate-400">User ID: #{user.id}</Text>
                    </View>
                </View>

                <View className="space-y-6">
                    <View>
                        <Text className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Full Name</Text>
                        <TextInput
                            className="border border-slate-100 rounded-2xl px-5 py-4 text-base font-bold text-slate-800 bg-slate-50 focus:border-[#1D3E90] outline-none"
                            value={name}
                            onChangeText={setName}
                            placeholder="Enter name"
                            placeholderTextColor="var(--c-faint)"
                        />
                    </View>

                    <View>
                        <Text className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Role Permissions</Text>
                        <View className={`gap-3 ${isMobile ? '' : 'flex-row'}`}>
                            {ROLES.map((r) => (
                                <Pressable
                                    key={r}
                                    onPress={() => setRole(r)}
                                    className={`min-h-[44px] px-4 py-2 rounded-2xl border flex-row items-center ${role === r
                                        ? 'bg-[#1D3E90] border-[#1D3E90]'
                                        : 'bg-white border-slate-200 hover:bg-slate-50'
                                        }`}
                                >
                                    <View className={`w-4 h-4 rounded-full border mr-2 items-center justify-center ${role === r ? 'border-white' : 'border-slate-400'}`}>
                                        {role === r && <View className="w-2 h-2 rounded-full bg-white" />}
                                    </View>
                                    <Text
                                        className={`font-black capitalize ${role === r ? 'text-white' : 'text-slate-700'
                                            }`}
                                    >
                                        {r}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>
                </View>

                <View className={`pt-8 mt-6 border-t border-gray-100 gap-3 ${isMobile ? '' : 'flex-row justify-end'}`}>
                    <Pressable onPress={() => router.back()} className="min-h-[48px] px-6 py-3 rounded-2xl border border-slate-200 hover:bg-slate-50 items-center justify-center">
                        <Text className="text-slate-600 font-black">Cancel</Text>
                    </Pressable>
                    <Pressable
                        onPress={handleSave}
                        disabled={saving}
                        className={`min-h-[48px] px-8 py-3 rounded-2xl flex-row items-center justify-center ${saving ? 'bg-blue-300' : 'bg-[#1D3E90] hover:opacity-90 shadow-md'
                            }`}
                    >
                        {saving ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <>
                                <MaterialIcons name="save" size={20} color="white" style={{ marginRight: 8 }} />
                                <Text className="text-white font-bold">Save Changes</Text>
                            </>
                        )}
                    </Pressable>
                </View>
            </View>
        </View>
    );
}
