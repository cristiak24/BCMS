import React from 'react';
import { Pressable, View } from '@/src/web/reactNative';
import { Check, Minus } from 'lucide-react';
import { dash } from '../dashboard/dashboardTheme';

interface RosterCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onToggle: () => void;
  size?: number;
  accessibilityLabel?: string;
}

export default function RosterCheckbox({ checked, indeterminate, onToggle, size = 20, accessibilityLabel }: RosterCheckboxProps) {
  const active = checked || indeterminate;

  // A 32px touch target around the drawn box (the box alone was 20px, 12 of
  // them per Lot page); the negative margin keeps the row's layout unchanged.
  const hit = Math.max(size, 40); // ≥40px to touch; the negative margin keeps the layout
  return (
    <Pressable
      onPress={(event: any) => {
        event.stopPropagation?.();
        onToggle();
      }}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      aria-checked={indeterminate && !checked ? 'mixed' : Boolean(checked)}
      className="items-center justify-center shrink-0"
      style={{ width: hit, height: hit, margin: -(hit - size) / 2 }}
    >
      <View
        className="items-center justify-center rounded-[7px] border transition-all duration-150"
        style={{
          width: size,
          height: size,
          borderColor: active ? dash.accentBlue : dash.line,
          backgroundColor: active ? dash.accentBlue : dash.surface,
        }}
      >
        {checked ? <Check color="var(--c-surface)" size={Math.round(size * 0.65)} /> : null}
        {!checked && indeterminate ? <Minus color="var(--c-surface)" size={Math.round(size * 0.65)} /> : null}
      </View>
    </Pressable>
  );
}
