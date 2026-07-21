import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform } from '@/src/web/reactNative';
import { X, Calendar as CalendarIcon, CheckSquare } from 'lucide-react';
import { teamsApi, Team, Player } from '../../../services/teamsApi';
import DateTimePicker from '@/src/web/dateTimePicker';

interface UpdateFileModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function UpdateFileModal({ visible, onClose, onSuccess }: UpdateFileModalProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  
  const [selectedTeamIds, setSelectedTeamIds] = useState<number[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([]);
  const [expiryDate, setExpiryDate] = useState(''); // DD-MM-YYYY
  
  const [showPicker, setShowPicker] = useState(false);
  const [pickerDate, setPickerDate] = useState(new Date());

  const [loading, setLoading] = useState(false);
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  useEffect(() => {
    if (visible) {
      loadTeams();
      setSelectedTeamIds([]);
      setSelectedPlayerIds([]);
      setExpiryDate('');
      setPlayers([]);
    }
  }, [visible]);

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
        // Remove duplicates if a player is in multiple selected teams
        const uniquePlayers = Array.from(new Map(flatPlayers.map(p => [p.id, p])).values());
        setPlayers(uniquePlayers);
      } catch(e) { console.error(e); }
      finally { setLoadingPlayers(false); }
    };

    fetchMultiPlayers();
  }, [selectedTeamIds]);

  const loadTeams = async () => {
     try {
       const data = await teamsApi.getTeams();
       setTeams(data);
     } catch (e) { console.error(e); }
  };

  const handleDateChange = (text: string) => {
    let cleaned = text.replace(/\D/g, '');
    if (cleaned.length > 2) cleaned = cleaned.slice(0, 2) + '-' + cleaned.slice(2);
    if (cleaned.length > 5) cleaned = cleaned.slice(0, 5) + '-' + cleaned.slice(5, 9);
    setExpiryDate(cleaned);
  };

  const onPickerChange = (event: any, selectedDate?: Date) => {
    setShowPicker(false);
    if (selectedDate) {
        setPickerDate(selectedDate);
        const d = String(selectedDate.getDate()).padStart(2, '0');
        const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const y = selectedDate.getFullYear();
        setExpiryDate(`${d}-${m}-${y}`);
    }
  };

  const toggleTeam = (id: number) => {
     setSelectedTeamIds(prev => 
        prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
     );
  };

  const togglePlayer = (id: number) => {
     setSelectedPlayerIds(prev => 
        prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
     );
  };

  const handleSelectAllPlayers = () => {
      if (selectedPlayerIds.length === players.length && players.length > 0) {
          setSelectedPlayerIds([]);
      } else {
          setSelectedPlayerIds(players.map(p => p.id));
      }
  };

  const handleSubmit = async () => {
    if (selectedPlayerIds.length === 0 || expiryDate.length !== 10) return;
    
    setLoading(true);
    try {
        const [day, month, year] = expiryDate.split('-');
        const isoDate = new Date(`${year}-${month}-${day}T12:00:00Z`).toISOString();

        await Promise.all(selectedPlayerIds.map(id => 
            teamsApi.updatePlayer(id, { medicalCheckExpiry: isoDate })
        ));
        
        onSuccess();
        onClose();
    } catch (e) {
        console.error("Update failed", e);
    } finally {
        setLoading(false);
    }
  };

  const allSelected = players.length > 0 && selectedPlayerIds.length === players.length;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View className="flex-1 bg-[#0E2041]/60 justify-center items-center p-4">
        <View className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden">
          
          <View className="p-6 border-b border-gray-100 flex-row justify-between items-center bg-gray-50/50">
            <View>
               <Text className="text-xl font-black text-[#0D2040] mb-1">Update Medical File</Text>
               <Text className="text-xs font-bold text-gray-500">Actualizați expirația (Selecție Multiplă)</Text>
            </View>
            <Pressable onPress={onClose} className="w-10 h-10 bg-white border border-gray-200 rounded-full items-center justify-center hover:bg-gray-50 transition-colors">
              <X size={20} color="#64748B" />
            </Pressable>
          </View>

          <ScrollView className="p-6 max-h-[70vh]" showsVerticalScrollIndicator={false}>
            <View className="space-y-6">
              
              {/* Select Team Map (Multi-select) */}
              <View>
                <Text className="text-[10px] font-black tracking-widest text-[#1D3E90] uppercase mb-2 ml-1">Alege Echipe (Poți alege mai multe)</Text>
                <View className="border border-gray-200 bg-white rounded-2xl overflow-hidden">
                   <View className="flex-row flex-wrap p-2 gap-2">
                       {teams.map(t => {
                           const isSelected = selectedTeamIds.includes(t.id);
                           return (
                             <Pressable key={t.id} onPress={() => toggleTeam(t.id)} className={`px-4 py-2 rounded-xl border ${isSelected ? 'bg-[#1D3E90] border-[#1D3E90]' : 'bg-gray-50 border-gray-200'}`}>
                                 <Text className={`text-[12px] font-bold ${isSelected ? 'text-white' : 'text-[#0D2040]'}`}>{t.name}</Text>
                             </Pressable>
                           );
                       })}
                       {teams.length === 0 && <Text className="p-2 text-gray-400 text-xs text-center w-full">Se încarcă echipele...</Text>}
                   </View>
                </View>
              </View>

              {/* Select Player (Multi-select with Select All) */}
              <View>
                <View className="flex-row justify-between items-center mb-2 px-1">
                   <Text className="text-[10px] font-black tracking-widest text-[#1D3E90] uppercase">Jucători Vizați</Text>
                   {players.length > 0 && !loadingPlayers && (
                      <Pressable onPress={handleSelectAllPlayers} className="flex-row items-center gap-1.5 bg-blue-50 px-2 py-1 rounded-md">
                         <CheckSquare size={12} color="#1D3E90" />
                         <Text className="text-[10px] font-bold text-[#1D3E90] uppercase">{allSelected ? 'Deselectează' : 'Selectează Toți'}</Text>
                      </Pressable>
                   )}
                </View>
                
                <View className="border border-gray-200 bg-white rounded-2xl overflow-hidden min-h-[60px] p-2 flex-row flex-wrap gap-2">
                   {loadingPlayers && <ActivityIndicator size="small" color="#1D3E90" className="m-2" />}
                   {!loadingPlayers && players.length === 0 && selectedTeamIds.length > 0 && <Text className="p-2 text-gray-400 text-xs">Alegeți altă echipă, aceasta nu are jucători.</Text>}
                   {!loadingPlayers && selectedTeamIds.length === 0 && <Text className="p-2 text-gray-400 text-xs">Alegeți cel puțin o echipă.</Text>}
                   
                   {!loadingPlayers && players.map(p => {
                       const isSelected = selectedPlayerIds.includes(p.id);
                       return (
                         <Pressable 
                           key={p.id} 
                           onPress={() => togglePlayer(p.id)} 
                           className={`px-3 py-2 rounded-xl flex-row items-center gap-2 border transition-colors ${isSelected ? 'bg-[#1D3E90] border-[#1D3E90]' : 'bg-gray-50 border-gray-200'}`}
                         >
                             <View className={`w-3.5 h-3.5 rounded border items-center justify-center ${isSelected ? 'bg-white border-white' : 'border-gray-400'}`}>
                                 {isSelected && <View className="w-1.5 h-1.5 bg-[#1D3E90] rounded-sm" />}
                             </View>
                             <Text className={`text-[12px] font-bold ${isSelected ? 'text-white' : 'text-[#0D2040]'}`}>{p.firstName} {p.lastName}</Text>
                         </Pressable>
                       );
                   })}
                </View>
              </View>

              {/* Date */}
              <View>
                  <Text className="text-[10px] font-black tracking-widest text-[#1D3E90] uppercase mb-2 ml-1">Dată Nouă Expirare (DD-MM-YYYY)</Text>
                  <Pressable 
                    onPress={() => { if (Platform.OS !== 'web') setShowPicker(true); }}
                    className="flex-row items-center border border-gray-200 bg-gray-50 rounded-2xl px-4 h-14 focus-within:border-[#1D3E90]"
                  >
                     <CalendarIcon size={18} color="#94A3B8" />
                     <TextInput 
                       placeholder="DD-MM-YYYY" 
                       className="flex-1 ml-3 text-[14px] font-bold text-[#0E2041] outline-none"
                       placeholderTextColor="#9ca3af"
                       value={expiryDate} 
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

            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View className="flex-row justify-end gap-3 p-6 border-t border-gray-100 bg-gray-50/50">
            <Pressable onPress={onClose} className="px-6 py-3.5 rounded-[14px] bg-white border border-gray-200 shadow-sm">
              <Text className="font-bold tracking-tight text-[#0D2040]">Anulează</Text>
            </Pressable>
            <Pressable 
              onPress={handleSubmit} 
              disabled={loading || selectedPlayerIds.length === 0 || expiryDate.length !== 10}
              className={`px-6 py-3.5 rounded-[14px] shadow-sm flex-row items-center gap-2 ${loading || selectedPlayerIds.length === 0 || expiryDate.length !== 10 ? 'bg-gray-300' : 'bg-[#1D3E90] hover:bg-[#152e6b]'}`}
            >
              {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text className="font-black text-[13px] tracking-wide text-white uppercase">Actualizează ({selectedPlayerIds.length})</Text>}
            </Pressable>
          </View>

        </View>
      </View>
    </Modal>
  );
}
