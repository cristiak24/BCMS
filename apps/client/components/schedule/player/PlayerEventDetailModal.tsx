import React from 'react';
import { View, Text, Modal, Pressable, TouchableOpacity } from '@/src/web/reactNative';
import { X, Clock, MapPin, Users, Info, MessageSquare } from 'lucide-react';
import { CalendarEvent } from '../../../services/eventsApi';
import { EVENT_TYPE_META, formatTimeRange, isCancelledEvent, RO_LOCALE } from '../scheduleShared';

/**
 * Read-only event detail sheet for player/coach surfaces (Home + Schedule).
 * Deliberately has no management actions (no duplicate/cancel/attendance
 * marking) — those stay admin-only. This is the single place a player taps
 * "Detalii" on an event, replacing what used to be dead-end buttons.
 */
export function PlayerEventDetailModal({
  event,
  isMobile,
  onClose,
}: {
  event: CalendarEvent | null;
  isMobile: boolean;
  onClose: () => void;
}) {
  const meta = event ? EVENT_TYPE_META[event.type] : null;
  const cancelled = event ? isCancelledEvent(event) : false;

  return (
    <Modal visible={event !== null} transparent animationType={isMobile ? 'slide' : 'fade'}>
      <Pressable className={`flex-1 bg-black/45 ${isMobile ? 'justify-end' : 'items-center justify-center p-5'}`} onPress={onClose}>
        <View
          className={`bg-[var(--c-surface)] w-full overflow-hidden ${isMobile ? 'rounded-t-[24px]' : 'rounded-[20px]'}`}
          style={{ maxWidth: isMobile ? undefined : 480, maxHeight: isMobile ? '86%' : '80%', boxShadow: '0 24px 60px rgba(11,30,61,0.28)' } as any}
          onStartShouldSetResponder={() => true}
        >
          {event && meta ? (
            <>
              <View className="px-6 pt-5 pb-4 border-b border-[var(--c-border)]">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2 flex-wrap">
                      <View className="rounded-full px-3 py-1" style={{ backgroundColor: meta.soft }}>
                        <Text className="text-[10px] font-black uppercase tracking-widest" style={{ color: meta.onSoft }}>{meta.label}</Text>
                      </View>
                      {cancelled ? (
                        <View className="bg-rose-50 rounded-full px-3 py-1 border border-rose-100">
                          <Text className="text-[10px] font-black uppercase tracking-widest text-rose-500">Anulat</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text className="text-[20px] font-black mt-3 leading-6" style={{ color: 'var(--c-ink-strong)' }}>{event.title}</Text>
                  </View>
                  <TouchableOpacity onPress={onClose} accessibilityLabel="Închide" style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                    <X size={20} color="var(--c-muted)" />
                  </TouchableOpacity>
                </View>
              </View>

              <View className="px-6 py-5 gap-4">
                <View className="flex-row items-center gap-3">
                  <Clock size={18} color="var(--c-muted)" />
                  <View>
                    <Text className="text-[13px] font-bold" style={{ color: 'var(--c-ink)' }}>
                      {new Date(event.startTime).toLocaleDateString(RO_LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })}
                    </Text>
                    <Text className="text-[12px] font-semibold mt-0.5" style={{ color: 'var(--c-muted)' }}>
                      {formatTimeRange(event.startTime, event.endTime)}
                    </Text>
                  </View>
                </View>

                <View className="flex-row items-center gap-3">
                  <MapPin size={18} color="var(--c-muted)" />
                  <Text className="text-[13px] font-semibold flex-1" style={{ color: 'var(--c-ink)' }}>
                    {event.location || 'Sală principală'}
                  </Text>
                </View>

                {event.teamName ? (
                  <View className="flex-row items-center gap-3">
                    <Users size={18} color="var(--c-muted)" />
                    <Text className="text-[13px] font-semibold flex-1" style={{ color: 'var(--c-ink)' }}>{event.teamName}</Text>
                  </View>
                ) : null}

                {event.description ? (
                  <View className="flex-row items-start gap-3">
                    <Info size={18} color="var(--c-muted)" />
                    <Text className="text-[13px] font-semibold flex-1 leading-5" style={{ color: 'var(--c-ink-soft)' }}>{event.description}</Text>
                  </View>
                ) : null}

                {event.coachNote ? (
                  <View
                    className="flex-row items-start gap-3 rounded-[14px] px-4 py-3.5"
                    style={{ backgroundColor: 'var(--c-surface-tint)' }}
                  >
                    <MessageSquare size={18} color="var(--c-brand-fg)" style={{ marginTop: 1 } as any} />
                    <View className="flex-1">
                      <Text className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--c-brand-fg)' }}>
                        Notă antrenor
                      </Text>
                      <Text className="text-[13px] font-semibold mt-1 leading-5" style={{ color: 'var(--c-ink-soft)' }}>
                        {event.coachNote}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>
            </>
          ) : null}
        </View>
      </Pressable>
    </Modal>
  );
}
