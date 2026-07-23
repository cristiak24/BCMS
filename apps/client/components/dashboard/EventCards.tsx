import { Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import type { ReactNode } from 'react';
import { dash } from './dashboardTheme';

type BaseEventCardProps = {
  title: string;
  dateLabel: string;
  month: string;
  day: string;
  time?: string;
  meta?: string;
  location?: string;
  ctaLabel?: string;
  onPress?: () => void;
};

type ResultCardProps = {
  homeTeam: string;
  awayTeam: string;
  score: string;
  context?: string;
  dateLabel: string;
  result?: string;
  compact?: boolean;
};

function DatePill({ month, day, accent = dash.accentBlue }: { month: string; day: string; accent?: string }) {
  return (
    <View
      className="w-[56px] h-[62px] rounded-[16px] items-center justify-center overflow-hidden relative"
      style={{ backgroundColor: dash.surface, ...dash.shadow.sm }}
    >
      <View
        pointerEvents="none"
        className="absolute top-0 left-0 right-0 h-[18px] items-center justify-center"
        style={{ backgroundColor: accent }}
      >
        <Text className="text-[9px] font-bold uppercase tracking-[0.08em] text-white leading-none">
          {month}
        </Text>
      </View>
      <Text className="text-[22px] font-bold leading-none mt-4" style={{ color: dash.ink }}>
        {day}
      </Text>
    </View>
  );
}

function EventShell({ children, onPress, accent = dash.accent }: { children: ReactNode; onPress?: () => void; accent?: string }) {
  const content = (
    <View
      className="dash-card dash-card-hover relative w-full rounded-[20px] border p-[18px] pl-5 overflow-hidden dash-fade-in"
      style={{
        backgroundColor: dash.surface,
        borderColor: dash.hairline,
        ...dash.shadow.card,
      }}
    >
      {/* Left accent rail */}
      <View pointerEvents="none" className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: accent }} />
      <View
        pointerEvents="none"
        className="absolute inset-0 opacity-70"
        style={{ backgroundImage: 'linear-gradient(120deg, rgba(99,91,255,0.035) 0%, transparent 46%)' } as any}
      />
      <View className="relative">{children}</View>
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="active:scale-[0.995] transition-transform duration-200">
      {content}
    </Pressable>
  );
}

export function NextEventCard({
  title,
  dateLabel,
  month,
  day,
  time,
  meta,
  location,
  ctaLabel = 'Details',
  onPress,
}: BaseEventCardProps) {
  return (
    <EventShell onPress={onPress} accent={dash.accentSky}>
      <View className="flex-col md:flex-row md:items-center gap-4">
        <DatePill month={month} day={day} accent={dash.accentSky} />
        <View className="flex-1 min-w-0">
          <View className="flex-row flex-wrap gap-2 mb-2.5">
            {meta ? (
              <View className="rounded-full px-2.5 py-1 flex-row items-center gap-1" style={{ backgroundColor: 'rgba(14,165,233,0.1)' }}>
                <MaterialIcons name="sports-basketball" size={11} color="#0284C7" />
                <Text className="text-[9px] font-bold uppercase tracking-[0.06em]" style={{ color: '#0284C7' }}>
                  {meta}
                </Text>
              </View>
            ) : null}
            {time ? (
              <View className="rounded-full px-2.5 py-1 flex-row items-center gap-1" style={{ backgroundColor: 'rgba(99,91,255,0.08)' }}>
                <MaterialIcons name="schedule" size={11} color={dash.accent} />
                <Text className="text-[9px] font-bold uppercase tracking-[0.06em]" style={{ color: dash.accent }}>
                  {time}
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="text-[17px] md:text-[18px] font-bold leading-snug tracking-tight" style={{ color: dash.ink }} numberOfLines={2}>
            {title}
          </Text>
          <View className="mt-2.5 flex-row flex-wrap gap-x-4 gap-y-1">
            <View className="flex-row items-center">
              <MaterialIcons name="calendar-today" size={14} color={dash.faint} />
              <Text className="text-[12px] font-medium ml-1.5" style={{ color: dash.muted }}>
                {dateLabel}
              </Text>
            </View>
            {location ? (
              <View className="flex-row items-center">
                <MaterialIcons name="location-on" size={15} color={dash.faint} />
                <Text className="text-[12px] font-medium ml-1.5" style={{ color: dash.muted }} numberOfLines={1}>
                  {location}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <View className="md:pl-2">
          <View
            className="rounded-[12px] px-4 py-2.5 flex-row items-center justify-center dash-btn-hover"
            style={{ backgroundImage: dash.gradients.heroInk, backgroundColor: dash.ink } as any}
          >
            <Text className="text-white text-[12px] font-semibold mr-1.5">{ctaLabel}</Text>
            <MaterialIcons name="arrow-forward" size={15} color="#FFFFFF" />
          </View>
        </View>
      </View>
    </EventShell>
  );
}

export function TrainingCard(props: BaseEventCardProps) {
  return <NextEventCard {...props} meta={props.meta ?? 'Training'} ctaLabel={props.ctaLabel ?? 'Session'} />;
}

export function GameCard(props: BaseEventCardProps) {
  return <NextEventCard {...props} meta={props.meta ?? 'Game'} ctaLabel={props.ctaLabel ?? 'Fișă Meci'} />;
}

export function ResultCard({ homeTeam, awayTeam, score, context, dateLabel, result, compact }: ResultCardProps) {
  const resultTone =
    result === 'W'
      ? { bg: 'rgba(16,185,129,0.1)', fg: 'var(--c-success-fg)', border: 'rgba(16,185,129,0.22)', bar: 'linear-gradient(90deg,#10B981,#34D399)', label: 'VICTORIE' }
      : result === 'L'
        ? { bg: 'rgba(239,68,68,0.08)', fg: 'var(--c-danger)', border: 'rgba(239,68,68,0.16)', bar: 'linear-gradient(90deg,#EF4444,#F87171)', label: 'ÎNFRÂNGERE' }
        : { bg: 'rgba(99,91,255,0.08)', fg: dash.accent, border: 'rgba(99,91,255,0.16)', bar: 'linear-gradient(90deg,#635BFF,#A78BFA)', label: 'FINAL' };
  const showResult = result && result !== 'N/A';

  return (
    <View
      className={`dash-card dash-card-hover relative ${compact ? 'min-w-[260px]' : 'min-w-[210px]'} rounded-[20px] p-[18px] border overflow-hidden dash-fade-in`}
      style={{
        backgroundColor: dash.surface,
        borderColor: dash.hairline,
        ...dash.shadow.card,
      }}
    >
      <View pointerEvents="none" className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundImage: resultTone.bar } as any} />

      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: dash.faint }} numberOfLines={1}>
          {dateLabel}
        </Text>
        {showResult ? (
          <View
            className="w-7 h-7 rounded-full items-center justify-center border"
            style={{ backgroundColor: resultTone.bg, borderColor: resultTone.border }}
          >
            <Text className="text-[11px] font-bold" style={{ color: resultTone.fg }}>
              {result}
            </Text>
          </View>
        ) : null}
      </View>
      {context ? (
        <Text className="text-[10px] font-semibold uppercase tracking-[0.06em] mb-3" style={{ color: dash.muted }} numberOfLines={1}>
          {context}
        </Text>
      ) : null}
      <View className="gap-2">
        <Text className="text-[13px] font-semibold" style={{ color: dash.inkSoft }} numberOfLines={1}>
          {homeTeam}
        </Text>
        <View className="flex-row items-center justify-between py-1">
          <View className="px-2 py-0.5 rounded-md" style={{ backgroundColor: resultTone.bg }}>
            <Text className="text-[9px] font-bold uppercase tracking-[0.06em]" style={{ color: resultTone.fg }}>
              {resultTone.label}
            </Text>
          </View>
          <Text className="text-[26px] font-bold tracking-tight leading-none" style={{ color: dash.ink }}>
            {score}
          </Text>
        </View>
        <Text className="text-[13px] font-semibold" style={{ color: dash.inkSoft }} numberOfLines={1}>
          {awayTeam}
        </Text>
      </View>
    </View>
  );
}
