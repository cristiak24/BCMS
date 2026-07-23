import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Pressable, FlatList, ActivityIndicator } from '@/src/web/reactNative';
import { LinearGradient } from '@/src/web/linearGradient';
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown, Check, Clock, MapPin, Users, X,
  Dumbbell, Info, Send,
} from 'lucide-react';
import { Team } from '../../../services/teamsApi';
import { AddEventFormState } from '../../../hooks/useAddEventForm';

type SelectSheet = 'type' | 'location' | 'team';

const EVENT_TYPE_OPTIONS = [
  { value: 'training', label: 'Antrenament' },
  { value: 'match', label: 'Meci' },
  { value: 'camp', label: 'Cantonament' },
  { value: 'medical', label: 'Vizită medicală' },
  { value: 'admin', label: 'Administrativ' },
] as const;
const REPEAT_DAY_LABELS = ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D'];

const InlineSpinner = ({ color = '#FFFFFF' }: { color?: string }) => (
  <View
    className="w-7 h-7 rounded-full items-center justify-center"
    style={{ backgroundColor: color === 'var(--c-surface)' ? 'rgba(255,255,255,0.18)' : 'rgba(29,62,144,0.1)' }}
  >
    <ActivityIndicator size="small" color={color} />
  </View>
);

const FieldError = ({ message }: { message?: string }) => {
  if (!message) return null;
  return (
    <View className="mt-2 flex-row items-start rounded-2xl border border-red-100 bg-red-50 px-3 py-2">
      <Info color="var(--c-danger)" size={14} />
      <Text className="ml-2 flex-1 text-xs font-bold leading-5 text-red-700">{message}</Text>
    </View>
  );
};

const TimeSpinner = React.memo(({ value, onSelect, range }: { value: string; onSelect: (v: string) => void; range: string[] }) => {
  const listRef = React.useRef<any>(null);
  const ITEM_HEIGHT = 36;

  React.useEffect(() => {
    const idx = range.indexOf(value);
    if (idx >= 0 && listRef.current) {
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.5, animated: false });
      }, 80);
    }
  }, [value, range]);

  return (
    <View className="relative w-20 h-36 rounded-[22px] bg-slate-50 border border-slate-100 overflow-hidden">
      <View
        pointerEvents="none"
        style={{ top: 54 }}
        className="absolute left-2.5 right-2.5 h-9 rounded-2xl bg-white border border-blue-100 shadow-sm"
      />
      <FlatList
        ref={listRef}
        data={range}
        keyExtractor={(item) => item}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        style={{ height: 144 }}
        contentContainerStyle={{ paddingVertical: 54 }}
        getItemLayout={(_: any, index: number) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
        onScrollToIndexFailed={(info: any) => {
          listRef.current?.scrollToOffset({ offset: info.index * ITEM_HEIGHT, animated: false });
        }}
        renderItem={({ item }: { item: string }) => {
          const isSelected = item === value;
          return (
            <TouchableOpacity
              onPress={() => onSelect(item)}
              activeOpacity={0.75}
              style={{ height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: isSelected ? 25 : 17, lineHeight: isSelected ? 29 : 21, fontWeight: '900', color: isSelected ? 'var(--c-brand-fg)' : 'var(--c-border-strong)' }}>
                {item}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
      <LinearGradient pointerEvents="none" colors={['var(--c-surface-2)', 'rgba(248,250,252,0)']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 44 }} />
      <LinearGradient pointerEvents="none" colors={['rgba(248,250,252,0)', 'var(--c-surface-2)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 44 }} />
    </View>
  );
});
TimeSpinner.displayName = 'TimeSpinner';

const daysInMonth = (m: number, y: number) => new Date(y, m + 1, 0).getDate();

export function AddEventModal({
  visible,
  onClose,
  form,
  teams,
  isMobile,
  currentDate,
  onNavigateMonth,
}: {
  visible: boolean;
  onClose: () => void;
  form: AddEventFormState;
  teams: Team[];
  isMobile: boolean;
  currentDate: Date;
  onNavigateMonth: (deltaMonths: number) => void;
}) {
  const [showDatePicker, setShowDatePicker] = useState<'start' | 'end' | null>(null);
  const [showTimePicker, setShowTimePicker] = useState<'start' | 'end' | null>(null);
  const [selectSheet, setSelectSheet] = useState<SelectSheet | null>(null);

  const {
    newEventType, setNewEventType, newTitle, setNewTitle, newDescription, setNewDescription,
    newStartTime, newEndTime, newLocation, setNewLocation, newTeamId, setNewTeamId, newAmount, setNewAmount,
    addEventErrors, clearError, newStartDate, setNewStartDate, newEndDate, setNewEndDate,
    isRecurring, setIsRecurring, recurringDays, setRecurringDays, recurringWeeks, setRecurringWeeks,
    recentLocations, addingEvent, handleTimeInputChange, handleTimeInputBlur, updatePickerTime, submit,
  } = form;

  if (!visible) return null;

  const handleSubmit = async () => {
    const ok = await submit();
    if (ok) onClose();
  };

  const monthName = currentDate.toLocaleString('ro-RO', { month: 'long' });
  const viewYear = currentDate.getFullYear();
  const selectedTeam = teams.find((team) => team.id === newTeamId);
  const selectedEventTypeLabel = EVENT_TYPE_OPTIONS.find((option) => option.value === newEventType)?.label ?? 'Antrenament';
  const locationOptions = Array.from(
    new Set([newLocation.trim(), ...recentLocations, 'Sală principală', 'Sala Polivalenta', 'Teren de antrenament'].filter(Boolean))
  );
  const formattedStartDate = newStartDate.toLocaleDateString('ro-RO', { month: 'short', day: 'numeric', year: 'numeric' });
  const formattedEndDate = newEndDate.toLocaleDateString('ro-RO', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <>
      <Modal visible={visible} transparent animationType="slide">
        <View className={`flex-1 bg-black/40 ${isMobile ? 'justify-end' : 'justify-center items-center'} ${isMobile ? '' : 'p-8'}`}>
          <View
            className={`bg-[#F4F7FC] shadow-2xl overflow-hidden ${isMobile ? 'rounded-t-[36px] max-h-[94%] w-full' : 'rounded-[36px] max-h-[92%] w-full'}`}
            style={isMobile ? undefined : { maxWidth: 1180 }}
          >
            <View className={`${isMobile ? 'px-5 pt-5 pb-3' : 'px-10 pt-8 pb-5'} border-b border-white/80`}>
              <View className="flex-row justify-between items-start gap-4">
                <View className="flex-1">
                  <Text className="text-[12px] font-bold text-slate-400 mb-2">
                    Program <Text className="text-slate-300">›</Text> <Text className="text-[#1D3E90]">Eveniment nou ({selectedEventTypeLabel.toLowerCase()})</Text>
                  </Text>
                  <Text className={`${isMobile ? 'text-3xl' : 'text-5xl'} font-black text-[#12309A]`}>Programează eveniment</Text>
                  <Text className={`${isMobile ? 'text-sm' : 'text-lg'} text-slate-500 font-medium mt-2`}>
                    Creează un antrenament, meci, cantonament sau eveniment intern de club.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => { if (!addingEvent) onClose(); }}
                  disabled={addingEvent}
                  className={`w-12 h-12 bg-white rounded-2xl items-center justify-center border border-slate-100 shadow-sm ${addingEvent ? 'opacity-60' : ''}`}
                >
                  <X color="var(--c-ink-soft)" size={22} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: isMobile ? 20 : 40, paddingTop: 24, paddingBottom: 28 }}>
              <View className={`${isMobile ? 'gap-6' : 'flex-row gap-8'}`}>
                <View style={isMobile ? undefined : { width: 360 }} className="gap-5">
                  <LinearGradient
                    colors={['#111C3F', 'var(--c-brand-fg)', 'var(--c-sky)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ borderRadius: 32, overflow: 'hidden', borderWidth: 4, borderColor: 'var(--c-border)', shadowColor: 'var(--c-brand-fg)', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.22, shadowRadius: 28, elevation: 10 }}
                  >
                    <View style={{ height: isMobile ? 256 : 420 }} className="relative p-7 justify-between">
                      <View className="flex-row justify-between items-start">
                        <View className="w-14 h-14 rounded-2xl bg-white/15 border border-white/20 items-center justify-center">
                          <Dumbbell color="#FFFFFF" size={24} />
                        </View>
                        <View className="bg-white/15 border border-white/20 px-4 py-2 rounded-full">
                          <Text className="text-white font-black text-[10px] uppercase tracking-widest">{selectedEventTypeLabel}</Text>
                        </View>
                      </View>

                      <View className="absolute left-8 right-8 top-28 bottom-24 border border-white/20 rounded-[28px]" />
                      <View style={{ left: '45%', top: 128 }} className="absolute w-16 h-16 rounded-full border border-white/20" />
                      <View style={{ top: '52%' }} className="absolute left-8 right-8 h-px bg-white/20" />

                      <View>
                        <Text className={`${isMobile ? 'text-2xl' : 'text-3xl'} font-black text-white mb-3`}>
                          {newTitle.trim() || 'Previzualizare eveniment'}
                        </Text>
                        <Text className="text-blue-100 font-semibold leading-6">
                          {selectedTeam ? selectedTeam.name : 'Alege o echipă'} · {newLocation.trim() || 'Alege locația'}
                        </Text>
                        {newDescription.trim() ? (
                          <Text className="text-blue-100 font-medium leading-5 mt-3" numberOfLines={2}>
                            {newDescription.trim()}
                          </Text>
                        ) : null}
                        <View className="flex-row flex-wrap gap-2 mt-5">
                          <View className="bg-white/15 border border-white/20 px-3 py-2 rounded-full flex-row items-center">
                            <CalendarIcon color="var(--c-tint-fg)" size={14} />
                            <Text className="text-white font-bold text-[11px] ml-2">{formattedStartDate}</Text>
                          </View>
                          <View className="bg-white/15 border border-white/20 px-3 py-2 rounded-full flex-row items-center">
                            <Clock color="var(--c-tint-fg)" size={14} />
                            <Text className="text-white font-bold text-[11px] ml-2">{newStartTime} - {newEndTime}</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  </LinearGradient>

                  <View className="bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm">
                    <View className="flex-row items-center mb-4">
                      <Info color="var(--c-brand-fg)" size={17} />
                      <Text className="text-[#1D3E90] font-black text-base ml-2">Sfaturi de programare</Text>
                    </View>
                    <View className="gap-3">
                      <View className="flex-row">
                        <Text className="text-[#38BAF8] font-black mr-3">•</Text>
                        <Text className="flex-1 text-slate-500 font-medium leading-5">Orele de vârf pentru sală sunt de obicei după-amiaza târziu și seara devreme.</Text>
                      </View>
                      <View className="flex-row">
                        <Text className="text-[#38BAF8] font-black mr-3">•</Text>
                        <Text className="flex-1 text-slate-500 font-medium leading-5">Antrenamentele recurente creează câte o sesiune pentru fiecare zi selectată.</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View className="flex-1 gap-6">
                  <View className="bg-white rounded-[32px] p-6 border border-white shadow-sm">
                    <Text className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">Tip eveniment</Text>
                    <TouchableOpacity
                      onPress={() => setSelectSheet('type')}
                      activeOpacity={0.82}
                      className="bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 mb-6 flex-row items-center justify-between shadow-sm"
                    >
                      <View className="flex-row items-center">
                        <View className="w-9 h-9 rounded-xl bg-blue-50 items-center justify-center mr-3">
                          <Dumbbell size={17} color="var(--c-brand-fg)" />
                        </View>
                        <View>
                          <Text className="font-black text-slate-800">{selectedEventTypeLabel}</Text>
                          <Text className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Categorie eveniment</Text>
                        </View>
                      </View>
                      <ChevronDown size={18} color="var(--c-faint)" />
                    </TouchableOpacity>

                    <Text className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Titlu eveniment *</Text>
                    <TextInput
                      className={`bg-white border rounded-2xl px-5 py-4 font-bold text-slate-800 text-base shadow-sm ${addEventErrors.title ? 'border-red-300 bg-red-50/40' : 'border-slate-100'}`}
                      placeholder="ex. Antrenament aruncări U16"
                      placeholderTextColor="var(--c-faint)"
                      value={newTitle}
                      onChangeText={(value: string) => { setNewTitle(value); clearError('title'); }}
                    />
                    <FieldError message={addEventErrors.title} />

                    <Text className="text-[11px] font-black text-slate-400 uppercase tracking-widest mt-5 mb-3">Descriere <Text className="text-slate-300 normal-case">(opțional)</Text></Text>
                    <TextInput
                      className={`bg-white border rounded-2xl px-5 py-4 font-bold text-slate-800 text-base shadow-sm min-h-[118px] ${addEventErrors.description ? 'border-red-300 bg-red-50/40' : 'border-slate-100'}`}
                      placeholder="Adaugă obiective, logistică, echipament sau detalii de prezentare."
                      placeholderTextColor="var(--c-faint)"
                      value={newDescription}
                      onChangeText={(value: string) => { setNewDescription(value); clearError('description'); }}
                      multiline
                      textAlignVertical="top"
                    />
                    <FieldError message={addEventErrors.description} />

                    <View className={`${isMobile ? 'gap-5' : 'flex-row gap-5'} mt-5`}>
                      <View className="flex-1">
                        <Text className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Locație sau link *</Text>
                        <View className={`bg-white border rounded-2xl px-5 py-3 flex-row items-center shadow-sm ${addEventErrors.location ? 'border-red-300 bg-red-50/40' : 'border-slate-100'}`}>
                          <TextInput
                            className="flex-1 font-bold text-slate-800 text-base"
                            placeholder="Sală principală sau https://meet..."
                            placeholderTextColor="var(--c-faint)"
                            value={newLocation}
                            onChangeText={(value: string) => { setNewLocation(value); clearError('location'); }}
                          />
                          <TouchableOpacity onPress={() => setSelectSheet('location')} className="w-9 h-9 rounded-xl bg-slate-50 items-center justify-center ml-3" activeOpacity={0.82}>
                            <ChevronDown size={18} color="var(--c-faint)" />
                          </TouchableOpacity>
                        </View>
                        <FieldError message={addEventErrors.location} />
                      </View>

                      <View className="flex-1">
                        <Text className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Echipă *</Text>
                        <TouchableOpacity
                          onPress={() => setSelectSheet('team')}
                          activeOpacity={0.82}
                          className={`bg-white border rounded-2xl px-5 py-4 flex-row items-center justify-between shadow-sm ${addEventErrors.team ? 'border-red-300 bg-red-50/40' : 'border-slate-100'}`}
                        >
                          <View className="flex-row items-center flex-1">
                            <View className="w-9 h-9 rounded-xl bg-blue-50 items-center justify-center mr-3">
                              <Users size={17} color="var(--c-brand-fg)" />
                            </View>
                            <View className="flex-1">
                              <Text numberOfLines={1} className={`font-black ${selectedTeam ? 'text-slate-800' : 'text-slate-400'}`}>
                                {selectedTeam ? selectedTeam.name : 'Alege echipa'}
                              </Text>
                              <Text className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{teams.length} disponibile</Text>
                            </View>
                          </View>
                          <ChevronDown size={18} color="var(--c-faint)" />
                        </TouchableOpacity>
                        <FieldError message={addEventErrors.team} />
                      </View>
                    </View>
                  </View>

                  <View className="bg-white rounded-[32px] p-6 border border-white shadow-sm">
                    <View className="flex-row items-center justify-between mb-7">
                      <Text className="text-xl font-black text-[#1D3E90]">Oră și frecvență</Text>
                      {newEventType === 'training' && (
                        <TouchableOpacity
                          onPress={() => { setIsRecurring((r) => !r); clearError('recurringDays'); }}
                          className={`h-9 rounded-full flex-row items-center px-2 ${isRecurring ? 'bg-blue-50' : 'bg-slate-100'}`}
                        >
                          <Text className={`text-[11px] font-black mr-2 ${isRecurring ? 'text-[#1D3E90]' : 'text-slate-500'}`}>Recurent</Text>
                          <View className={`w-11 h-6 rounded-full px-1 flex-row items-center ${isRecurring ? 'bg-[#38BAF8] justify-end' : 'bg-slate-300 justify-start'}`}>
                            <View className="w-4 h-4 rounded-full bg-white shadow-sm" />
                          </View>
                        </TouchableOpacity>
                      )}
                    </View>

                    <View className={`${isMobile ? 'gap-5' : 'flex-row gap-5'} mb-5`}>
                      <TouchableOpacity onPress={() => setShowDatePicker('start')} className="flex-1">
                        <Text className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Data de început *</Text>
                        <View className="bg-white border border-slate-100 rounded-2xl px-5 py-4 flex-row items-center justify-between shadow-sm">
                          <Text className="font-bold text-slate-800">{formattedStartDate}</Text>
                          <CalendarIcon size={18} color="var(--c-ink-strong)" />
                        </View>
                      </TouchableOpacity>

                      {newEventType !== 'training' && (
                        <TouchableOpacity onPress={() => setShowDatePicker('end')} className="flex-1">
                          <Text className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Data de sfârșit *</Text>
                          <View className="bg-white border border-slate-100 rounded-2xl px-5 py-4 flex-row items-center justify-between shadow-sm">
                            <Text className="font-bold text-slate-800">{formattedEndDate}</Text>
                            <CalendarIcon size={18} color="var(--c-ink-strong)" />
                          </View>
                        </TouchableOpacity>
                      )}
                    </View>

                    <View className={`${isMobile ? 'gap-5' : 'flex-row gap-5'} mb-6`}>
                      <View className="flex-1">
                        <Text className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Ora de început *</Text>
                        <View className={`bg-white border rounded-2xl px-5 py-4 flex-row items-center justify-between shadow-sm ${addEventErrors.startTime ? 'border-red-300 bg-red-50/40' : 'border-slate-100'}`}>
                          <TextInput
                            value={newStartTime}
                            onChangeText={(value: string) => handleTimeInputChange('start', value)}
                            onBlur={() => handleTimeInputBlur('start')}
                            keyboardType="number-pad"
                            maxLength={5}
                            placeholder="09:00"
                            placeholderTextColor="var(--c-faint)"
                            className="flex-1 font-bold text-slate-800"
                          />
                          <TouchableOpacity onPress={() => setShowTimePicker('start')} className="w-9 h-9 rounded-xl bg-slate-50 items-center justify-center ml-3" activeOpacity={0.82}>
                            <Clock size={18} color="var(--c-ink-strong)" />
                          </TouchableOpacity>
                        </View>
                        <FieldError message={addEventErrors.startTime} />
                      </View>

                      <View className="flex-1">
                        <Text className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Ora de sfârșit *</Text>
                        <View className={`bg-white border rounded-2xl px-5 py-4 flex-row items-center justify-between shadow-sm ${addEventErrors.endTime ? 'border-red-300 bg-red-50/40' : 'border-slate-100'}`}>
                          <TextInput
                            value={newEndTime}
                            onChangeText={(value: string) => handleTimeInputChange('end', value)}
                            onBlur={() => handleTimeInputBlur('end')}
                            keyboardType="number-pad"
                            maxLength={5}
                            placeholder="10:00"
                            placeholderTextColor="var(--c-faint)"
                            className="flex-1 font-bold text-slate-800"
                          />
                          <TouchableOpacity onPress={() => setShowTimePicker('end')} className="w-9 h-9 rounded-xl bg-slate-50 items-center justify-center ml-3" activeOpacity={0.82}>
                            <Clock size={18} color="var(--c-ink-strong)" />
                          </TouchableOpacity>
                        </View>
                        <FieldError message={addEventErrors.endTime} />
                      </View>
                    </View>

                    {newEventType === 'training' && isRecurring && (
                      <View>
                        <Text className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Repetă în zilele</Text>
                        <View className="flex-row flex-wrap gap-3 mb-5">
                          {REPEAT_DAY_LABELS.map((day, i) => (
                            <TouchableOpacity
                              key={`${day}-${i}`}
                              onPress={() => setRecurringDays((prev) => (prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i]))}
                              onPressIn={() => clearError('recurringDays')}
                              className={`w-12 h-12 rounded-full items-center justify-center border ${recurringDays.includes(i) ? 'bg-[#38BAF8] border-[#38BAF8] shadow-sm' : 'bg-slate-50 border-slate-200'}`}
                            >
                              <Text className={`font-black text-[12px] ${recurringDays.includes(i) ? 'text-white' : 'text-slate-500'}`}>{day}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <FieldError message={addEventErrors.recurringDays} />

                        <Text className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Repetă timp de</Text>
                        <View className="flex-row flex-wrap gap-2">
                          {[2, 4, 6, 8, 12].map((w) => (
                            <TouchableOpacity
                              key={w}
                              onPress={() => setRecurringWeeks(w)}
                              className={`px-4 py-3 rounded-2xl border ${recurringWeeks === w ? 'bg-[#1D3E90] border-[#1D3E90]' : 'bg-slate-50 border-slate-100'}`}
                            >
                              <Text className={`font-black text-[11px] ${recurringWeeks === w ? 'text-white' : 'text-slate-500'}`}>{w} săptămâni</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>

                  {newEventType === 'camp' && (
                    <View className="bg-white rounded-[32px] p-6 border border-white shadow-sm">
                      <Text className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Taxă de înscriere (€)</Text>
                      <TextInput
                        className="bg-white border border-slate-100 rounded-2xl px-5 py-4 font-bold text-slate-800 shadow-sm"
                        placeholder="0.00"
                        placeholderTextColor="var(--c-faint)"
                        keyboardType="numeric"
                        value={newAmount}
                        onChangeText={setNewAmount}
                      />
                    </View>
                  )}
                </View>
              </View>
            </ScrollView>

            <View className={`${isMobile ? 'px-5 py-4 gap-3' : 'px-10 py-6 flex-row justify-end items-center gap-5'} bg-[#F4F7FC] border-t border-white/80`}>
              <TouchableOpacity
                onPress={() => { if (!addingEvent) onClose(); }}
                disabled={addingEvent}
                className={`${isMobile ? 'h-12 items-center justify-center' : 'px-6 py-4'} ${addingEvent ? 'opacity-60' : ''}`}
              >
                <Text className="text-slate-500 font-black text-sm">Anulează</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={addingEvent}
                className={`bg-[#1D3E90] h-14 rounded-[28px] items-center justify-center shadow-xl shadow-blue-900/30 ${isMobile ? 'w-full' : 'px-9 min-w-[240px]'} ${addingEvent ? 'opacity-80' : ''}`}
              >
                {addingEvent ? (
                  <View className="flex-row items-center gap-3">
                    <InlineSpinner />
                    <Text className="text-white font-black text-base">Se publică...</Text>
                  </View>
                ) : (
                  <View className="flex-row items-center">
                    <Send color="#FFFFFF" size={18} />
                    <Text className="text-white font-black text-base ml-3">Publică evenimentul</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Date Picker Modal */}
      <Modal visible={showDatePicker !== null} transparent animationType="fade">
        <Pressable className="flex-1 bg-black/45 items-center justify-center p-5" onPress={() => setShowDatePicker(null)}>
          <View className="bg-white rounded-[34px] p-6 shadow-2xl border border-slate-100 w-full" style={{ maxWidth: 560 }} onStartShouldSetResponder={() => true}>
            <View className="flex-row justify-between items-start mb-5">
              <View>
                <Text className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  {showDatePicker === 'start' ? 'Data de început' : 'Data de sfârșit'}
                </Text>
                <Text className="text-2xl font-black text-[#1E293B]">Alege data</Text>
              </View>
              <View className="flex-row gap-2">
                <TouchableOpacity onPress={() => onNavigateMonth(-1)} className="p-3 bg-slate-50 rounded-xl">
                  <ChevronLeft size={20} color="var(--c-brand-fg)" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onNavigateMonth(1)} className="p-3 bg-slate-50 rounded-xl">
                  <ChevronRight size={20} color="var(--c-brand-fg)" />
                </TouchableOpacity>
              </View>
            </View>

            <Text className="text-[12px] font-black text-slate-400 uppercase tracking-widest mb-4 ml-1">{monthName} {viewYear}</Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 280 }}>
              <View className="flex-row flex-wrap gap-2.5">
                {Array.from({ length: daysInMonth(currentDate.getMonth(), viewYear) }, (_, i) => i + 1).map((d) => {
                  const date = new Date(viewYear, currentDate.getMonth(), d);
                  const activeDate = showDatePicker === 'start' ? newStartDate : newEndDate;
                  const isSelected = activeDate.getDate() === d && activeDate.getMonth() === currentDate.getMonth();
                  return (
                    <TouchableOpacity
                      key={d}
                      onPress={() => {
                        if (showDatePicker === 'start') setNewStartDate(date);
                        else setNewEndDate(date);
                        setShowDatePicker(null);
                      }}
                      className={`w-11 h-11 rounded-xl items-center justify-center border ${isSelected ? 'bg-[#1D3E90] border-[#1D3E90]' : 'bg-slate-50 border-slate-100'}`}
                    >
                      <Text className={`font-bold ${isSelected ? 'text-white' : 'text-slate-600'}`}>{d}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Time Picker Modal */}
      <Modal visible={showTimePicker !== null} transparent animationType="fade">
        <Pressable className="flex-1 bg-black/35 items-center justify-center p-5" onPress={() => setShowTimePicker(null)}>
          <View className="bg-white rounded-[30px] px-5 pt-5 pb-5 shadow-2xl border border-slate-100 w-full" style={{ maxWidth: 360 }} onStartShouldSetResponder={() => true}>
            <View className="flex-row items-center justify-between mb-4">
              <View>
                <Text className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                  {showTimePicker === 'start' ? 'Ora de început' : 'Ora de sfârșit'}
                </Text>
                <Text className="text-xl font-black text-[#1E293B]">Alege ora</Text>
              </View>
              <View className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-2">
                <Text className="text-[#1D3E90] font-black text-lg">{(showTimePicker === 'start' ? newStartTime : newEndTime) || '09:00'}</Text>
              </View>
            </View>

            <View className="items-center">
              <View className="flex-row justify-center items-center">
                <View className="items-center">
                  <Text className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Oră</Text>
                  <TimeSpinner
                    value={((showTimePicker === 'start' ? newStartTime : newEndTime) || '09:00').split(':')[0]}
                    range={Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'))}
                    onSelect={(h) => {
                      const m = ((showTimePicker === 'start' ? newStartTime : newEndTime) || '09:00').split(':')[1];
                      const val = `${h}:${m}`;
                      if (showTimePicker) updatePickerTime(showTimePicker, val);
                    }}
                  />
                </View>

                <View className="mx-3 mt-7 w-9 h-9 rounded-2xl bg-[#1D3E90] items-center justify-center shadow-lg shadow-blue-900/30">
                  <Text className="text-white text-xl font-black">:</Text>
                </View>

                <View className="items-center">
                  <Text className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Minut</Text>
                  <TimeSpinner
                    value={((showTimePicker === 'start' ? newStartTime : newEndTime) || '00:00').split(':')[1]}
                    range={Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'))}
                    onSelect={(m) => {
                      const h = ((showTimePicker === 'start' ? newStartTime : newEndTime) || '00').split(':')[0];
                      const val = `${h.padStart(2, '0')}:${m}`;
                      if (showTimePicker) updatePickerTime(showTimePicker, val);
                    }}
                  />
                </View>
              </View>
            </View>

            <View className="flex-row justify-end items-center gap-3 mt-5">
              <TouchableOpacity onPress={() => setShowTimePicker(null)} className="px-5 h-12 items-center justify-center">
                <Text className="text-slate-500 font-black">Anulează</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowTimePicker(null)} className="bg-[#1D3E90] h-12 rounded-2xl px-7 items-center justify-center shadow-xl shadow-blue-900/30">
                <Text className="text-white font-black">Confirmă</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Type / Location / Team select sheets */}
      <Modal visible={selectSheet !== null} transparent animationType="fade">
        <Pressable className="flex-1 bg-black/45 items-center justify-center p-5" onPress={() => setSelectSheet(null)}>
          <View
            className={`bg-white rounded-[32px] ${isMobile ? 'px-5 pt-5 pb-6' : 'px-6 pt-5 pb-6'} shadow-2xl border border-slate-100 w-full`}
            style={{ maxWidth: selectSheet === 'team' ? 560 : 480, maxHeight: '78%' }}
            onStartShouldSetResponder={() => true}
          >
            <View className="flex-row items-center justify-between mb-5">
              <View>
                <Text className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  {selectSheet === 'type' ? 'Categorie eveniment' : selectSheet === 'location' ? 'Locație presetată' : 'Echipă'}
                </Text>
                <Text className="text-2xl font-black text-[#1E293B]">
                  {selectSheet === 'type' ? 'Alege tipul' : selectSheet === 'location' ? 'Alege locația' : 'Alege echipa'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectSheet(null)} className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-100 items-center justify-center">
                <X color="var(--c-ink-soft)" size={20} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }}>
              {selectSheet === 'type' && (
                <View className="gap-3">
                  {EVENT_TYPE_OPTIONS.map((option) => {
                    const selected = newEventType === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        onPress={() => {
                          setNewEventType(option.value);
                          if (option.value !== 'training') clearError('recurringDays');
                          setSelectSheet(null);
                        }}
                        className={`rounded-2xl border p-3 flex-row items-center justify-between ${selected ? 'bg-blue-50 border-blue-100' : 'bg-white border-slate-100'}`}
                      >
                        <View className="flex-row items-center">
                          <View className={`w-10 h-10 rounded-2xl items-center justify-center mr-3 ${selected ? 'bg-[#1D3E90]' : 'bg-slate-50'}`}>
                            <Dumbbell size={18} color={selected ? '#FFFFFF' : 'var(--c-faint)'} />
                          </View>
                          <Text className={`font-black text-base ${selected ? 'text-[#1D3E90]' : 'text-slate-700'}`}>{option.label}</Text>
                        </View>
                        {selected && <Check color="var(--c-brand-fg)" size={20} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {selectSheet === 'location' && (
                <View className="gap-3">
                  {locationOptions.map((location) => {
                    const selected = newLocation.trim() === location;
                    return (
                      <TouchableOpacity
                        key={location}
                        onPress={() => { setNewLocation(location); clearError('location'); setSelectSheet(null); }}
                        className={`rounded-2xl border p-3 flex-row items-center justify-between ${selected ? 'bg-blue-50 border-blue-100' : 'bg-white border-slate-100'}`}
                      >
                        <View className="flex-row items-center flex-1">
                          <View className={`w-10 h-10 rounded-2xl items-center justify-center mr-3 ${selected ? 'bg-[#1D3E90]' : 'bg-slate-50'}`}>
                            <MapPin size={18} color={selected ? '#FFFFFF' : 'var(--c-faint)'} />
                          </View>
                          <Text numberOfLines={1} className={`font-black text-base flex-1 ${selected ? 'text-[#1D3E90]' : 'text-slate-700'}`}>{location}</Text>
                        </View>
                        {selected && <Check color="var(--c-brand-fg)" size={20} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {selectSheet === 'team' && (
                <View className="gap-3">
                  {teams.length === 0 ? (
                    <View className="rounded-3xl border border-slate-100 bg-slate-50 p-6 items-center">
                      <Users color="var(--c-faint)" size={24} />
                      <Text className="font-black text-slate-500 mt-3">Nicio echipă încărcată</Text>
                    </View>
                  ) : (
                    teams.map((team) => {
                      const selected = newTeamId === team.id;
                      return (
                        <TouchableOpacity
                          key={team.id}
                          onPress={() => { setNewTeamId(team.id); clearError('team'); setSelectSheet(null); }}
                          className={`rounded-2xl border p-3 flex-row items-center justify-between ${selected ? 'bg-blue-50 border-blue-100' : 'bg-white border-slate-100'}`}
                        >
                          <View className="flex-row items-center flex-1">
                            <View className={`w-10 h-10 rounded-2xl items-center justify-center mr-3 ${selected ? 'bg-[#1D3E90]' : 'bg-slate-50'}`}>
                              <Users size={18} color={selected ? '#FFFFFF' : 'var(--c-faint)'} />
                            </View>
                            <Text numberOfLines={1} className={`font-black text-base flex-1 ${selected ? 'text-[#1D3E90]' : 'text-slate-700'}`}>{team.name}</Text>
                          </View>
                          {selected && <Check color="var(--c-brand-fg)" size={20} />}
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
