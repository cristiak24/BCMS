import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { Alert, Platform, Pressable, Share, Text, TextInput, View } from '@/src/web/reactNative';
import GlassCard from '../ui/GlassCard';
import type { InviteLinkItem, InviteRole } from '../../types/manageAccess';
import { buildInviteRegistrationUrl } from '../../utils/manageAccess';
import RoleSelector from './RoleSelector';
import RefreshIntervalSelector from './RefreshIntervalSelector';
import CountdownTimer from './CountdownTimer';

type Props = {
    inviteLink: InviteLinkItem | null;
    loading: boolean;
    regenerating: boolean;
    error?: string | null;
    selectedRole: InviteRole;
    refreshIntervalMinutes: number;
    customMinutes: string;
    onRoleChange: (role: InviteRole) => void;
    onRefreshIntervalChange: (minutes: number) => void;
    onCustomMinutesChange: (value: string) => void;
    onGenerate: () => void;
};

async function copyInviteLink(url: string) {
    const navigatorRef = typeof globalThis.navigator !== 'undefined'
        ? (globalThis.navigator as { clipboard?: { writeText: (value: string) => Promise<void>; }; })
        : undefined;

    if (Platform.OS === 'web' && navigatorRef?.clipboard) {
        await navigatorRef.clipboard.writeText(url);
        Alert.alert('Copied', 'Invite link copied to clipboard.');
        return;
    }

    await Share.share({
        message: url,
        url,
        title: 'Club invite link',
    });
}

export default function InviteLinkGenerator({
    inviteLink,
    loading,
    regenerating,
    error,
    selectedRole,
    refreshIntervalMinutes,
    customMinutes,
    onRoleChange,
    onRefreshIntervalChange,
    onCustomMinutesChange,
    onGenerate,
}: Props) {
    const currentUrl = inviteLink ? buildInviteRegistrationUrl(inviteLink) : '';

    return (
        <GlassCard className="p-6">
            <View className="flex-row items-center justify-between mb-5">
                <View className="flex-1 pr-4">
                    <Text className="text-xl font-black text-slate-900">Club Invite Link</Text>
                    <Text className="text-slate-500 mt-1">
                        Generate a role-based registration link tied only to this club.
                    </Text>
                </View>
                <MaterialIcons name="link" size={28} color="#1D4ED8" />
            </View>

            <Text className="text-sm font-bold uppercase tracking-wide text-slate-600 mb-3">Role</Text>
            <RoleSelector selectedRole={selectedRole} onSelectRole={onRoleChange} />

            <Text className="text-sm font-bold uppercase tracking-wide text-slate-600 mt-6 mb-3">Refresh Interval</Text>
            <RefreshIntervalSelector
                value={refreshIntervalMinutes}
                customMinutes={customMinutes}
                onChange={onRefreshIntervalChange}
                onChangeCustomMinutes={onCustomMinutesChange}
            />

            <View className="flex-row gap-3 mt-2">
                <Pressable
                    onPress={onGenerate}
                    disabled={loading || regenerating}
                    className="flex-1 rounded-2xl bg-[#1D4ED8] py-4 items-center justify-center"
                >
                    <Text className="text-white font-bold">{inviteLink ? 'Regenerate Link' : 'Generate Link'}</Text>
                </Pressable>

                <Pressable
                    onPress={() => currentUrl ? copyInviteLink(currentUrl) : null}
                    disabled={!currentUrl || loading}
                    className={`flex-1 rounded-2xl py-4 items-center justify-center border ${currentUrl ? 'border-slate-300 bg-white' : 'border-slate-200 bg-slate-100'}`}
                >
                    <Text className={`font-bold ${currentUrl ? 'text-slate-700' : 'text-slate-400'}`}>Copy Link</Text>
                </Pressable>
            </View>

            {error ? (
                <View className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 mt-4">
                    <Text className="text-red-600 font-medium">{error}</Text>
                </View>
            ) : null}

            {inviteLink ? (
                <View className="mt-6">
                    <Text className="text-sm font-bold uppercase tracking-wide text-slate-600 mb-3">Current Active Link</Text>
                    <View className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <TextInput
                            editable={false}
                            multiline
                            value={currentUrl}
                            className="text-slate-700"
                        />
                        <View className="flex-row flex-wrap gap-x-6 gap-y-2 mt-4">
                            <View>
                                <Text className="text-xs uppercase tracking-wide text-slate-500">Role</Text>
                                <Text className="font-semibold capitalize text-slate-800">{inviteLink.role}</Text>
                            </View>
                            <View>
                                <Text className="text-xs uppercase tracking-wide text-slate-500">Club</Text>
                                <Text className="font-semibold text-slate-800">{inviteLink.clubName}</Text>
                            </View>
                            <View>
                                <Text className="text-xs uppercase tracking-wide text-slate-500">Refresh</Text>
                                <Text className="font-semibold text-slate-800">{inviteLink.refreshIntervalMinutes} min</Text>
                            </View>
                            <View>
                                <Text className="text-xs uppercase tracking-wide text-slate-500">Expires In</Text>
                                <CountdownTimer expiresAt={inviteLink.expiresAt} />
                            </View>
                        </View>
                    </View>
                </View>
            ) : null}
        </GlassCard>
    );
}
