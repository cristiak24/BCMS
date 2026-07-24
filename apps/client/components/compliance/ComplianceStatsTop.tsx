import React from 'react';
import { View, Text } from '@/src/web/reactNative';
import { AlertCircle, CalendarClock } from 'lucide-react';
import type { ComplianceMetrics } from './complianceMetrics';

type Props = {
  metrics: ComplianceMetrics;
  loading?: boolean;
};

/** Two-digit padding so "4" reads as "04" like the original design. */
function pad(value: number) {
  return value < 10 ? `0${value}` : String(value);
}

export default function ComplianceStatsTop({ metrics, loading = false }: Props) {
  const { securePercent, expired, dueSoon, total } = metrics;

  // Donut is drawn from four quarter-borders, so the fill resolves in 25% steps.
  const filledQuarters = Math.round((securePercent / 100) * 4);
  const brand = 'var(--c-brand-fg)';
  const track = 'var(--c-surface-tint)';

  return (
    <View className="flex-col lg:flex-row gap-3 mb-5 w-full">
      {/* Global Club Compliance — the anchor card. Donut pulled from 112px to
          80px and padding from 24px to 16px so it stops dominating the fold,
          especially stacked on mobile. */}
      <View
        className="flex-[1.4] rounded-[14px] p-4 border flex-row justify-between items-center"
        style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
      >
        <View className="flex-1 pr-3">
          <Text className="text-[15px] font-bold mb-1 leading-tight" style={{ color: 'var(--c-ink)' }}>
            Global Club Compliance
          </Text>
          <Text className="text-[12px] font-medium leading-snug mb-2.5" style={{ color: 'var(--c-muted)' }}>
            Starea vizelor și a documentelor medicale.
          </Text>
          <View className="px-2.5 py-1 rounded-full self-start" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
            <Text className="text-[11px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>
              {loading ? 'Se actualizează...' : `${total} ${total === 1 ? 'sportiv' : 'sportivi'} monitorizați`}
            </Text>
          </View>
        </View>

        <View
          className="w-20 h-20 rounded-full border-[7px] items-center justify-center shrink-0"
          style={{
            backgroundColor: 'var(--c-surface)',
            borderColor: track,
            borderRightColor: filledQuarters >= 1 ? brand : track,
            borderBottomColor: filledQuarters >= 2 ? brand : track,
            borderLeftColor: filledQuarters >= 3 ? brand : track,
            borderTopColor: filledQuarters >= 4 ? brand : track,
          }}
          accessibilityRole="img"
          accessibilityLabel={`${securePercent}% dintre sportivi au vizita medicală validă`}
        >
          <Text className="text-[18px] font-bold" style={{ color: 'var(--c-ink)' }}>{securePercent}%</Text>
          <Text className="text-[8px] font-semibold uppercase tracking-wider" style={{ color: 'var(--c-faint)' }}>
            Secure
          </Text>
        </View>
      </View>

      {/* The two counters sit side-by-side (a 2-col row) even on mobile, instead
          of two full-width ~280px cards you had to scroll past. */}
      <View className="flex-row gap-3 flex-1">
        <StatCounter
          icon={<AlertCircle size={16} color="var(--c-danger)" />}
          iconBg="var(--c-danger-bg)"
          value={pad(expired)}
          valueColor="var(--c-danger)"
          title="Vize expirate"
          subtitle={expired === 0 ? 'Nicio vizită expirată' : 'Necesită reînnoire'}
          accent="var(--c-danger)"
        />
        <StatCounter
          icon={<CalendarClock size={16} color="var(--c-blue)" />}
          iconBg="var(--c-surface-tint)"
          value={pad(dueSoon)}
          valueColor="var(--c-ink)"
          title="Următoarele 30 zile"
          subtitle="Actualizări programate"
          accent="var(--c-blue)"
        />
      </View>
    </View>
  );
}

function StatCounter({
  icon, iconBg, value, valueColor, title, subtitle, accent,
}: {
  icon: React.ReactNode;
  iconBg: string;
  value: string;
  valueColor: string;
  title: string;
  subtitle: string;
  accent: string;
}) {
  return (
    <View
      className="flex-1 rounded-[14px] p-4 border justify-between"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', borderLeftWidth: 3, borderLeftColor: accent } as any}
    >
      <View className="flex-row justify-between items-start mb-3">
        <View className="w-8 h-8 rounded-[9px] items-center justify-center" style={{ backgroundColor: iconBg }}>
          {icon}
        </View>
        <Text className="text-[28px] font-bold tabular leading-none" style={{ color: valueColor }}>{value}</Text>
      </View>
      <View>
        <Text className="text-[13px] font-bold mb-0.5" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{title}</Text>
        <Text className="text-[11.5px] font-medium leading-snug" style={{ color: 'var(--c-muted)' }} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}
