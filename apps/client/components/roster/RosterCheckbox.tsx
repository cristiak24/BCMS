import React from 'react';
import { Pressable } from '@/src/web/reactNative';
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

  return (
    <Pressable
      onPress={(event: any) => {
        event.stopPropagation?.();
        onToggle();
      }}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      className="items-center justify-center rounded-[7px] border transition-all duration-150"
      style={{
        width: size,
        height: size,
        borderColor: active ? dash.accentBlue : dash.line,
        backgroundColor: active ? dash.accentBlue : dash.surface,
      }}
    >
      {checked ? <Check color="#FFFFFF" size={Math.round(size * 0.65)} /> : null}
      {!checked && indeterminate ? <Minus color="#FFFFFF" size={Math.round(size * 0.65)} /> : null}
    </Pressable>
  );
}
