import { useEffect } from 'react';
import { ScrollView, View } from '@/src/web/reactNative';
import { useRouter } from '@/src/web/expoRouter';
import { DEFAULT_SEARCH_PLACEHOLDER, useHeader } from '../../components/HeaderContext';
import AdminHero from '../../components/admin/AdminHero';
import AdminActionButton from '../../components/admin/AdminActionButton';
import CreateClubAccountForm from '../../components/manage-access/CreateClubAccountForm';
import PageContainer from '../../components/ui/PageContainer';

export default function CreateAccountScreen() {
    const router = useRouter();
    const { setSearchPlaceholder, setSearchValue, setHeaderActions, setMobileFab } = useHeader();

    useEffect(() => {
        setSearchPlaceholder('Caută…');
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
            style={{ backgroundColor: 'var(--c-bg)' } as any}
            contentContainerStyle={{ paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
        >
            <PageContainer className="gap-5">
                <AdminHero
                    title="Cont nou"
                    subtitle="Invită antrenori și jucători direct în clubul tău."
                />

                <View className="flex-row flex-wrap gap-2.5">
                    <AdminActionButton
                        label="Acces & invitații"
                        icon="verified-user"
                        onPress={() => router.push('/admin/manage-access')}
                    />
                    <AdminActionButton
                        label="Conturi"
                        icon="groups"
                        onPress={() => router.push('/admin/manage-accounts')}
                    />
                </View>

                <View className="w-full max-w-[640px]">
                    <CreateClubAccountForm onCreated={() => router.push('/admin/manage-accounts')} />
                </View>
            </PageContainer>
        </ScrollView>
    );
}
