import React from 'react';
import { Pressable, Text, View } from '@/src/web/reactNative';
import { X } from 'lucide-react';
import SelectField from '../ui/SelectField';

interface FilterOption {
  label: string;
  value: string;
}

interface RosterFiltersProps {
  teamOptions: FilterOption[];
  statusOptions: FilterOption[];
  attendanceOptions: FilterOption[];
  paymentOptions: FilterOption[];
  selectedTeam: string;
  selectedStatus: string;
  selectedAttendance: string;
  selectedPayment: string;
  onTeamChange: (nextValue: string) => void;
  onStatusChange: (nextValue: string) => void;
  onAttendanceChange: (nextValue: string) => void;
  onPaymentChange: (nextValue: string) => void;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
}

export default function RosterFilters({
  teamOptions,
  statusOptions,
  attendanceOptions,
  paymentOptions,
  selectedTeam,
  selectedStatus,
  selectedAttendance,
  selectedPayment,
  onTeamChange,
  onStatusChange,
  onAttendanceChange,
  onPaymentChange,
  hasActiveFilters,
  onResetFilters,
}: RosterFiltersProps) {
  const toSelect = (options: FilterOption[]) => options.map((option) => ({ key: option.value, label: option.label }));

  // Native selects: one 36px control per filter (2×2 on phones, one row on
  // desktop). The old label-over-value tiles were ~60px tall each and wrapped
  // "Toate pragurile" onto two lines.
  return (
    <View className="mb-4 gap-2">
      <View className="grid grid-cols-2 lg:flex lg:flex-row lg:items-center gap-2">
        <SelectField hideIconOnMobile label="Echipă" icon="groups" options={toSelect(teamOptions)} value={selectedTeam} onChange={onTeamChange} className="min-w-0 col-span-2 lg:col-span-1 lg:w-[220px]" />
        <SelectField hideIconOnMobile label="Status" icon="person" options={toSelect(statusOptions)} value={selectedStatus} onChange={onStatusChange} className="min-w-0 lg:w-[160px]" />
        <SelectField hideIconOnMobile label="Prezență" icon="fact-check" options={toSelect(attendanceOptions)} value={selectedAttendance} onChange={onAttendanceChange} className="min-w-0 col-span-2 lg:col-span-1 lg:w-[190px] order-last lg:order-none" />
        <SelectField hideIconOnMobile label="Plată" icon="payments" options={toSelect(paymentOptions)} value={selectedPayment} onChange={onPaymentChange} className="min-w-0 lg:w-[170px]" />
        {hasActiveFilters ? (
          <Pressable
            onPress={onResetFilters}
            accessibilityRole="button"
            className="ui-press h-9 flex-row items-center justify-center gap-1.5 rounded-[10px] px-3 col-span-2 lg:col-span-1"
            style={{ backgroundColor: 'var(--c-danger-bg)' }}
          >
            <X color="var(--c-danger-fg)" size={13} />
            <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-danger-fg)' }}>Șterge filtrele</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
