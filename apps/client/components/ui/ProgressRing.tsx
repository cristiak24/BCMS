import type { ReactNode } from 'react';
import { View } from '@/src/web/reactNative';

/**
 * Circular progress (0–100) drawn as an SVG arc that animates in (`.ui-ring-arc`
 * in global.css). The track and arc colours are passed in so the ring works on
 * both a normal card and the always-dark hero panel.
 */
export default function ProgressRing({
  value,
  size = 72,
  stroke = 7,
  color = 'var(--c-brand-fg)',
  track = 'var(--c-surface-3)',
  label,
  children,
}: {
  /** 0–100; null renders an empty track. */
  value: number | null | undefined;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  /** Accessible description, e.g. "Rată prezență 82%". */
  label?: string;
  children?: ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = value == null ? 0 : Math.max(0, Math.min(100, value));
  const offset = circumference * (1 - clamped / 100);

  return (
    <View
      className="relative items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={track} strokeWidth={stroke} />
        {value != null ? (
          <circle
            className="ui-ring-arc"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ ['--ring-len' as any]: `${circumference}`, transition: 'stroke-dashoffset 0.6s cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
        ) : null}
      </svg>
      {children ? (
        <View className="absolute inset-0 items-center justify-center">{children}</View>
      ) : null}
    </View>
  );
}
