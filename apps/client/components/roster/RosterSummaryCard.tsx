import React from 'react';
import { View, Text, Pressable } from '@/src/web/reactNative';
import { LucideIcon } from 'lucide-react';
import { dash, statToneMap } from '../dashboard/dashboardTheme';
import { SkeletonBlock } from '../dashboard/ScreenStates';

type AccentTone = 'blue' | 'green' | 'red';

interface RosterSummaryCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: LucideIcon;
  accent?: AccentTone;
  helperText?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  actionDisabled?: boolean;
  loading?: boolean;
}

const accentStyles: Record<AccentTone, { iconBg: string; iconColor: string; helperColor: string; valueColor: string }> = {
  blue: {
    iconBg: statToneMap.blue.iconBg,
    iconColor: statToneMap.blue.iconFg,
    helperColor: dash.accentBlue,
    valueColor: dash.ink,
  },
  green: {
    iconBg: statToneMap.green.iconBg,
    iconColor: statToneMap.green.iconFg,
    helperColor: dash.successDeep,
    valueColor: dash.ink,
  },
  red: {
    iconBg: 'rgba(239,68,68,0.09)',
    iconColor: dash.dangerDeep,
    helperColor: dash.dangerDeep,
    valueColor: dash.dangerDeep,
  },
};

export default function RosterSummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent = 'blue',
  helperText,
  actionLabel,
  onActionPress,
  actionDisabled,
  loading,
}: RosterSummaryCardProps) {
  const palette = accentStyles[accent];

  return (
    <View
      className="dash-card dash-card-hover dash-fade-in flex-1 rounded-[28px] border p-5"
      style={{ backgroundColor: dash.surface, borderColor: dash.hairline, ...dash.shadow.card }}
    >
      <View className="mb-5 flex-row items-start justify-between gap-4">
        <View className="flex-1">
          <Text className="text-[10px] font-black uppercase tracking-[2px]" style={{ color: dash.faint }}>
            {title}
          </Text>
          <Text className="mt-2 text-[13px] font-bold leading-5" style={{ color: dash.muted }}>
            {subtitle}
          </Text>
        </View>
        <View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: palette.iconBg }}>
          <Icon color={palette.iconColor} size={18} />
        </View>
      </View>

      {loading ? (
        <View className="gap-3">
          <SkeletonBlock width="60%" height={38} />
          <SkeletonBlock width="80%" height={14} />
        </View>
      ) : (
        <View className="flex-row items-end justify-between gap-5">
          <View className="flex-1">
            <Text className="text-[42px] font-black leading-[44px]" style={{ color: palette.valueColor }}>
              {value}
            </Text>
            {helperText ? (
              <Text className="mt-3 text-[12px] font-black leading-5" style={{ color: palette.helperColor }}>
                {helperText}
              </Text>
            ) : null}
          </View>

          {actionLabel ? (
            <Pressable
              onPress={onActionPress}
              disabled={actionDisabled}
              className="dash-btn-hover rounded-2xl border px-4 py-3"
              style={{
                borderColor: actionDisabled ? dash.line : 'rgba(37,99,235,0.25)',
                backgroundColor: actionDisabled ? dash.lineSoft : 'rgba(37,99,235,0.06)',
              }}
            >
              <Text
                className="text-[13px] font-bold"
                style={{ color: actionDisabled ? dash.faint : dash.accentBlue }}
              >
                {actionLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}
