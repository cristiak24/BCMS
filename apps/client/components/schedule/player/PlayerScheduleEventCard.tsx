import React from 'react';
import { View, Text, TouchableOpacity } from '@/src/web/reactNative';
import { Clock, MapPin } from 'lucide-react';
import { CalendarEvent } from '../../../services/eventsApi';
import { EVENT_TYPE_META, isCancelledEvent, formatTimeRange, RO_LOCALE } from '../scheduleShared';

/**
 * Read-only row used by the player Day/Week/Agenda views. No management
 * actions — a plain Pressable that opens PlayerEventDetailModal via onPress.
 */
export const PlayerScheduleEventCard = React.memo(({
  item,
  isMobile,
  onPress,
}: {
  item: CalendarEvent;
  isMobile: boolean;
  onPress: () => void;
}) => {
  const eventDate = new Date(item.startTime);
  const meta = EVENT_TYPE_META[item.type];
  const cancelled = isCancelledEvent(item);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      className={`bg-[var(--c-surface)] border border-[var(--c-border)] rounded-[20px] px-4 py-4 flex-row items-center gap-4 ${cancelled ? 'opacity-60' : ''}`}
      style={{ borderLeftWidth: 3, borderLeftColor: cancelled ? 'var(--c-border-strong)' : meta.solid, minHeight: 44 }}
    >
      <View
        className={`${isMobile ? 'w-12 h-12 rounded-[14px]' : 'w-[52px] h-[52px] rounded-[16px]'} items-center justify-center border`}
        style={{ backgroundColor: meta.soft, borderColor: meta.soft }}
      >
        <Text className="text-[9px] font-black uppercase tracking-wider" style={{ color: meta.onSoft }}>
          {eventDate.toLocaleString(RO_LOCALE, { month: 'short' }).toUpperCase()}
        </Text>
        <Text className="text-[17px] font-black leading-tight" style={{ color: 'var(--c-ink-strong)' }}>{eventDate.getDate()}</Text>
      </View>

      <View className="flex-1 min-w-0">
        <View className="flex-row items-center gap-2">
          <Text numberOfLines={1} className={`text-[15px] font-black flex-1 ${cancelled ? 'line-through' : ''}`} style={{ color: 'var(--c-ink-strong)' }}>
            {item.title}
          </Text>
          {cancelled ? (
            <View className="bg-rose-50 rounded-full px-2.5 py-1 border border-rose-100">
              <Text className="text-[9px] font-black uppercase tracking-widest text-rose-500">Anulat</Text>
            </View>
          ) : (
            <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: meta.soft }}>
              <Text className="text-[9px] font-black uppercase tracking-widest" style={{ color: meta.onSoft }}>{meta.label}</Text>
            </View>
          )}
        </View>
        {/* Admin stacks the meta row only on narrow layouts; on desktop time
            and location sit inline. Mirrored here for parity. */}
        <View className={isMobile ? 'gap-1.5 mt-1.5' : 'flex-row items-center gap-4 mt-1'}>
          <View className="flex-row items-center gap-1.5">
            <Clock size={13} color="var(--c-faint)" />
            <Text className="text-[12px] font-bold" style={{ color: 'var(--c-muted)' }}>{formatTimeRange(item.startTime, item.endTime)}</Text>
          </View>
          <View className="flex-row items-center gap-1.5 flex-1 min-w-0">
            <MapPin size={13} color="var(--c-faint)" />
            <Text numberOfLines={1} className="text-[12px] font-semibold flex-1" style={{ color: 'var(--c-muted)' }}>
              {item.location || item.teamName || 'Sală principală'}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});
PlayerScheduleEventCard.displayName = 'PlayerScheduleEventCard';
