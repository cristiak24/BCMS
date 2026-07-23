import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, Pressable, Switch, ScrollView, ActivityIndicator, Platform } from '@/src/web/reactNative';
import { X, Calendar as CalendarIcon, MapPin, Users, CheckSquare } from 'lucide-react';
import { teamsApi, Team, Player } from '../../../services/teamsApi';
import DateTimePicker from '@/src/web/dateTimePicker';

interface AddAppointmentModalProps {
  visible: boolean;
  onClose: () => void;
  preSelectedPlayerIds?: number[];
}

export default function AddAppointmentModal({ visible, onClose, preSelectedPlayerIds = [] }: AddAppointmentModalProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);

  const [selectedTeamIds, setSelectedTeamIds] = useState<number[]>([]);
  const [date, setDate] = useState(''); // DD-MM-YYYY
  const [location, setLocation] = useState('');
  const [isSpecificPlayers, setIsSpecificPlayers] = useState(preSelectedPlayerIds.length > 0);
  const [selectedPlayers, setSelectedPlayers] = useState<number[]>(preSelectedPlayerIds);
  
  const [showPicker, setShowPicker] = useState(false);
  const [pickerDate, setPickerDate] = useState(new Date());

  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  useEffect(() => {
    if (visible) {
      loadTeams();
      if (preSelectedPlayerIds.length > 0) {
        setIsSpecificPlayers(true);
        setSelectedPlayers(preSelectedPlayerIds);
      } else {
        setIsSpecificPlayers(false);
        setSelectedPlayers([]);
        setSelectedTeamIds([]);
      }
      setDate('');
      setLocation('');
    }
  }, [visible, preSelectedPlayerIds]);

  useEffect(() => {
    const fetchMultiPlayers = async () => {
      if (selectedTeamIds.length === 0) {
         setPlayers([]);
         return;
      }
      setLoadingPlayers(true);
      try {
        const allArrays = await Promise.all(selectedTeamIds.map(tId => teamsApi.getTeamPlayers(tId)));
        const flatPlayers = allArrays.flat();
        const uniquePlayers = Array.from(new Map(flatPlayers.map(p => [p.id, p])).values());
        setPlayers(uniquePlayers);
      } catch(e) { console.error(e); }
      finally { setLoadingPlayers(false); }
    };

    fetchMultiPlayers();
  }, [selectedTeamIds]);

  const loadTeams = async () => {
    setLoadingTeams(true);
    try {
        const data = await teamsApi.getTeams();
        setTeams(data);
    } catch(e) { console.error(e); }
    finally { setLoadingTeams(false); }
  };

  const handleDateChange = (text: string) => {
    let cleaned = text.replace(/\D/g, '');
    if (cleaned.length > 2) cleaned = cleaned.slice(0, 2) + '-' + cleaned.slice(2);
    if (cleaned.length > 5) cleaned = cleaned.slice(0, 5) + '-' + cleaned.slice(5, 9);
    setDate(cleaned);
  };

  const onPickerChange = (event: any, selectedDate?: Date) => {
    setShowPicker(false);
    if (selectedDate) {
        setPickerDate(selectedDate);
        const d = String(selectedDate.getDate()).padStart(2, '0');
        const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const y = selectedDate.getFullYear();
        setDate(`${d}-${m}-${y}`);
    }
  };

  const handleSubmit = () => {
    onClose();
  };

  const toggleTeam = (id: number) => {
    setSelectedTeamIds(prev => 
       prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const togglePlayer = (id: number) => {
    setSelectedPlayers(prev => 
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  const handleSelectAllPlayers = () => {
      if (selectedPlayers.length === players.length && players.length > 0) {
          setSelectedPlayers([]);
      } else {
          setSelectedPlayers(players.map(p => p.id));
      }
  };

  const allSelected = players.length > 0 && selectedPlayers.length === players.length;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View className="flex-1 bg-[#0E2041]/60 justify-center items-center p-4">
        <View className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden">
          
          {/* Header */}
          <View className="p-6 border-b border-gray-100 flex-row justify-between items-center bg-gray-50/50">
             <View>
                <Text className="text-xl font-black text-[#0D2040] mb-1">Schedule Appointment</Text>
                <Text className="text-xs font-bold text-gray-500">Programare vizite medicale (Multi-Echipe)</Text>
             </View>
             <Pressable onPress={onClose} className="w-10 h-10 bg-white border border-gray-200 rounded-full items-center justify-center hover:bg-gray-50 transition-colors">
               <X size={20} color="var(--c-muted)" />
             </Pressable>
          </View>

          {/* Body */}
          <ScrollView className="p-6 max-h-[70vh]" showsVerticalScrollIndicator={false}>
            <View className="space-y-6">
              
              {/* Team Select (Multi-select) */}
              <View>
                <Text className="text-[10px] font-black tracking-widest text-[#1D3E90] uppercase mb-2 ml-1">Alege Echipe</Text>
                <View className="border border-gray-200 bg-white rounded-2xl overflow-hidden min-h-[60px]">
                   {loadingTeams ? (
                       <ActivityIndicator size="small" color="var(--c-brand-fg)" className="m-4" />
                   ) : (
                       <View className="flex-row flex-wrap p-2 gap-2">
                           {teams.map(t => {
                               const isSelected = selectedTeamIds.includes(t.id);
                               return (
                                 <Pressable key={t.id} onPress={() => toggleTeam(t.id)} className={`px-3 py-2 rounded-[14px] flex-row items-center border ${isSelected ? 'bg-[#1D3E90] border-[#1D3E90]' : 'bg-gray-50 border-gray-200'}`}>
                                     <Users size={12} color={isSelected ? '#ffffff' : 'var(--c-faint)'} />
                                     <Text className={`text-[12px] ml-2 font-bold ${isSelected ? 'text-white' : 'text-[#0D2040]'}`}>{t.name}</Text>
                                 </Pressable>
                               );
                           })}
                       </View>
                   )}
                </View>
              </View>

              {/* Date & Location Grid */}
              <View className="flex-row gap-4">
                <View className="flex-1">
                  <Text className="text-[10px] font-black tracking-widest text-[#1D3E90] uppercase mb-2 ml-1">Dată (DD-MM-YYYY)</Text>
                  <Pressable 
                    onPress={() => { if (Platform.OS !== 'web') setShowPicker(true); }}
                    className="flex-row items-center border border-gray-200 bg-gray-50 rounded-2xl px-4 h-14 focus-within:border-[#1D3E90]"
                  >
                     <CalendarIcon size={18} color="var(--c-faint)" />
                     <TextInput 
                       placeholder="DD-MM-YYYY" 
                       className="flex-1 ml-3 text-[14px] font-bold text-[#0E2041] outline-none"
                       placeholderTextColor="var(--c-faint)"
                       value={date} 
                       onChangeText={handleDateChange}
                       editable={Platform.OS === 'web'}
                       pointerEvents={Platform.OS === 'web' ? 'auto' : 'none'}
                       keyboardType="number-pad"
                       maxLength={10}
                     />
                  </Pressable>

                  {showPicker && Platform.OS !== 'web' && (
                    <DateTimePicker
                      value={pickerDate}
                      mode="date"
                      display="spinner"
                      onChange={onPickerChange}
                    />
                  )}
                </View>

                <View className="flex-1">
                  <Text className="text-[10px] font-black tracking-widest text-[#1D3E90] uppercase mb-2 ml-1">Locație</Text>
                  <View className="flex-row items-center border border-gray-200 bg-gray-50 rounded-2xl px-4 h-14 focus-within:border-[#1D3E90]">
                     <MapPin size={18} color="var(--c-faint)" />
                     <TextInput 
                       placeholder="Clinică" 
                       className="flex-1 ml-3 text-[14px] font-bold text-[#0E2041] outline-none"
                       placeholderTextColor="var(--c-faint)"
                       value={location} onChangeText={setLocation}
                     />
                  </View>
                </View>
              </View>

              {/* Scope Toggle */}
              <View className="flex-row justify-between items-center bg-[#EBF1FF] p-4 rounded-2xl border border-[#BFDBFE] mt-2">
                <View>
                  <Text className="font-black text-[14px] text-[#1D3E90]">Select Specific Players</Text>
                  <Text className="text-[11px] font-bold text-[#3b82f6] mt-0.5">Toggle off to select entire team(s)</Text>
                </View>
                <Switch 
                  value={isSpecificPlayers} 
                  onValueChange={setIsSpecificPlayers} 
                  trackColor={{ false: 'var(--c-border-strong)', true: 'var(--c-brand-fg)' }}
                  thumbColor="#ffffff"
                />
              </View>

              {/* Conditional Multi-Select Area */}
              {isSpecificPlayers && (
                <View className="border border-gray-200 rounded-2xl overflow-hidden mt-4">
                   <View className="flex-row justify-between items-center bg-gray-50 px-4 py-3 border-b border-gray-200">
                      <Text className="text-[10px] font-black tracking-widest text-gray-500 uppercase">
                        Jucători Vizați {selectedTeamIds.length > 0 ? '' : '(Alegeți echipe)'}
                      </Text>
                      {players.length > 0 && !loadingPlayers && (
                          <Pressable onPress={handleSelectAllPlayers} className="flex-row items-center gap-1.5 bg-blue-100/50 px-2.5 py-1.5 rounded-md">
                             <CheckSquare size={12} color="var(--c-brand-fg)" />
                             <Text className="text-[10px] font-bold text-[#1D3E90] uppercase">{allSelected ? 'Deselectează' : 'Selectează Toți'}</Text>
                          </Pressable>
                      )}
                   </View>
                   <View className="p-2 gap-1 bg-white max-h-48">
                     {loadingPlayers && <ActivityIndicator size="small" color="var(--c-brand-fg)" className="m-4" />}
                     {!loadingPlayers && players.length === 0 && selectedTeamIds.length > 0 && <Text className="p-4 text-gray-400 text-xs text-center w-full">Nu aveți jucători în echipele alese.</Text>}
                     {!loadingPlayers && players.map(player => {
                        const isSelected = selectedPlayers.includes(player.id);
                        return (
                          <Pressable 
                            key={player.id}
                            onPress={() => togglePlayer(player.id)}
                            className={`flex-row items-center p-3 rounded-[12px] transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                          >
                             <View className={`w-4 h-4 rounded-md border mr-3 items-center justify-center ${isSelected ? 'bg-[#1D3E90] border-[#1D3E90]' : 'border-gray-300'}`}>
                                {isSelected && <View className="w-2 h-2 bg-white rounded-sm" />}
                             </View>
                             <Text className={`text-[13px] ${isSelected ? 'font-black text-[#1D3E90]' : 'font-bold text-[#0D2040]'}`}>
                               {player.firstName} {player.lastName}
                             </Text>
                          </Pressable>
                        )
                     })}
                   </View>
                </View>
              )}
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View className="flex-row justify-end gap-3 p-6 border-t border-gray-100 bg-gray-50/50">
            <Pressable onPress={onClose} className="px-6 py-3.5 rounded-[14px] bg-white border border-gray-200 shadow-sm">
              <Text className="font-bold tracking-tight text-[#0D2040]">Cancel</Text>
            </Pressable>
            <Pressable 
              onPress={handleSubmit} 
              className={`px-6 py-3.5 rounded-[14px] shadow-sm flex-row items-center gap-2 ${date.length !== 10 && date.length !== 0 ? 'bg-gray-300' : 'bg-[#1D3E90] hover:bg-[#152e6b]'}`}
              disabled={date.length !== 10 && date.length !== 0}
            >
              <Text className="font-black text-[13px] tracking-wide text-white uppercase">Save Appointment</Text>
            </Pressable>
          </View>

        </View>
      </View>
    </Modal>
  );
}
