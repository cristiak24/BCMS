import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, Text, TextInput, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { superAdminApi } from '../../services/superAdminApi';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

export default function CreateClubModal({ visible, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) {
      setName('');
      setLoading(false);
    }
  }, [visible]);

  const submit = async () => {
    const trimmedName = name.trim().replace(/\s+/g, ' ');

    if (!trimmedName) {
      return;
    }

    try {
      setLoading(true);
      const response = await superAdminApi.createClub({ name: trimmedName });
      Alert.alert('Club created', `${response.club.name} is now available.`);
      onCreated?.();
      setName('');
      onClose();
      return response;
    } catch (error) {
      Alert.alert('Create club failed', error instanceof Error ? error.message : 'Could not create club.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-center px-4">
        <Pressable className="absolute inset-0 bg-black/45" onPress={onClose} />
        <View
          className="w-full max-w-[560px] self-center rounded-[28px] bg-white border border-[#E8EEFF] overflow-hidden z-10"
        >
          <View className="px-5 py-4 border-b border-[#E8EEFF] flex-row items-center justify-between">
            <View>
              <Text className="text-[#102A72] text-[20px] font-black">Create club</Text>
              <Text className="text-[#7483A6] text-[12px] mt-1">The club will be available instantly after save.</Text>
            </View>
            <Pressable onPress={onClose} className="w-10 h-10 rounded-full bg-[#F4F7FF] items-center justify-center">
              <MaterialIcons name="close" size={20} color="#6B7AA6" />
            </Pressable>
          </View>

          <View className="p-5 gap-4">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Club name"
              autoCapitalize="words"
              className="rounded-2xl bg-[#F7F9FF] px-4 py-4 text-[#102A72] border border-[#DDE6FF]"
              placeholderTextColor="#9AA7C2"
            />

            <View className="flex-row items-center justify-between rounded-2xl bg-[#F7F9FF] border border-dashed border-[#DDE6FF] px-4 py-3">
              <View className="flex-1 pr-3">
                <Text className="text-[#102A72] text-[13px] font-bold">Club status</Text>
                <Text className="text-[#7483A6] text-[12px] mt-1 leading-4">
                  New clubs are created with active status and can be selected right away.
                </Text>
              </View>
              <MaterialIcons name="verified" size={22} color="#173AA8" />
            </View>

            <Pressable
              onPress={submit}
              disabled={loading || !name.trim()}
              className="rounded-2xl bg-[#173AA8] py-4 items-center justify-center shadow-lg shadow-blue-900/20 disabled:opacity-60"
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-black tracking-[0.16em] uppercase text-[12px]">
                  Create Club
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
