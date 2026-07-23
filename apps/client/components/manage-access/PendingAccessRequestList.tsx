import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { FlatList, Text, View } from '@/src/web/reactNative';
import GlassCard from '../ui/GlassCard';
import { SkeletonList } from '../ui/Skeleton';
import type { AccessRequestItem } from '../../types/manageAccess';
import ApproveDenyButtons from './ApproveDenyButtons';

const STATUS_STYLES = {
    pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-emerald-100 text-emerald-700',
    denied: 'bg-rose-100 text-rose-700',
} as const;

type Props = {
    items: AccessRequestItem[];
    loading: boolean;
    error?: string | null;
    actionState?: { id: number; type: 'approve' | 'deny' | null } | null;
    onApprove: (id: number) => void;
    onDeny: (id: number) => void;
    onRetry: () => void;
};

export default function PendingAccessRequestList({
    items,
    loading,
    error,
    actionState,
    onApprove,
    onDeny,
    onRetry,
}: Props) {
    if (loading) {
        return <SkeletonList count={3} />;
    }

    if (error) {
        return (
            <GlassCard className="items-center py-10">
                <MaterialIcons name="error-outline" size={36} color="var(--c-danger)" />
                <Text className="text-slate-900 font-bold text-lg mt-3">Could not load requests</Text>
                <Text className="text-slate-500 text-center mt-2">{error}</Text>
                <Text onPress={onRetry} className="text-[#1D4ED8] font-bold mt-4">Try again</Text>
            </GlassCard>
        );
    }

    if (items.length === 0) {
        return (
            <GlassCard className="items-center py-12">
                <MaterialIcons name="mark-email-read" size={42} color="var(--c-muted)" />
                <Text className="text-slate-900 font-bold text-lg mt-3">No access requests yet</Text>
                <Text className="text-slate-500 text-center mt-2">
                    New club registrations that need approval will show up here.
                </Text>
            </GlassCard>
        );
    }

    return (
        <FlatList
            data={items}
            keyExtractor={(item) => String(item.id)}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View className="h-4" />}
            renderItem={({ item }) => {
                const isApproving = actionState?.id === item.id && actionState.type === 'approve';
                const isDenying = actionState?.id === item.id && actionState.type === 'deny';
                const badgeClass = STATUS_STYLES[item.status];

                return (
                    <GlassCard className="p-5">
                        <View className="flex-row items-start justify-between mb-4">
                            <View className="flex-1 pr-4">
                                <Text className="text-lg font-black text-slate-900">{item.userName}</Text>
                                <Text className="text-slate-500 mt-1">{item.userEmail}</Text>
                                <Text className="text-slate-500 mt-2 capitalize">Requested role: {item.requestedRole}</Text>
                            </View>
                            <View className={`rounded-full px-3 py-1 ${badgeClass.split(' ')[0]}`}>
                                <Text className={`text-xs font-bold uppercase ${badgeClass.split(' ')[1]}`}>{item.status}</Text>
                            </View>
                        </View>

                        {item.status === 'pending' ? (
                            <ApproveDenyButtons
                                onApprove={() => onApprove(item.id)}
                                onDeny={() => onDeny(item.id)}
                                approving={isApproving}
                                denying={isDenying}
                            />
                        ) : (
                            <View className="rounded-2xl bg-slate-50 px-4 py-3">
                                <Text className="text-slate-600">
                                    {item.status === 'approved' ? 'This user now has access to the club.' : 'This request was denied. The account was not disabled.'}
                                </Text>
                            </View>
                        )}
                    </GlassCard>
                );
            }}
        />
    );
}
