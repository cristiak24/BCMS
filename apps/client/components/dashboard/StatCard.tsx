import { Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { dash, statToneMap, type StatTone } from './dashboardTheme';
import { SkeletonBlock } from './ScreenStates';

export type StatTrend = {
  direction: 'up' | 'down' | 'flat';
  label: string;
};

type StatCardProps = {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
  detail?: string;
  tone?: StatTone;
  loading?: boolean;
  trend?: StatTrend;
};

export default function StatCard({ icon, label, value, detail, tone = 'blue', loading, trend }: StatCardProps) {
  const colors = statToneMap[tone];
  const trendTone = trend ? dash.trend[trend.direction] : null;

  return (
    <View
      className="dash-card dash-card-hover relative flex-1 rounded-[18px] p-4 border min-w-[170px] overflow-hidden dash-fade-in"
      style={{
        backgroundColor: dash.surface,
        borderColor: dash.hairline,
        ...dash.shadow.card,
      }}
    >
      {/* Top accent bar */}
      <View
        pointerEvents="none"
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ backgroundImage: colors.bar } as any}
      />
      {/* Tonal gradient wash */}
      <View
        pointerEvents="none"
        className="absolute inset-0"
        style={{ backgroundImage: colors.gradient } as any}
      />
      {/* Soft corner glow */}
      <View
        pointerEvents="none"
        className="absolute -top-10 -right-10 w-28 h-28 rounded-full opacity-50"
        style={{ backgroundColor: colors.glow }}
      />

      <View className="relative flex-row justify-between items-start mb-3">
        <View
          className="w-9 h-9 rounded-[12px] items-center justify-center"
          style={{ backgroundColor: colors.iconBg, ...dash.shadow.sm }}
        >
          <MaterialIcons name={icon} size={17} color={colors.iconFg} />
        </View>
        {trend && trendTone ? (
          <View
            className="flex-row items-center gap-1 px-2 py-1 rounded-full"
            style={{ backgroundColor: trendTone.bg }}
          >
            <MaterialIcons name={trendTone.icon} size={13} color={trendTone.fg} />
            <Text className="text-[10px] font-bold tracking-tight" style={{ color: trendTone.fg }} numberOfLines={1}>
              {trend.label}
            </Text>
          </View>
        ) : detail ? (
          <View className="px-2.5 py-1 rounded-full max-w-[52%]" style={{ backgroundColor: colors.badgeBg }}>
            <Text className="text-[10px] font-semibold" style={{ color: colors.badgeFg }} numberOfLines={1}>
              {loading ? '—' : detail}
            </Text>
          </View>
        ) : null}
      </View>

      <Text className="relative text-[10px] font-semibold uppercase tracking-[0.09em] mb-1.5" style={{ color: dash.muted }}>
        {label}
      </Text>

      {loading ? (
        <View className="relative gap-2 pt-0.5">
          <SkeletonBlock width="68%" height={24} />
          <SkeletonBlock width="42%" height={10} />
        </View>
      ) : (
        <>
          <Text
            className="relative text-[21px] font-bold tracking-tight leading-none"
            style={{ color: dash.ink }}
            numberOfLines={1}
          >
            {value}
          </Text>
          {trend && detail ? (
            <Text className="relative text-[10px] font-medium mt-2" style={{ color: dash.faint }} numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}
