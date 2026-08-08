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

type EmptyStateProps = {
  /** MaterialIcons glyph name. */
  icon?: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  /**
   * Short, left-aligned single-row variant (~72px instead of ~400px). For
   * screens that stack several empty sections at once — three full-size empty
   * states in a column read as a broken page rather than an empty one.
   */
  compact?: boolean;
};

export function LoadingScreen({
  message = 'Loading your workspace...',
  backgroundColor = 'var(--c-bg)',
  color = 'var(--c-brand-fg)',
}: LoadingScreenProps) {
  return (
    <View
      className="flex-1 items-center justify-center px-6 min-h-screen"
      style={{ backgroundColor }}
      accessibilityRole="progressbar"
      accessibilityLabel={message}
    >
      <View
        className="rounded-2xl border px-6 py-5 items-center min-w-[220px]"
        style={{
          backgroundColor: 'var(--c-surface)',
          borderColor: 'var(--c-border)',
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
        }}
      >
        <ActivityIndicator size="large" color={color} />
        <Text className="mt-4 text-center font-semibold" style={{ color: 'var(--c-muted)' }}>
          {message}
        </Text>
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
    <View
      className="rounded-2xl border px-6 py-6 items-center"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-danger-bg)' }}
      accessibilityRole="alert"
    >
      <MaterialIcons name="error-outline" size={34} color="var(--c-danger)" />
      <Text className="mt-3 text-center text-xl font-black" style={{ color: 'var(--c-ink)' }}>
        {title}
      </Text>
      <Text className="mt-2 text-center font-semibold" style={{ color: 'var(--c-muted)' }}>
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          className="mt-5 min-h-[48px] rounded-2xl px-5 items-center justify-center"
          style={{ backgroundColor: 'var(--c-brand-surface)' }}
          accessibilityRole="button"
        >
          <Text className="font-black" style={{ color: 'var(--c-on-brand)' }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Shared empty state. Screens were each rolling their own "nothing here yet"
 * markup with different spacing, icon sizes and tone; this keeps them identical
 * and gives every empty list a way forward instead of a blank panel.
 */
export function EmptyState({ icon = 'inbox', title, message, actionLabel, onAction, compact = false }: EmptyStateProps) {
  if (compact) {
    return (
      <View
        className="flex-row items-center gap-3 rounded-[14px] border px-4 py-4"
        style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
      >
        <View
          className="h-9 w-9 rounded-[10px] items-center justify-center shrink-0"
          style={{ backgroundColor: 'var(--c-surface-3)' }}
        >
          <MaterialIcons name={icon as never} size={18} color="var(--c-faint)" />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-[14px] font-bold" style={{ color: 'var(--c-ink)' }}>{title}</Text>
          {message ? (
            <Text className="text-[12px] font-medium mt-0.5" style={{ color: 'var(--c-muted)' }}>{message}</Text>
          ) : null}
        </View>
        {actionLabel && onAction ? (
          <Pressable
            onPress={onAction}
            className="h-9 rounded-[9px] px-3 items-center justify-center border shrink-0"
            style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' }}
            accessibilityRole="button"
          >
            <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View className="items-center justify-center px-6 py-12">
      <View
        className="h-16 w-16 rounded-3xl items-center justify-center"
        style={{ backgroundColor: 'var(--c-surface-3)' }}
      >
        <MaterialIcons name={icon as never} size={30} color="var(--c-faint)" />
      </View>
      <Text className="mt-4 text-center text-lg font-black" style={{ color: 'var(--c-ink)' }}>
        {title}
      </Text>
      {message ? (
        <Text
          className="mt-2 text-center text-[13px] font-semibold leading-5 max-w-[380px]"
          style={{ color: 'var(--c-muted)' }}
        >
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          className="mt-5 min-h-[44px] rounded-2xl px-5 items-center justify-center"
          style={{ backgroundColor: 'var(--c-brand-surface)' }}
          accessibilityRole="button"
        >
          <Text className="font-black" style={{ color: 'var(--c-on-brand)' }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
