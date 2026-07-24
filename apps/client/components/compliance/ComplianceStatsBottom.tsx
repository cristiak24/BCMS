import React from 'react';
import { View, Text } from '@/src/web/reactNative';
import { Users, CheckCircle, ShieldCheck } from 'lucide-react';
import type { ComplianceMetrics } from './complianceMetrics';

type Props = {
  metrics: ComplianceMetrics;
};

type TileProps = {
  icon: React.ReactNode;
  iconBg: string;
  value: string;
  label: string;
};

function Tile({ icon, iconBg, value, label }: TileProps) {
  return (
    <View
      className="flex-1 rounded-3xl p-6 shadow-sm border flex-row items-center gap-4"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
    >
      <View className="w-12 h-12 rounded-full items-center justify-center" style={{ backgroundColor: iconBg }}>
        {icon}
      </View>
      <View>
        <Text className="text-2xl font-black" style={{ color: 'var(--c-ink)' }}>{value}</Text>
        <Text
          className="text-[10px] font-black uppercase tracking-widest mt-1"
          style={{ color: 'var(--c-muted)' }}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

export default function ComplianceStatsBottom({ metrics }: Props) {
  const { pendingReviews, valid, total, missing } = metrics;

  // "Audit ready" means every athlete has a document on file — an athlete with no
  // medical check at all is what actually blocks an audit.
  const auditReadyPercent = total === 0 ? 0 : Math.round(((total - missing) / total) * 100);

  return (
    <View className="flex-col md:flex-row gap-6 mt-8 w-full">
      <Tile
        icon={<Users size={20} color="var(--c-brand-fg)" />}
        iconBg="var(--c-surface-tint)"
        value={String(pendingReviews)}
        label="Pending Reviews"
      />
      <Tile
        icon={<CheckCircle size={20} color="var(--c-success-fg)" />}
        iconBg="var(--c-success-bg)"
        value={String(valid)}
        label="Cleared Athletes"
      />
      <Tile
        icon={<ShieldCheck size={20} color="var(--c-ink-soft)" />}
        iconBg="var(--c-surface-3)"
        value={`${auditReadyPercent}%`}
        label="Audit Ready"
      />
    </View>
  );
}
