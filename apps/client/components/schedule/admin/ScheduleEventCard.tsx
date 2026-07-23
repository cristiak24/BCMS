import React from 'react';
import { View, Text, TouchableOpacity } from '@/src/web/reactNative';
import { Clock, MapPin, Copy, Ban, RotateCcw } from 'lucide-react';
import { CalendarEvent } from '../../../services/eventsApi';
import { EVENT_TYPE_META, isCancelledEvent, formatTimeRange, RO_LOCALE } from '../scheduleShared';

export const ScheduleEventCard = React.memo(({
  item,
  isMobile,
  isSmallPhone,
  compact = false,
  onPress,
  onAttendance,
  onDuplicate,
  onToggleCancelled,
}: {
  item: CalendarEvent;
  isMobile: boolean;
  isSmallPhone: boolean;
  compact?: boolean;
  onPress: () => void;
  onAttendance?: () => void;
  onDuplicate?: () => void;
  onToggleCancelled?: () => void;
}) => {
  const eventDate = new Date(item.startTime);
  const meta = EVENT_TYPE_META[item.type];
  const cancelled = isCancelledEvent(item);
  const stacked = compact || isMobile;
  const showQuickActions = !stacked && (onDuplicate || onToggleCancelled);
  const showAttendance = !stacked && (item.type === 'training' || item.type === 'match');

  const dateBlock = (
    <View
      className={`${stacked ? 'w-12 h-12 rounded-[14px]' : 'w-[52px] h-[52px] rounded-[16px]'} items-center justify-center border`}
      style={{ backgroundColor: meta.soft, borderColor: meta.soft }}
    >
      <Text className="text-[9px] font-black uppercase tracking-wider" style={{ color: meta.onSoft }}>
        {eventDate.toLocaleString(RO_LOCALE, { month: 'short' }).toUpperCase()}
      </Text>
      <Text className="text-[17px] font-black text-[#0E2041] leading-tight">{eventDate.getDate()}</Text>
    </View>
  );

  const meta_row = (
    <View className={`${stacked ? 'gap-1.5 mt-1.5' : 'flex-row items-center gap-4 mt-1'}`}>
      <View className="flex-row items-center gap-1.5">
        <Clock size={13} color="var(--c-faint)" />
        <Text className="text-[12px] text-slate-500 font-bold">
          {formatTimeRange(item.startTime, item.endTime)}
        </Text>
      </View>
      <View className="flex-row items-center gap-1.5 flex-1 min-w-0">
        <MapPin size={13} color="var(--c-faint)" />
        <Text numberOfLines={1} className="text-[12px] text-slate-500 font-semibold flex-1">
          {item.location || 'Sală principală'}
        </Text>
      </View>
    </View>
  );

  const typeBadge = (
    <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: meta.soft }}>
      <Text className="text-[9px] font-black uppercase tracking-widest" style={{ color: meta.onSoft }}>
        {meta.label}
      </Text>
    </View>
  );

  return (
    // NOTE: plain View, not a Pressable — the navigable region and the action
    // buttons below are separate pressables. Nesting them would put a
    // <button> inside a <button>, which is invalid HTML and breaks hydration.
    <View
      className={`bg-white border border-[#E7EEF7] hover:border-[#C9DBF2] ${cancelled ? 'opacity-60' : ''} ${
        stacked ? 'rounded-[20px] px-4 py-4' : 'rounded-[20px] pl-5 pr-4 py-4 flex-row items-center gap-4'
      }`}
      style={{ borderLeftWidth: 3, borderLeftColor: cancelled ? 'var(--c-border-strong)' : meta.solid }}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        className={`hover:opacity-80 ${stacked ? 'gap-3' : 'flex-row items-center gap-4 flex-1 min-w-0'}`}
      >
        {dateBlock}

        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2">
            <Text
              numberOfLines={1}
              className={`${stacked ? 'text-[15px]' : 'text-[16px]'} font-black text-[#0E2041] flex-1 ${cancelled ? 'line-through' : ''}`}
            >
              {item.title}
            </Text>
            {/* On stacked layouts the badges live inline with the title. */}
            {stacked ? (
              <View className="flex-row items-center gap-1.5">
                {cancelled && (
                  <View className="bg-rose-50 rounded-full px-2.5 py-1 border border-rose-100">
                    <Text className="text-[9px] font-black uppercase tracking-widest text-rose-500">Anulat</Text>
                  </View>
                )}
                {typeBadge}
              </View>
            ) : null}
          </View>
          {meta_row}
        </View>
      </TouchableOpacity>

      {/* Desktop trailing cluster — kept tight so wide cards don't read as empty. */}
      {!stacked ? (
        <View className="flex-row items-center gap-2 shrink-0">
          {cancelled && (
            <View className="bg-rose-50 rounded-full px-2.5 py-1 border border-rose-100">
              <Text className="text-[9px] font-black uppercase tracking-widest text-rose-500">Cancelled</Text>
            </View>
          )}
          {typeBadge}

          {showAttendance ? (
            <TouchableOpacity
              onPress={() => onAttendance?.()}
              className="rounded-full bg-[#EAF1FB] border border-[#D6E4F7] px-3.5 py-2 hover:bg-[#DDE9F9]"
            >
              <Text className="text-[#1D3E90] text-[10.5px] font-black uppercase tracking-widest">Prezență</Text>
            </TouchableOpacity>
          ) : null}

          {showQuickActions ? (
            <View className="flex-row items-center gap-1.5">
              {onDuplicate && (
                <TouchableOpacity
                  onPress={() => onDuplicate()}
                  className="w-8 h-8 rounded-full bg-[#F4F7FC] items-center justify-center border border-[#E3EAF5] hover:bg-[#E9EFF8]"
                  accessibilityLabel="Duplică evenimentul"
                >
                  <Copy size={14} color="var(--c-muted)" />
                </TouchableOpacity>
              )}
              {onToggleCancelled && (
                <TouchableOpacity
                  onPress={() => onToggleCancelled()}
                  className={`w-8 h-8 rounded-full items-center justify-center border ${
                    cancelled ? 'bg-emerald-50 border-emerald-100' : 'bg-[#F4F7FC] border-[#E3EAF5] hover:bg-[#E9EFF8]'
                  }`}
                  accessibilityLabel={cancelled ? 'Reactivează evenimentul' : 'Anulează evenimentul'}
                >
                  {cancelled ? <RotateCcw size={14} color="var(--c-success-fg)" /> : <Ban size={14} color="var(--c-muted)" />}
                </TouchableOpacity>
              )}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});
ScheduleEventCard.displayName = 'ScheduleEventCard';
