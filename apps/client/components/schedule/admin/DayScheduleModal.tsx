import React from 'react';
import { View, Text, Modal, Pressable, ScrollView } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { CalendarEvent } from '../../../services/eventsApi';
import { getEventTypeMeta, formatEventTime, formatTimeRange, isCancelledEvent, RO_LOCALE } from '../scheduleShared';
import { plural } from '../../../utils/plural';
import ModalBackdrop from '../../ui/ModalBackdrop';
import Button from '../../ui/Button';
import { EmptyState } from '../../ui/ScreenState';

/**
 * Day agenda shown when a calendar cell is tapped: one bordered list, a row
 * per event in time order (time, a small type dot, title, then type · hours ·
 * place). A bottom sheet on phones, a centred card from md.
 *
 * Rebuilt on the system's parts: it used to ignore Esc, drew a card per event
 * with a coloured side stripe, 9px all-caps chips and a glowing „ADAUGĂ”.
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
  /** Absent for roles that can't create events (the accountant). */
  onQuickAdd?: (date: Date) => void;
}) {
  const events = day?.events ?? [];
  const isToday = day ? day.date.toDateString() === new Date().toDateString() : false;
  const weekday = day?.date.toLocaleDateString(RO_LOCALE, { weekday: 'long' }) ?? '';
  const dateLabel = day?.date.toLocaleDateString(RO_LOCALE, { month: 'long', day: 'numeric' }) ?? '';
  const title = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${dateLabel}`;

  return (
    <Modal visible={day !== null} transparent animationType={isMobile ? 'slide' : 'fade'} onRequestClose={onClose}>
      <ModalBackdrop
        onDismiss={onClose}
        className={isMobile ? 'items-stretch justify-end' : 'items-center justify-center p-5'}
        style={{ backgroundColor: 'rgba(2, 8, 23, 0.62)' }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Programul zilei: ${title}`}
          className={`flex flex-col w-full ${isMobile ? 'max-h-[90dvh] rounded-t-[20px] pb-[env(safe-area-inset-bottom)]' : 'max-w-[560px] max-h-[86dvh] rounded-[18px]'}`}
          style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--e-lg)' }}
        >
          {/* Header */}
          <View className="flex-row items-start gap-3 px-5 md:px-6 pt-5 pb-4 border-b shrink-0" style={{ borderColor: 'var(--c-border)' }}>
            <View className="flex-1 min-w-0">
              <View className="flex-row items-center gap-2">
                <Text accessibilityRole="header" className="text-[18px] font-bold leading-snug" style={{ color: 'var(--c-ink-strong)' }}>{title}</Text>
                {isToday ? (
                  <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                    <Text className="text-[11px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Azi</Text>
                  </View>
                ) : null}
              </View>
              <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>
                {events.length === 0 ? 'Nimic programat' : plural(events.length, 'eveniment', 'evenimente')}
              </Text>
            </View>
            {onQuickAdd && events.length > 0 ? (
              <Button size="sm" variant="primary" icon="add" label="Adaugă" accessibilityLabel="Adaugă eveniment în această zi" onPress={() => day && onQuickAdd(day.date)} />
            ) : null}
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Închide"
              className="ui-press w-10 h-10 rounded-[10px] border items-center justify-center shrink-0"
              style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
            >
              <MaterialIcons name="close" size={18} color="var(--c-ink-soft)" />
            </Pressable>
          </View>

          <ScrollView className="min-h-0 flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: isMobile ? 16 : 20 }}>
            {events.length === 0 ? (
              <EmptyState
                icon="event-busy"
                title="Niciun eveniment în această zi"
                message={onQuickAdd ? 'Adaugă un antrenament, un meci, un cantonament sau un eveniment de club.' : undefined}
                actionLabel={onQuickAdd ? 'Adaugă eveniment' : undefined}
                onAction={onQuickAdd && day ? () => onQuickAdd(day.date) : undefined}
              />
            ) : (
              <View className="rounded-[14px] border overflow-hidden" style={{ borderColor: 'var(--c-border)' }}>
                {events.map((event, index) => {
                  const meta = getEventTypeMeta(event.type);
                  const cancelled = isCancelledEvent(event);
                  const details = [cancelled ? 'Anulat' : meta.label, formatTimeRange(event.startTime, event.endTime), event.location].filter(Boolean).join(' · ');
                  return (
                    <Pressable
                      key={event.id}
                      onPress={() => onSelectEvent(event)}
                      accessibilityRole="button"
                      accessibilityLabel={`${event.title}, ${details}`}
                      className="ui-press flex-row items-center gap-3 px-4 py-3 hover:bg-[var(--c-surface-2)]"
                      style={{ borderTopWidth: index === 0 ? 0 : 1, borderTopStyle: 'solid', borderColor: 'var(--c-border)', opacity: cancelled ? 0.65 : 1 } as any}
                    >
                      <Text className="t-num w-11 text-[13px] font-semibold" style={{ color: cancelled ? 'var(--c-faint)' : 'var(--c-ink)' }}>
                        {formatEventTime(event.startTime)}
                      </Text>
                      <View className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cancelled ? 'var(--c-border-strong)' : meta.solid }} />
                      <View className="flex-1 min-w-0">
                        <Text numberOfLines={1} className={`text-[14px] font-semibold ${cancelled ? 'line-through' : ''}`} style={{ color: 'var(--c-ink-strong)' }}>
                          {event.title}
                        </Text>
                        <Text numberOfLines={1} className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>{details}</Text>
                      </View>
                      <MaterialIcons name="chevron-right" size={18} color="var(--c-faint)" />
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </div>
      </ModalBackdrop>
    </Modal>
  );
}
