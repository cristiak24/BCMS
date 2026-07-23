import React from 'react';
import { View, Text, Modal, Pressable, TouchableOpacity, ScrollView } from '@/src/web/reactNative';
import { Calendar as CalendarIcon, X, Plus, MapPin, ChevronRight } from 'lucide-react';
import { CalendarEvent } from '../../../services/eventsApi';
import { EVENT_TYPE_META, formatEventTime, formatTimeRange, isCancelledEvent, RO_LOCALE } from '../scheduleShared';

/**
 * Day agenda shown when a calendar cell is tapped. Laid out as a time-ordered
 * timeline (time gutter + colored rail + row) rather than a stack of full
 * event cards, so a busy day stays scannable instead of turning into a wall
 * of near-identical boxes.
 */
export function DayScheduleModal({
  day,
  isMobile,
  onClose,
  onSelectEvent,
  onQuickAdd,
}: {
  day: { date: Date; events: CalendarEvent[] } | null;
  isMobile: boolean;
  isSmallPhone?: boolean;
  onClose: () => void;
  onSelectEvent: (event: CalendarEvent) => void;
  onQuickAdd: (date: Date) => void;
}) {
  const events = day?.events ?? [];
  const isToday = day ? day.date.toDateString() === new Date().toDateString() : false;

  return (
    <Modal visible={day !== null} transparent animationType="fade">
      <Pressable className="flex-1 bg-black/45 items-center justify-center p-5" onPress={onClose}>
        <View
          className="bg-white rounded-[28px] w-full overflow-hidden"
          style={{ maxWidth: 560, maxHeight: '86%', boxShadow: '0 24px 60px rgba(11,30,61,0.28)' } as any}
          onStartShouldSetResponder={() => true}
        >
          {/* Header */}
          <View className="px-6 pt-6 pb-5 border-b border-[#EEF3F9]">
            <View className="flex-row items-start justify-between gap-4">
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-[11px] font-black uppercase tracking-[0.18em] text-[#1D3E90]">
                    {day?.date.toLocaleDateString(RO_LOCALE, { weekday: 'long' })}
                  </Text>
                  {isToday && (
                    <View className="bg-[#EAF2FF] rounded-full px-2 py-[2px]">
                      <Text className="text-[9px] font-black uppercase tracking-widest text-[#1D3E90]">Azi</Text>
                    </View>
                  )}
                </View>
                <Text className="text-[#0E2041] text-[26px] font-black mt-1">
                  {day?.date.toLocaleDateString(RO_LOCALE, { month: 'long', day: 'numeric' })}
                </Text>
                <Text className="text-slate-400 font-bold text-[12px] mt-0.5">
                  {events.length === 0 ? 'Nimic programat' : `${events.length} ${events.length === 1 ? 'eveniment planificat' : 'evenimente planificate'}`}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <TouchableOpacity
                  onPress={() => day && onQuickAdd(day.date)}
                  className="h-10 rounded-full bg-[#1D3E90] px-4 flex-row items-center gap-1.5"
                  style={{ boxShadow: '0 8px 18px rgba(29,62,144,0.28)' } as any}
                  accessibilityLabel="Adaugă eveniment în această zi"
                >
                  <Plus color="#fff" size={15} />
                  <Text className="text-white text-[11px] font-black uppercase tracking-widest">Adaugă</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onClose}
                  className="w-10 h-10 rounded-full bg-[#F4F7FC] border border-[#E3EAF5] items-center justify-center"
                  accessibilityLabel="Close"
                >
                  <X color="var(--c-ink-soft)" size={18} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Timeline */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }}>
            {events.length === 0 ? (
              <View className="rounded-[22px] border border-dashed border-[#D8E4F2] bg-[#F8FAFD] px-6 py-10 items-center">
                <View className="w-12 h-12 rounded-full bg-white border border-[#E3EAF5] items-center justify-center">
                  <CalendarIcon size={22} color="var(--c-faint)" />
                </View>
                <Text className="text-[#0E2041] font-black mt-4">Niciun eveniment în această zi</Text>
                <Text className="text-slate-400 font-semibold text-[12.5px] mt-1 text-center">
                  Adaugă un antrenament, meci, cantonament sau eveniment de club.
                </Text>
                <TouchableOpacity
                  onPress={() => day && onQuickAdd(day.date)}
                  className="mt-5 bg-[#EAF1FB] border border-[#D6E4F7] rounded-full px-5 py-2.5"
                >
                  <Text className="text-[#1D3E90] text-[12px] font-black uppercase tracking-widest">+ Adaugă eveniment</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                {events.map((event, index) => {
                  const meta = EVENT_TYPE_META[event.type];
                  const cancelled = isCancelledEvent(event);
                  const isLast = index === events.length - 1;

                  return (
                    <View key={event.id} className="flex-row">
                      {/* Time gutter */}
                      <View style={{ width: 52 }} className="items-end pr-3 pt-3">
                        <Text className={`text-[12px] font-black ${cancelled ? 'text-slate-300' : 'text-[#0E2041]'}`}>
                          {formatEventTime(event.startTime)}
                        </Text>
                      </View>

                      {/* Rail */}
                      <View className="items-center" style={{ width: 18 }}>
                        <View
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            marginTop: 15,
                            backgroundColor: cancelled ? 'var(--c-border-strong)' : meta.solid,
                          }}
                        />
                        {!isLast && <View className="flex-1 w-[2px] bg-[#E8EFF8] mt-1" />}
                      </View>

                      {/* Row */}
                      <View className={`flex-1 ${isLast ? '' : 'mb-2'}`}>
                        <TouchableOpacity
                          onPress={() => onSelectEvent(event)}
                          activeOpacity={0.85}
                          className={`rounded-2xl border border-[#E7EEF7] bg-white px-4 py-3 flex-row items-center gap-3 hover:border-[#C9DBF2] ${
                            cancelled ? 'opacity-60' : ''
                          }`}
                          style={{ borderLeftWidth: 3, borderLeftColor: cancelled ? 'var(--c-border-strong)' : meta.solid }}
                        >
                          <View className="flex-1 min-w-0">
                            <View className="flex-row items-center gap-2">
                              <Text
                                numberOfLines={1}
                                className={`text-[14.5px] font-black text-[#0E2041] flex-1 ${cancelled ? 'line-through' : ''}`}
                              >
                                {event.title}
                              </Text>
                              <View className="rounded-full px-2.5 py-[3px]" style={{ backgroundColor: meta.soft }}>
                                <Text className="text-[9px] font-black uppercase tracking-widest" style={{ color: meta.onSoft }}>
                                  {meta.label}
                                </Text>
                              </View>
                            </View>
                            <View className={`${isMobile ? 'gap-1 mt-1.5' : 'flex-row items-center gap-3 mt-1.5'}`}>
                              <Text className="text-[11.5px] font-bold text-slate-500">
                                {formatTimeRange(event.startTime, event.endTime)}
                              </Text>
                              <View className="flex-row items-center gap-1 flex-1 min-w-0">
                                <MapPin size={12} color="var(--c-faint)" />
                                <Text numberOfLines={1} className="text-[11.5px] font-semibold text-slate-400 flex-1">
                                  {event.location || 'Sală principală'}
                                </Text>
                              </View>
                            </View>
                          </View>
                          <ChevronRight size={16} color="#C3D2E5" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}
