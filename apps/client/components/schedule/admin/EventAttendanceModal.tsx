import React from 'react';
import { View, Text, Modal, Pressable, TouchableOpacity, ScrollView } from '@/src/web/reactNative';
import { X } from 'lucide-react';
import { CalendarEvent, EventAttendance } from '../../../services/eventsApi';

/**
 * Quick present/absent toggler opened from an event card on the schedule
 * page. This is intentionally lightweight — the full roster-wide attendance
 * workflow lives in the "Attendance" tab (AttendanceTab.tsx).
 */
export function EventAttendanceModal({
  event,
  attendanceList,
  onClose,
  onUpdate,
}: {
  event: CalendarEvent | null;
  attendanceList: EventAttendance[];
  onClose: () => void;
  onUpdate: (playerId: number, status: string) => void;
}) {
  return (
    <Modal visible={event !== null} transparent animationType="fade">
      <Pressable className="flex-1 bg-black/40 justify-center p-6" onPress={onClose}>
        <View className="bg-white rounded-[40px] p-10 shadow-2xl space-y-8" onStartShouldSetResponder={() => true}>
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-3xl font-black text-[#1E293B]">{event?.title}</Text>
              <Text className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Event Attendance Registry</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="w-12 h-12 bg-slate-50 rounded-2xl items-center justify-center">
              <X color="#1E293B" size={24} />
            </TouchableOpacity>
          </View>

          <View className="flex-row gap-3 mb-8">
            <View className="flex-1 bg-emerald-50 rounded-3xl p-5 border border-emerald-100 items-center justify-center">
              <Text className="text-emerald-600 font-black text-3xl">{attendanceList.filter((a) => a.status === 'present').length}</Text>
              <Text className="text-emerald-700 font-bold text-[10px] uppercase tracking-wider mt-1">Present</Text>
            </View>
            <View className="flex-1 bg-rose-50 rounded-3xl p-5 border border-rose-100 items-center justify-center">
              <Text className="text-rose-600 font-black text-3xl">{attendanceList.filter((a) => a.status === 'absent').length}</Text>
              <Text className="text-rose-700 font-bold text-[10px] uppercase tracking-wider mt-1">Absent</Text>
            </View>
            <View className="flex-1 bg-slate-50 rounded-3xl p-5 border border-slate-100 items-center justify-center">
              <Text className="text-slate-600 font-black text-3xl">{attendanceList.filter((a) => !a.status).length}</Text>
              <Text className="text-slate-700 font-bold text-[10px] uppercase tracking-wider mt-1">Pending</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
            <View className="gap-4">
              {attendanceList.map((player) => (
                <View key={player.playerId} className="bg-white border border-slate-100 p-5 rounded-[32px] flex-row items-center justify-between shadow-sm">
                  <View className="flex-row items-center flex-1">
                    <View className="w-12 h-12 bg-slate-100 rounded-2xl items-center justify-center mr-4">
                      <Text className="font-black text-slate-400">#{player.number || '00'}</Text>
                    </View>
                    <View>
                      <Text className="font-black text-slate-800 text-[15px]">{player.firstName} {player.lastName}</Text>
                      <Text className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-0.5">Player Profile</Text>
                    </View>
                  </View>
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      onPress={() => onUpdate(player.playerId, 'present')}
                      className={`w-20 py-3 rounded-2xl border ${player.status === 'present' ? 'bg-emerald-500 border-emerald-600 shadow-lg shadow-emerald-200' : 'bg-white border-slate-100'}`}
                    >
                      <Text className={`text-center font-black text-[10px] uppercase tracking-widest ${player.status === 'present' ? 'text-white' : 'text-slate-400'}`}>Present</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => onUpdate(player.playerId, 'absent')}
                      className={`w-20 py-3 rounded-2xl border ${player.status === 'absent' ? 'bg-rose-500 border-rose-600 shadow-lg shadow-rose-200' : 'bg-white border-slate-100'}`}
                    >
                      <Text className={`text-center font-black text-[10px] uppercase tracking-widest ${player.status === 'absent' ? 'text-white' : 'text-slate-400'}`}>Absent</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>

          <TouchableOpacity onPress={onClose} className="bg-slate-900 h-14 rounded-2xl items-center justify-center">
            <Text className="text-white font-black uppercase tracking-widest text-xs">Close Registry</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}
