import { useEffect } from 'react';
import { ScrollView, View } from '@/src/web/reactNative';
import { useRouter } from '@/src/web/expoRouter';
import { DEFAULT_SEARCH_PLACEHOLDER, useHeader } from '../../components/HeaderContext';
import AdminHero from '../../components/admin/AdminHero';
import AdminActionButton from '../../components/admin/AdminActionButton';
import CreateClubAccountForm from '../../components/manage-access/CreateClubAccountForm';

export default function CreateAccountScreen() {
    const router = useRouter();
    const { setSearchPlaceholder, setSearchValue, setHeaderActions, setMobileFab } = useHeader();

    useEffect(() => {
        setSearchPlaceholder('Create coach or player invites...');
        setHeaderActions(null);
        setMobileFab(null);

        return () => {
            setSearchPlaceholder(DEFAULT_SEARCH_PLACEHOLDER);
            setSearchValue('');
            setHeaderActions(null);
            setMobileFab(null);
        };
    }, [setHeaderActions, setMobileFab, setSearchPlaceholder, setSearchValue]);

    return (
        <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
        >
            <View className="w-full max-w-[900px] mx-auto px-4 md:px-0 pt-6 gap-5">
                <AdminHero
                    title="Create account invitation"
                    subtitle="Invite coaches and players directly into your club without leaving the admin area."
                />

                <View className="flex-row flex-wrap gap-2.5">
                    <AdminActionButton
                        label="Manage Access"
                        icon="verified-user"
                        onPress={() => router.push('/admin/manage-access')}
                    />
                    <AdminActionButton
                        label="Manage Accounts"
                        icon="groups"
                        onPress={() => router.push('/admin/manage-accounts')}
                    />
                </View>

                <CreateClubAccountForm onCreated={() => router.push('/admin/manage-accounts')} />
            </View>
        </ScrollView>
    );
}
