import React from 'react';
import { StyleSheet, View } from '@/src/web/reactNative';

interface AttendanceBarProps {
  value: number;
}

export default function AttendanceBar({ value }: AttendanceBarProps) {
  const width = `${Math.max(6, Math.min(value, 100))}%` as const;
  // Same thresholds as the percentage text next to it (75 / 60).
  const barColor = value >= 75 ? 'var(--c-success)' : value >= 60 ? 'var(--c-warning)' : 'var(--c-danger)';

  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width, backgroundColor: barColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    maxWidth: 116,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'var(--c-surface-3)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
});
