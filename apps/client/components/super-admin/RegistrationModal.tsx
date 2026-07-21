import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';

type Props = {
  visible: boolean;
  email: string;
  clubName?: string | null;
  onSubmit: (payload: { firstName: string; lastName: string; phone?: string }) => Promise<void>;
};

export default function RegistrationModal({ visible, email, clubName, onSubmit }: Props) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  if (!visible) {
    return null;
  }

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onSubmit({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || undefined,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="absolute inset-0 bg-black/40 items-center justify-center px-4">
      <View className="w-full max-w-[560px] rounded-[32px] bg-white border border-[#E8EEFF] p-6 shadow-2xl">
        <View className="flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Text className="text-[#102A72] text-[26px] font-black tracking-tight">Complete registration</Text>
            <Text className="text-[#7483A6] mt-2">
              Finish your profile to activate your account for {clubName ?? 'your club'}.
            </Text>
          </View>
          <View className="w-12 h-12 rounded-2xl bg-[#E7EEFF] items-center justify-center">
            <MaterialIcons name="assignment-ind" size={24} color="#173AA8" />
          </View>
        </View>

        <Text className="text-[12px] uppercase tracking-[0.2em] font-black text-[#6B7AA6] mt-5">Account</Text>
        <Text className="text-[#102A72] font-semibold mt-1">{email}</Text>

        <View className="gap-3 mt-5">
          <TextInput value={firstName} onChangeText={setFirstName} placeholder="First name" className="rounded-2xl bg-[#F7F9FF] px-4 py-4 text-[#102A72]" placeholderTextColor="#9AA7C2" />
          <TextInput value={lastName} onChangeText={setLastName} placeholder="Last name" className="rounded-2xl bg-[#F7F9FF] px-4 py-4 text-[#102A72]" placeholderTextColor="#9AA7C2" />
          <TextInput value={phone} onChangeText={setPhone} placeholder="Phone number (optional)" className="rounded-2xl bg-[#F7F9FF] px-4 py-4 text-[#102A72]" placeholderTextColor="#9AA7C2" />
        </View>

        <Pressable onPress={handleSubmit} disabled={loading} className="mt-5 rounded-2xl bg-[#173AA8] py-4 items-center justify-center shadow-lg shadow-blue-900/20">
          {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-black tracking-wide">Activate account</Text>}
        </Pressable>
      </View>
    </View>
  );
}
