import { ActivityIndicator, Modal, Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';

type IconName = string;

type ConfirmDialogProps = {
    visible: boolean;
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    /** Styles the confirm button red and uses a warning icon. */
    destructive?: boolean;
    /** Shows a spinner on the confirm button and disables both actions. */
    loading?: boolean;
    icon?: IconName;
    onConfirm: () => void;
    onCancel: () => void;
};

/**
 * Accessible, responsive confirmation modal used before any impactful action
 * (deactivate account, cancel invite, change role, deny request). Replaces the
 * previous fire-and-forget behaviour so admins can't mutate accounts by
 * mis-tapping. Backdrop tap and Cancel both dismiss; Confirm runs the action.
 */
export default function ConfirmDialog({
    visible,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false,
    loading = false,
    icon,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    if (!visible) {
        return null;
    }

    const resolvedIcon: IconName = icon ?? (destructive ? 'warning-amber' : 'help-outline');
    const accent = destructive ? 'var(--c-danger)' : 'var(--c-brand-fg)';
    const accentSoft = destructive ? 'bg-rose-100' : 'bg-blue-100';

    return (
        <Modal visible>
            {/* Backdrop */}
            <Pressable
                accessibilityLabel="Dismiss dialog"
                onPress={loading ? undefined : onCancel}
                style={{
                    flex: 1,
                    backgroundColor: 'rgba(15, 23, 42, 0.55)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 20,
                }}
            >
                {/* Card — stopPropagation so taps inside don't dismiss */}
                <Pressable
                    onPress={() => {}}
                    className="w-full max-w-[440px] bg-white rounded-3xl p-6 shadow-2xl"
                    accessibilityRole="alertdialog"
                >
                    <View className="flex-row items-start gap-4">
                        <View className={`h-12 w-12 rounded-2xl items-center justify-center ${accentSoft}`}>
                            <MaterialIcons name={resolvedIcon as never} size={26} color={accent} />
                        </View>
                        <View className="flex-1">
                            <Text className="text-slate-900 text-lg font-black">{title}</Text>
                            {message ? (
                                <Text className="text-slate-500 mt-2 leading-5">{message}</Text>
                            ) : null}
                        </View>
                    </View>

                    <View className="mt-6 flex-row justify-end gap-3">
                        <Pressable
                            onPress={onCancel}
                            disabled={loading}
                            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 min-h-[44px] items-center justify-center"
                        >
                            <Text className="font-bold text-slate-700">{cancelLabel}</Text>
                        </Pressable>
                        <Pressable
                            onPress={onConfirm}
                            disabled={loading}
                            className={`rounded-2xl px-5 py-3 min-h-[44px] min-w-[120px] items-center justify-center ${destructive ? 'bg-[#DC2626]' : 'bg-[#123A97]'} ${loading ? 'opacity-70' : ''}`}
                        >
                            {loading ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                                <Text className="font-bold text-white">{confirmLabel}</Text>
                            )}
                        </Pressable>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}
