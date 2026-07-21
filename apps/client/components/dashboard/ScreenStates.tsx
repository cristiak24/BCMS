import { ActivityIndicator, Text, View, type ViewStyle } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { dash } from './dashboardTheme';

type EmptyStateProps = {
  title: string;
  message?: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
};

type LoadingStateProps = {
  message?: string;
  compact?: boolean;
};

type SkeletonBlockProps = {
  width?: number | string;
  height?: number;
  className?: string;
  style?: ViewStyle;
};

export function SkeletonBlock({ width = '100%', height = 16, className, style }: SkeletonBlockProps) {
  return (
    <View
      className={`dash-skeleton rounded-lg ${className ?? ''}`}
      style={[{ width: width as any, height }, style]}
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <View
      className="rounded-[20px] p-5 border w-full overflow-hidden"
      style={{ backgroundColor: dash.surface, borderColor: dash.hairline, ...dash.shadow.card }}
    >
      <View className="flex-row items-center gap-3 mb-4">
        <SkeletonBlock width={44} height={44} className="rounded-[14px]" />
        <View className="flex-1 gap-2">
          <SkeletonBlock width="40%" height={12} />
          <SkeletonBlock width="65%" height={20} />
        </View>
      </View>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock key={i} width={i === lines - 1 ? '55%' : '100%'} height={14} className="mb-2" />
      ))}
    </View>
  );
}

export function EmptyState({ title, message, icon = 'event-busy' }: EmptyStateProps) {
  return (
    <View
      className="rounded-[20px] px-6 py-10 items-center justify-center w-full dash-fade-in border border-dashed overflow-hidden relative"
      style={{
        backgroundColor: dash.surfaceMuted,
        borderColor: dash.hairlineStrong,
        ...dash.shadow.sm,
      }}
    >
      <View
        pointerEvents="none"
        className="absolute inset-0 opacity-70"
        style={{ backgroundImage: dash.gradients.hero } as any}
      />
      <View
        className="relative w-14 h-14 rounded-[18px] items-center justify-center mb-4"
        style={{ backgroundColor: 'rgba(99,91,255,0.09)', ...dash.shadow.sm }}
      >
        <MaterialIcons name={icon} size={26} color={dash.accent} />
      </View>
      <Text className="relative text-base font-bold text-center tracking-tight" style={{ color: dash.ink }}>
        {title}
      </Text>
      {message ? (
        <Text className="relative text-sm font-normal text-center mt-2 leading-5 max-w-[320px]" style={{ color: dash.muted }}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

export function ErrorState({ title, message, onRetry }: { title: string; message?: string; onRetry?: () => void }) {
  return (
    <View
      className="rounded-[20px] px-6 py-8 items-center justify-center w-full dash-fade-in border"
      style={{
        backgroundColor: 'rgba(239,68,68,0.04)',
        borderColor: 'rgba(239,68,68,0.14)',
      }}
    >
      <View className="w-12 h-12 rounded-[16px] items-center justify-center mb-3" style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}>
        <MaterialIcons name="error-outline" size={24} color={dash.danger} />
      </View>
      <Text className="text-base font-bold text-center tracking-tight" style={{ color: dash.ink }}>
        {title}
      </Text>
      {message ? (
        <Text className="text-sm text-center mt-1.5 leading-5" style={{ color: dash.muted }}>
          {message}
        </Text>
      ) : null}
      {onRetry ? (
        <View
          className="mt-4 flex-row items-center gap-1.5 px-3.5 py-2 rounded-[10px]"
          style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}
        >
          <MaterialIcons name="refresh" size={15} color={dash.dangerDeep} />
          <Text className="text-[12px] font-semibold" style={{ color: dash.dangerDeep }}>
            Reîncearcă
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function LoadingState({ message = 'Loading...', compact = false }: LoadingStateProps) {
  return (
    <View className={`items-center justify-center dash-fade-in ${compact ? 'py-6' : 'py-12'}`}>
      <View
        className="w-10 h-10 rounded-full items-center justify-center mb-3"
        style={{ backgroundColor: 'rgba(99,91,255,0.08)' }}
      >
        <ActivityIndicator size="small" color={dash.accent} />
      </View>
      <Text className="text-sm font-medium" style={{ color: dash.muted }}>
        {message}
      </Text>
    </View>
  );
}
