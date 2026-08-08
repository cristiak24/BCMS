import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import AuraInput from '../ui/AuraInput';

type PasswordChangeFormProps = {
  onChangePassword: (payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => Promise<void>;
};

export default function PasswordChangeForm({ onChangePassword }: PasswordChangeFormProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!currentPassword.trim()) {
      setError('Parola curentă este obligatorie.');
      return;
    }

    if (newPassword.trim().length < 8) {
      setError('Parola nouă trebuie să aibă cel puțin 8 caractere.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Parola nouă și confirmarea trebuie să coincidă.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await onChangePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Parola a fost schimbată cu succes.');
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : 'Nu s-a putut schimba parola.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="bg-[var(--c-surface)] rounded-[28px] p-6 border border-gray-100 shadow-sm">
      <Text className="text-[#0E2041] text-[12px] font-black uppercase tracking-widest mb-5">Securitate</Text>

      <View className="gap-4">
        <AuraInput
          label="Parola curentă"
          iconName="lock-outline"
          secureTextEntry
          value={currentPassword}
          onChangeText={setCurrentPassword}
          autoCapitalize="none"
        />
        <AuraInput
          label="Parolă nouă"
          iconName="lock"
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
          autoCapitalize="none"
        />
        <AuraInput
          label="Confirmă parola nouă"
          iconName="lock"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          autoCapitalize="none"
        />
      </View>

      {error ? (
        <View className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <Text className="text-red-700 text-sm font-semibold">{error}</Text>
        </View>
      ) : null}

      {success ? (
        <View className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <Text className="text-emerald-700 text-sm font-semibold">{success}</Text>
        </View>
      ) : null}

      <View className="mt-6 flex-row justify-end">
        <Pressable
          onPress={handleSubmit}
          disabled={loading}
          className={`min-w-[220px] rounded-2xl px-5 py-4 flex-row items-center justify-center ${loading ? 'bg-[#8FA3D8]' : 'bg-[#1D3E90]'}`}
        >
          {loading ? (
            <ActivityIndicator color="var(--c-surface)" />
          ) : (
            <>
              <MaterialIcons name="verified-user" size={18} color="var(--c-surface)" />
              <Text className="text-white font-black text-[12px] uppercase tracking-widest ml-2">Schimbă parola</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}
