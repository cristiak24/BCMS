import React, { useState } from 'react';
import { Pressable, Text, View } from '@/src/web/reactNative';
import { X } from 'lucide-react';
import FilterBar from '../dashboard/FilterBar';
import RosterFilterSheet from './RosterFilterSheet';
import { dash } from '../dashboard/dashboardTheme';

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

type SheetKey = 'team' | 'status' | 'attendance' | 'payment' | null;

function labelFor(options: FilterOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? options[0]?.label ?? '';
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
  const [openSheet, setOpenSheet] = useState<SheetKey>(null);

  return (
    <View className="mb-5 flex-row items-center gap-3 flex-wrap">
      <FilterBar
        items={[
          {
            key: 'team',
            label: 'Echipă',
            value: labelFor(teamOptions, selectedTeam),
            active: selectedTeam !== 'all',
            onPress: () => setOpenSheet('team'),
          },
          {
            key: 'status',
            label: 'Status',
            value: labelFor(statusOptions, selectedStatus),
            active: selectedStatus !== 'all',
            onPress: () => setOpenSheet('status'),
          },
          {
            key: 'attendance',
            label: 'Prezență',
            value: labelFor(attendanceOptions, selectedAttendance),
            active: selectedAttendance !== 'all',
            onPress: () => setOpenSheet('attendance'),
          },
          {
            key: 'payment',
            label: 'Plată',
            value: labelFor(paymentOptions, selectedPayment),
            active: selectedPayment !== 'all',
            onPress: () => setOpenSheet('payment'),
          },
        ]}
      />

      {hasActiveFilters ? (
        <Pressable
          onPress={onResetFilters}
          className="dash-btn-hover h-10 flex-row items-center gap-1.5 rounded-[11px] px-3.5"
          style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}
        >
          <X color={dash.dangerDeep} size={13} />
          <Text className="text-[11px] font-bold" style={{ color: dash.dangerDeep }}>
            Șterge filtrele
          </Text>
        </Pressable>
      ) : null}

      <RosterFilterSheet
        visible={openSheet === 'team'}
        title="Alege echipa"
        icon="groups"
        items={teamOptions.map((option) => ({ id: option.value, label: option.label }))}
        selectedId={selectedTeam}
        onSelect={onTeamChange}
        onClose={() => setOpenSheet(null)}
      />
      <RosterFilterSheet
        visible={openSheet === 'status'}
        title="Alege statusul"
        icon="verified-user"
        items={statusOptions.map((option) => ({ id: option.value, label: option.label }))}
        selectedId={selectedStatus}
        onSelect={onStatusChange}
        onClose={() => setOpenSheet(null)}
      />
      <RosterFilterSheet
        visible={openSheet === 'attendance'}
        title="Alege pragul de prezență"
        icon="fact-check"
        items={attendanceOptions.map((option) => ({ id: option.value, label: option.label }))}
        selectedId={selectedAttendance}
        onSelect={onAttendanceChange}
        onClose={() => setOpenSheet(null)}
      />
      <RosterFilterSheet
        visible={openSheet === 'payment'}
        title="Alege statusul plății"
        icon="payment"
        items={paymentOptions.map((option) => ({ id: option.value, label: option.label }))}
        selectedId={selectedPayment}
        onSelect={onPaymentChange}
        onClose={() => setOpenSheet(null)}
      />
    </View>
  );
}
