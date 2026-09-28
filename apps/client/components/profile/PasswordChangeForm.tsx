import { useState } from 'react';
import { Text, View } from '@/src/web/reactNative';
import { FormNotice, PrimaryButton, ProfileCard, ProfileField } from './ProfileParts';

type PasswordChangeFormProps = {
  onChangePassword: (payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => Promise<void>;
};

/**
 * 0–4 from length and character variety. A guide for the person typing, not a
 * security control — the real policy is enforced by the auth provider.
 */
function getPasswordStrength(value: string) {
  if (!value) return 0;
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;
  return Math.min(4, score);
}

const STRENGTH_META = [
  { label: 'Prea scurtă', color: 'var(--c-danger)' },
  { label: 'Slabă', color: 'var(--c-danger)' },
  { label: 'Acceptabilă', color: 'var(--c-warning)' },
  { label: 'Bună', color: 'var(--c-success)' },
  { label: 'Puternică', color: 'var(--c-success)' },
];

export default function PasswordChangeForm({ onChangePassword }: PasswordChangeFormProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const strength = getPasswordStrength(newPassword);
  const strengthMeta = STRENGTH_META[newPassword.length < 8 ? 0 : strength];
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;
  const canSubmit = Boolean(currentPassword && newPassword.length >= 8 && confirmPassword && !mismatch);

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
    <ProfileCard icon="lock" tone="warning" title="Securitate" description="Schimbă parola contului tău.">
      <View className="gap-4">
        <ProfileField
          label="Parola curentă"
          icon="lock-outline"
          secureTextEntry
          value={currentPassword}
          onChangeText={(value: string) => { setCurrentPassword(value); setError(null); setSuccess(null); }}
          autoCapitalize="none"
          autoComplete="current-password"
        />
        <View>
          <ProfileField
            label="Parolă nouă"
            icon="key"
            secureTextEntry
            value={newPassword}
            onChangeText={(value: string) => { setNewPassword(value); setError(null); setSuccess(null); }}
            autoCapitalize="none"
            autoComplete="new-password"
            hint={newPassword ? undefined : 'Minimum 8 caractere; combină litere mari, cifre și simboluri.'}
          />
          {newPassword ? (
            <View className="mt-2" accessibilityLabel={`Putere parolă: ${strengthMeta.label}`}>
              <View className="flex-row gap-1">
                {[0, 1, 2, 3].map((index) => (
                  <View
                    key={index}
                    className="flex-1 h-1.5 rounded-full"
                    style={{
                      backgroundColor: index < Math.max(1, strength) ? strengthMeta.color : 'var(--c-surface-3)',
                      transition: 'background-color 0.2s ease',
                    } as any}
                  />
                ))}
              </View>
              <Text className="text-[12px] font-semibold mt-1.5" style={{ color: strengthMeta.color }}>{strengthMeta.label}</Text>
            </View>
          ) : null}
        </View>
        <ProfileField
          label="Confirmă parola nouă"
          icon="key"
          secureTextEntry
          value={confirmPassword}
          onChangeText={(value: string) => { setConfirmPassword(value); setError(null); setSuccess(null); }}
          autoCapitalize="none"
          autoComplete="new-password"
          error={mismatch ? 'Parolele nu coincid.' : null}
        />

        {error ? <FormNotice tone="danger" message={error} /> : null}
        {success ? <FormNotice tone="success" message={success} /> : null}

        <View className="flex-row justify-end">
          <PrimaryButton
            label="Schimbă parola"
            loadingLabel="Se actualizează…"
            icon="verified-user"
            onPress={handleSubmit}
            loading={loading}
            disabled={!canSubmit}
          />
        </View>
      </View>
    </ProfileCard>
  );
}
