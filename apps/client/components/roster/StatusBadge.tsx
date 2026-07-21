import React from 'react';
import { StyleSheet, Text, View } from '@/src/web/reactNative';
import { dash } from '../dashboard/dashboardTheme';

interface StatusBadgeProps {
  label: string;
  tone?: 'blue' | 'green' | 'red' | 'amber' | 'gray';
}

const palette = {
  blue: {
    backgroundColor: 'rgba(37,99,235,0.08)',
    textColor: dash.accentBlue,
  },
  green: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    textColor: dash.successDeep,
  },
  red: {
    backgroundColor: 'rgba(239,68,68,0.09)',
    textColor: dash.dangerDeep,
  },
  amber: {
    backgroundColor: 'rgba(245,158,11,0.1)',
    textColor: dash.warningDeep,
  },
  gray: {
    backgroundColor: dash.lineSoft,
    textColor: dash.muted,
  },
};

export default function StatusBadge({ label, tone = 'gray' }: StatusBadgeProps) {
  const colors = palette[tone];

  return (
    <View style={[styles.badge, { backgroundColor: colors.backgroundColor }]}>
      <Text style={[styles.label, { color: colors.textColor }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 11,
    fontWeight: '900',
  },
});
