import { ActivityIndicator, Pressable, Text, View } from '@/src/web/reactNative';

type Props = {
    disabled?: boolean;
    approving?: boolean;
    denying?: boolean;
    onApprove: () => void;
    onDeny: () => void;
};

export default function ApproveDenyButtons({ disabled, approving, denying, onApprove, onDeny }: Props) {
    return (
        <View className="flex-row gap-3">
            <Pressable
                onPress={onDeny}
                disabled={disabled || approving || denying}
                className={`flex-1 rounded-2xl border border-red-200 px-4 py-3 items-center justify-center ${disabled ? 'bg-red-50/50' : 'bg-red-50'}`}
            >
                {denying ? <ActivityIndicator color="var(--c-danger)" /> : <Text className="font-bold text-red-600">Deny</Text>}
            </Pressable>
            <Pressable
                onPress={onApprove}
                disabled={disabled || approving || denying}
                className={`flex-1 rounded-2xl px-4 py-3 items-center justify-center ${disabled ? 'bg-[#1D4ED8]/60' : 'bg-[#1D4ED8]'}`}
            >
                {approving ? <ActivityIndicator color="#FFFFFF" /> : <Text className="font-bold text-white">Approve</Text>}
            </Pressable>
        </View>
    );
}
