import { ActivityIndicator, Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';

type LoadingScreenProps = {
  message?: string;
  backgroundColor?: string;
  color?: string;
};

type ErrorStateProps = {
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function LoadingScreen({
  message = 'Loading your workspace...',
  backgroundColor = 'var(--c-surface-2)',
  color = 'var(--c-brand-fg)',
}: LoadingScreenProps) {
  return (
    <View
      className="flex-1 items-center justify-center px-6"
      style={{ backgroundColor }}
      accessibilityRole="progressbar"
      accessibilityLabel={message}
    >
      <View className="rounded-lg border border-slate-100 bg-white px-6 py-5 shadow-sm items-center min-w-[220px]">
        <ActivityIndicator size="large" color={color} />
        <Text className="mt-4 text-center text-slate-600 font-semibold">{message}</Text>
      </View>
    </View>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  actionLabel,
  onAction,
}: ErrorStateProps) {
  return (
    <View className="rounded-lg border border-red-100 bg-white px-6 py-6 items-center">
      <MaterialIcons name="error-outline" size={34} color="var(--c-danger)" />
      <Text className="mt-3 text-center text-[#0E2041] text-xl font-black">{title}</Text>
      <Text className="mt-2 text-center text-slate-500 font-semibold">{message}</Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          className="mt-5 min-h-[48px] rounded-lg bg-[#1D3E90] px-5 items-center justify-center"
          accessibilityRole="button"
        >
          <Text className="text-white font-black">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
