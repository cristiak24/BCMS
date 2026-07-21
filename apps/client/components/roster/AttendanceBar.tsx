import React from 'react';
import { StyleSheet, View } from '@/src/web/reactNative';
import { dash } from '../dashboard/dashboardTheme';

interface AttendanceBarProps {
  value: number;
}

export default function AttendanceBar({ value }: AttendanceBarProps) {
  const width = `${Math.max(6, Math.min(value, 100))}%` as const;
  const barColor = value >= 90 ? dash.success : value >= 75 ? dash.accentBlue : dash.warning;

  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width, backgroundColor: barColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 116,
    height: 6,
    borderRadius: 999,
    backgroundColor: dash.lineSoft,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
});
