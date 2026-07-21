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
      setError('Current password is required.');
      return;
    }

    if (newPassword.trim().length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirm password must match.');
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
      setSuccess('Password changed successfully.');
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : 'Failed to change password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="bg-white rounded-[28px] p-6 border border-gray-100 shadow-sm">
      <Text className="text-[#0E2041] text-[12px] font-black uppercase tracking-widest mb-5">Security</Text>

      <View className="gap-4">
        <AuraInput
          label="Current Password"
          iconName="lock-outline"
          secureTextEntry
          value={currentPassword}
          onChangeText={setCurrentPassword}
          autoCapitalize="none"
        />
        <AuraInput
          label="New Password"
          iconName="lock"
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
          autoCapitalize="none"
        />
        <AuraInput
          label="Confirm New Password"
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
          className={`min-w-[220px] rounded-2xl px-5 py-4 flex-row items-center justify-center ${loading ? 'bg-[#8FA3D8]' : 'bg-[#0E2041]'}`}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <MaterialIcons name="verified-user" size={18} color="#ffffff" />
              <Text className="text-white font-black text-[12px] uppercase tracking-widest ml-2">Update Password</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}
