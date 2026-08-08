import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import AuraInput from '../ui/AuraInput';
import type { ProfileRecord, UpdateProfilePayload } from '../../services/profileApi';
import type { NotificationPreferences } from '../../utils/authSession';

type ProfileFormProps = {
  profile: ProfileRecord;
  onSave: (payload: UpdateProfilePayload) => Promise<ProfileRecord>;
};

export default function ProfileForm({ profile, onSave }: ProfileFormProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('');
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
    email: true,
    push: false,
    sms: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setFirstName(profile.firstName ?? '');
    setLastName(profile.lastName ?? '');
    setPhone(profile.phone ?? '');
    setPreferredLanguage(profile.preferredLanguage ?? '');
    setNotificationPreferences(profile.notificationPreferences ?? { email: true, push: false, sms: false });
    setError(null);
    setSuccess(null);
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await onSave({
        firstName,
        lastName,
        phone: phone.trim() ? phone.trim() : null,
        preferredLanguage: preferredLanguage.trim() ? preferredLanguage.trim() : null,
        notificationPreferences,
      });

      setFirstName(updated.firstName ?? '');
      setLastName(updated.lastName ?? '');
      setPhone(updated.phone ?? '');
      setPreferredLanguage(updated.preferredLanguage ?? '');
      setNotificationPreferences(updated.notificationPreferences ?? { email: true, push: false, sms: false });
      setSuccess('Profil salvat cu succes.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nu s-a putut salva profilul.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="space-y-4">
      <View className="bg-[var(--c-surface)] rounded-[28px] p-6 border border-gray-100 shadow-sm">
        <Text className="text-[#0E2041] text-[12px] font-black uppercase tracking-widest mb-5">Informații personale</Text>

        <View className="gap-4">
          <AuraInput
            label="Prenume"
            iconName="person"
            value={firstName}
            onChangeText={setFirstName}
          />
          <AuraInput
            label="Nume"
            iconName="person"
            value={lastName}
            onChangeText={setLastName}
          />
          <AuraInput
            label="Număr de telefon"
            iconName="phone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="Opțional"
          />
          <AuraInput
            label="Limbă preferată"
            iconName="language"
            value={preferredLanguage}
            onChangeText={setPreferredLanguage}
            placeholder="Opțional"
          />
        </View>

        <View className="mt-2">
          <Text className="text-[#64748B] text-[11px] font-bold tracking-wider uppercase mb-3">Preferințe notificări</Text>
          <View className="gap-3">
            {([
              { key: 'email', label: 'Actualizări email' },
              { key: 'push', label: 'Notificări push' },
              { key: 'sms', label: 'Alerte SMS' },
            ] as const).map((item) => (
              <View key={item.key} className="flex-row items-center justify-between bg-[#F8FAFC] rounded-2xl px-4 py-3 border border-gray-100">
                <Text className="text-[#0E2041] font-semibold">{item.label}</Text>
                <Switch
                  value={Boolean(notificationPreferences[item.key])}
                  onValueChange={(value) => setNotificationPreferences((current) => ({ ...current, [item.key]: value }))}
                  trackColor={{ false: 'var(--c-border-strong)', true: '#C7D2FE' }}
                  thumbColor={notificationPreferences[item.key] ? 'var(--c-brand-fg)' : 'var(--c-surface-2)'}
                />
              </View>
            ))}
          </View>
        </View>

        {error ? (
          <View className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
            <Text className="text-red-700 text-sm font-semibold">{error}</Text>
          </View>
        ) : null}

        {success ? (
          <View className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <Text className="text-emerald-700 text-sm font-semibold">{success}</Text>
          </View>
        ) : null}

        <View className="mt-6 flex-row justify-end">
          <Pressable
            onPress={handleSave}
            disabled={saving}
            className={`min-w-[180px] rounded-2xl px-5 py-4 flex-row items-center justify-center ${saving ? 'bg-[#8FA3D8]' : 'bg-[#1D3E90]'}`}
          >
            {saving ? (
              <ActivityIndicator color="var(--c-surface)" />
            ) : (
              <>
                <MaterialIcons name="save" size={18} color="var(--c-surface)" />
                <Text className="text-white font-black text-[12px] uppercase tracking-widest ml-2">Salvează</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}
