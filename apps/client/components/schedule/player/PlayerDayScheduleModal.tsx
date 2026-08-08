import React from 'react';
import { View, Text, Modal, Pressable, TouchableOpacity } from '@/src/web/reactNative';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { CalendarEvent } from '../../../services/eventsApi';
import { sortByStartTime, RO_LOCALE } from '../scheduleShared';
import { PlayerScheduleEventCard } from './PlayerScheduleEventCard';

/**
 * Day-agenda sheet opened by tapping a calendar cell — the player equivalent
 * of admin's DayScheduleModal, minus the quick-add affordance (players don't
 * create events). Fixes the day-tap that previously only highlighted the
 * cell with no other effect.
 */
export function PlayerDayScheduleModal({
  day,
  isMobile,
  onClose,
  onSelectEvent,
}: {
  day: { date: Date; events: CalendarEvent[] } | null;
  isMobile: boolean;
  onClose: () => void;
  onSelectEvent: (event: CalendarEvent) => void;
}) {
  const events = day ? sortByStartTime(day.events) : [];
  const isToday = day ? day.date.toDateString() === new Date().toDateString() : false;

  return (
    <Modal visible={day !== null} transparent animationType={isMobile ? 'slide' : 'fade'}>
      <Pressable className={`flex-1 bg-black/45 ${isMobile ? 'justify-end' : 'items-center justify-center p-5'}`} onPress={onClose}>
        <View
          className={`bg-[var(--c-surface)] w-full overflow-hidden ${isMobile ? 'rounded-t-[24px]' : 'rounded-[20px]'}`}
          style={{ maxWidth: isMobile ? undefined : 560, maxHeight: isMobile ? '90%' : '86%', boxShadow: '0 24px 60px rgba(11,30,61,0.28)' } as any}
          onStartShouldSetResponder={() => true}
        >
          <View className="px-6 pt-5 pb-4 border-b border-[var(--c-border)] flex-row items-start justify-between gap-4">
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <Text className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--c-brand-fg)' }}>
                  {day?.date.toLocaleDateString(RO_LOCALE, { weekday: 'long' })}
                </Text>
                {isToday ? (
                  <View className="rounded-full px-2 py-[2px]" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                    <Text className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--c-brand-fg)' }}>Azi</Text>
                  </View>
                ) : null}
              </View>
              <Text className="text-[21px] font-bold mt-0.5" style={{ color: 'var(--c-ink-strong)' }}>
                {day?.date.toLocaleDateString(RO_LOCALE, { month: 'long', day: 'numeric' })}
              </Text>
              <Text className="font-bold text-[12px] mt-0.5" style={{ color: 'var(--c-faint)' }}>
                {events.length === 0 ? 'Nimic programat' : `${events.length} ${events.length === 1 ? 'eveniment planificat' : 'evenimente planificate'}`}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Închide" style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <X size={20} color="var(--c-muted)" />
            </TouchableOpacity>
          </View>

          <View className="px-5 py-5 gap-2.5">
            {events.length === 0 ? (
              <View className="items-center py-10">
                <CalendarIcon size={28} color="var(--c-faint)" />
                <Text className="font-bold mt-3 text-center" style={{ color: 'var(--c-muted)' }}>Nicio sesiune programată în această zi.</Text>
              </View>
            ) : (
              events.map((event) => (
                <PlayerScheduleEventCard key={event.id} item={event} isMobile={isMobile} onPress={() => onSelectEvent(event)} />
              ))
            )}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}
