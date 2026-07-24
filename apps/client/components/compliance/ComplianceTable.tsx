import React from 'react';
import { View, Text, Pressable, Image } from '@/src/web/reactNative';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { Player } from '../../services/teamsApi';
import { useResponsive } from '../../hooks/useResponsive';

interface ComplianceTableProps {
  data: Player[];
  selectedIds: number[];
  onToggleSelect: (id: number) => void;
  onSelectAll: (ids: number[]) => void;
}

export default function ComplianceTable({ data, selectedIds, onToggleSelect, onSelectAll }: ComplianceTableProps) {
  const { isMobile } = useResponsive();

  const allSelected = data.length > 0 && selectedIds.length === data.length;

  const handleSelectAll = () => {
    if (allSelected) {
      onSelectAll([]);
    } else {
      onSelectAll(data.map(p => p.id));
    }
  };

  const formatDate = (isoString: string | null) => {
    if (!isoString) return 'Missing';
    return new Date(isoString).toLocaleDateString('ro-RO', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getMedicalStatus = (expiry: string | null) => {
     if (!expiry) return 'EXPIRED';
     const expDate = new Date(expiry);
     const now = new Date();
     const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
     
     if (diffDays < 0) return 'EXPIRED';
     if (diffDays <= 30) return 'EXPIRING_SOON';
     return 'VALID';
  };

  // Inline dot (flex-row), not absolute. The old version positioned the dot
  // `absolute` inside a non-relative pill, so it escaped its container and
  // rendered as a stray coloured dot at the top-left of the whole page.
  const renderMedicalBadge = (status: string) => {
    const map = {
      VALID: { label: 'Valid', dot: 'var(--c-sky)', fg: 'var(--c-sky)', bg: 'var(--c-surface-tint)' },
      EXPIRED: { label: 'Expired', dot: 'var(--c-danger)', fg: 'var(--c-danger-fg)', bg: 'var(--c-danger-bg)' },
      EXPIRING_SOON: { label: 'Expiring Soon', dot: 'var(--c-brand-fg)', fg: 'var(--c-brand-fg)', bg: 'var(--c-surface-tint)' },
    } as const;
    const s = map[status as keyof typeof map] ?? map.EXPIRING_SOON;
    return (
      <View className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full self-start" style={{ backgroundColor: s.bg }}>
        <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
        <Text className="text-[11px] font-semibold" style={{ color: s.fg }}>{s.label}</Text>
      </View>
    );
  };

  const renderMedicalClearance = (status: string) => {
    if (status === 'VALID') {
        return (
          <View className="flex-row items-center gap-2">
            <CheckCircle size={16} color="var(--c-brand-fg)" />
            <Text className="text-[13px] font-bold text-[#0D2040]">Valid</Text>
          </View>
        );
    }
    return (
      <View className="flex-row items-center gap-2">
        <AlertTriangle size={16} color="var(--c-danger)" />
        <Text className="text-[13px] font-bold text-red-600">Update Needed</Text>
      </View>
    );
  };

  const renderActionLabel = (mStatus: string) => {
     if (mStatus === 'EXPIRED') return 'Request Renewal';
     if (mStatus === 'EXPIRING_SOON') return 'Update File';
     return 'View Details';
  };

  const Checkbox = ({ checked, onPress }: { checked: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      <View
        className="w-5 h-5 rounded-[6px] border items-center justify-center"
        style={checked
          ? { backgroundColor: 'var(--c-brand-surface)', borderColor: 'var(--c-brand-surface)' }
          : { backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border-strong)' }}
      >
        {checked && <View className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: 'var(--c-on-brand)' }} />}
      </View>
    </Pressable>
  );

  // ── Mobile: one card per player. A 5-column table cannot fit 375px without
  //    the header columns overlapping, so on phones each row becomes a
  //    self-contained card with the fields stacked and labelled. ──
  if (isMobile) {
    return (
      <View className="gap-2.5 w-full">
        {data.map((player) => {
          const isSelected = selectedIds.includes(player.id);
          const medStatus = getMedicalStatus(player.medicalCheckExpiry);
          return (
            <View
              key={player.id}
              className="rounded-[14px] border p-3.5"
              style={{ backgroundColor: 'var(--c-surface)', borderColor: isSelected ? 'var(--c-brand-border)' : 'var(--c-border)' }}
            >
              <View className="flex-row items-center gap-3">
                <Checkbox checked={isSelected} onPress={() => onToggleSelect(player.id)} />
                <Image source={{ uri: player.avatarUrl || 'https://i.pravatar.cc/150' }} className="w-11 h-11 rounded-full" style={{ backgroundColor: 'var(--c-surface-3)' }} />
                <View className="flex-1 min-w-0">
                  <Text className="text-[14px] font-bold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
                    {player.firstName} {player.lastName}
                  </Text>
                  <Text className="text-[11px] font-medium" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                    {player.position || '-'} • #{player.number || '-'}
                  </Text>
                </View>
                {renderMedicalBadge(medStatus)}
              </View>

              <View className="flex-row items-center justify-between mt-3 pt-3 border-t" style={{ borderColor: 'var(--c-border-soft)' }}>
                <View className="flex-row items-center gap-4">
                  <View>
                    <Text className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--c-faint)' }}>Expiră</Text>
                    <Text className="text-[12px] font-bold mt-0.5" style={{ color: medStatus === 'EXPIRED' ? 'var(--c-danger)' : 'var(--c-ink)' }}>
                      {formatDate(player.medicalCheckExpiry)}
                    </Text>
                  </View>
                  <View>
                    <Text className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--c-faint)' }}>Medic</Text>
                    <View className="mt-0.5">{renderMedicalClearance(medStatus)}</View>
                  </View>
                </View>
                <Pressable className="h-8 px-3 rounded-[9px] items-center justify-center" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                  <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>{renderActionLabel(medStatus)}</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  // ── Desktop: the aligned table. ──
  return (
    <View className="rounded-[16px] border overflow-hidden w-full" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
      <View className="flex-row border-b px-5 py-3" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' }}>
        <View className="w-10 justify-center"><Checkbox checked={allSelected} onPress={handleSelectAll} /></View>
        <Text className="flex-[2] text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--c-faint)' }}>Jucător</Text>
        <Text className="flex-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--c-faint)' }}>Status Viză</Text>
        <Text className="flex-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--c-faint)' }}>Expiră La</Text>
        <Text className="flex-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--c-faint)' }}>Medic Sportiv</Text>
        <Text className="w-32 text-[10px] font-semibold uppercase tracking-wider text-right" style={{ color: 'var(--c-faint)' }}>Acțiuni</Text>
      </View>

      {data.map((player) => {
        const isSelected = selectedIds.includes(player.id);
        const medStatus = getMedicalStatus(player.medicalCheckExpiry);
        return (
          <Pressable
            key={player.id}
            onPress={() => onToggleSelect(player.id)}
            className="flex-row items-center px-5 py-3.5 border-b dash-row-hover"
            style={{ borderColor: 'var(--c-border-soft)', backgroundColor: isSelected ? 'var(--c-surface-2)' : 'transparent' }}
          >
            <View className="w-10 justify-center"><Checkbox checked={isSelected} onPress={() => onToggleSelect(player.id)} /></View>
            <View className="flex-[2] flex-row items-center gap-3 pr-4">
              <Image source={{ uri: player.avatarUrl || 'https://i.pravatar.cc/150' }} className="w-10 h-10 rounded-full" style={{ backgroundColor: 'var(--c-surface-3)' }} />
              <View className="min-w-0">
                <Text className="text-[14px] font-bold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{player.firstName} {player.lastName}</Text>
                <Text className="text-[11px] font-medium" style={{ color: 'var(--c-muted)' }}>{player.position || '-'} • #{player.number || '-'}</Text>
              </View>
            </View>
            <View className="flex-1">{renderMedicalBadge(medStatus)}</View>
            <View className="flex-1">
              <Text className="text-[13px] font-bold" style={{ color: medStatus === 'EXPIRED' ? 'var(--c-danger)' : 'var(--c-ink)' }}>
                {formatDate(player.medicalCheckExpiry)}
              </Text>
            </View>
            <View className="flex-1">{renderMedicalClearance(medStatus)}</View>
            <View className="w-32 items-end">
              <Pressable>
                <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>{renderActionLabel(medStatus)}</Text>
              </Pressable>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
