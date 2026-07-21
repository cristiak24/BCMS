import React from 'react';
import { View, Text, Pressable, Image } from '@/src/web/reactNative';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { Player } from '../../services/teamsApi';

interface ComplianceTableProps {
  data: Player[];
  selectedIds: number[];
  onToggleSelect: (id: number) => void;
  onSelectAll: (ids: number[]) => void;
}

export default function ComplianceTable({ data, selectedIds, onToggleSelect, onSelectAll }: ComplianceTableProps) {
  
  const allSelected = data.length > 0 && selectedIds.length === data.length;

  const handleSelectAll = () => {
    if (allSelected) {
      onSelectAll([]);
    } else {
      onSelectAll(data.map(p => p.id));
    }
  };

  const formatDate = (isoString: string | null) => {
    if (!isoString) return 'Missing';
    return new Date(isoString).toLocaleDateString('ro-RO', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getMedicalStatus = (expiry: string | null) => {
     if (!expiry) return 'EXPIRED';
     const expDate = new Date(expiry);
     const now = new Date();
     const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
     
     if (diffDays < 0) return 'EXPIRED';
     if (diffDays <= 30) return 'EXPIRING_SOON';
     return 'VALID';
  };

  const renderMedicalBadge = (status: string) => {
    if (status === 'VALID') {
       return (
         <View className="bg-blue-50 px-3 py-1.5 rounded-full self-start">
            <View className="w-1.5 h-1.5 rounded-full bg-blue-500 absolute left-2 top-2.5" />
            <Text className="text-xs font-bold text-blue-600 ml-2">Valid</Text>
         </View>
       );
    }
    if (status === 'EXPIRED') {
       return (
         <View className="bg-red-50 px-3 py-1.5 rounded-full self-start">
            <View className="w-1.5 h-1.5 rounded-full bg-red-600 absolute left-2 top-2.5" />
            <Text className="text-xs font-bold text-red-600 ml-2">Expired</Text>
         </View>
       );
    }
    return (
       <View className="bg-slate-100 px-3 py-1.5 rounded-full self-start">
          <View className="w-1.5 h-1.5 rounded-full bg-[#1D3E90] absolute left-2 top-2.5" />
          <Text className="text-xs font-bold text-[#1D3E90] ml-2">Expiring Soon</Text>
       </View>
    );
  };

  const renderMedicalClearance = (status: string) => {
    if (status === 'VALID') {
        return (
          <View className="flex-row items-center gap-2">
            <CheckCircle size={16} color="#1D3E90" />
            <Text className="text-[13px] font-bold text-[#0D2040]">Valid</Text>
          </View>
        );
    }
    return (
      <View className="flex-row items-center gap-2">
        <AlertTriangle size={16} color="#dc2626" />
        <Text className="text-[13px] font-bold text-red-600">Update Needed</Text>
      </View>
    );
  };

  const renderActionLabel = (mStatus: string) => {
     if (mStatus === 'EXPIRED') return 'Request Renewal';
     if (mStatus === 'EXPIRING_SOON') return 'Update File';
     return 'View Details';
  };

  return (
    <View className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden w-full">
      {/* Table Header */}
      <View className="flex-row border-b border-gray-100 p-6 bg-gray-50/50">
        <Pressable onPress={handleSelectAll} className="w-10 justify-center">
           <View className={`w-5 h-5 rounded border ${allSelected ? 'bg-[#1D3E90] border-[#1D3E90]' : 'border-gray-300 bg-white'} items-center justify-center`}>
              {allSelected && <View className="w-2.5 h-2.5 bg-white rounded-sm" />}
           </View>
        </Pressable>
        <Text className="flex-[2] text-[10px] font-black uppercase tracking-widest text-[#94A3B8]">Jucător</Text>
        <Text className="flex-1 text-[10px] font-black uppercase tracking-widest text-[#94A3B8]">Status Viză</Text>
        <Text className="flex-1 text-[10px] font-black uppercase tracking-widest text-[#94A3B8]">Expiră La</Text>
        <Text className="flex-1 text-[10px] font-black uppercase tracking-widest text-[#94A3B8]">Medic Sportiv</Text>
        <Text className="w-32 text-[10px] font-black uppercase tracking-widest text-[#94A3B8] text-right">Acțiuni</Text>
      </View>

      {/* Table Body */}
      {data.map((player) => {
        const isSelected = selectedIds.includes(player.id);
        const medStatus = getMedicalStatus(player.medicalCheckExpiry);
        
        return (
          <Pressable 
            key={player.id}
            onPress={() => onToggleSelect(player.id)}
            className={`flex-row items-center p-6 border-b border-gray-50 hover:bg-blue-50/30 transition-colors ${isSelected ? 'bg-blue-50/10' : ''}`}
          >
            {/* Checkbox */}
            <View className="w-10 justify-center">
               <View className={`w-5 h-5 rounded border ${isSelected ? 'bg-[#1D3E90] border-[#1D3E90]' : 'border-gray-300 bg-white'} items-center justify-center`}>
                  {isSelected && <View className="w-2.5 h-2.5 bg-white rounded-sm" />}
               </View>
            </View>

            {/* Athlete Info */}
            <View className="flex-[2] flex-row items-center gap-4 pr-4">
              <Image source={{ uri: player.avatarUrl || 'https://i.pravatar.cc/150' }} className="w-12 h-12 rounded-full bg-gray-200" />
              <View>
                <Text className="text-[15px] font-black text-[#0D2040] mb-0.5">{player.firstName} {player.lastName}</Text>
                <Text className="text-[11px] font-bold text-gray-500">{player.position || '-'} • #{player.number || '-'}</Text>
              </View>
            </View>

            {/* Medical Status (Mocking as Visa for now in UI) */}
            <View className="flex-1">
               {renderMedicalBadge(medStatus)}
            </View>

            {/* Expiry Date */}
            <View className="flex-1">
               <Text className={`text-[13px] font-black ${medStatus === 'EXPIRED' ? 'text-red-600' : 'text-[#0D2040]'}`}>
                  {formatDate(player.medicalCheckExpiry)}
               </Text>
            </View>

            {/* Medical Clearance */}
            <View className="flex-1">
               {renderMedicalClearance(medStatus)}
            </View>

            {/* Actions */}
            <View className="w-32 items-end">
               <Pressable>
                 <Text className="text-[13px] font-bold text-[#1D3E90]">
                   {renderActionLabel(medStatus)}
                 </Text>
               </Pressable>
            </View>

          </Pressable>
        );
      })}
    </View>
  );
}
