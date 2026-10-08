import { useEffect, useMemo, useState } from 'react';
import { Pressable, Switch, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import type { ProfileRecord, UpdateProfilePayload } from '../../services/profileApi';
import type { NotificationPreferences } from '../../utils/authSession';
import { FormNotice, PrimaryButton, ProfileCard, ProfileField } from './ProfileParts';

type ProfileFormProps = {
  profile: ProfileRecord;
  onSave: (payload: UpdateProfilePayload) => Promise<ProfileRecord>;
};

const DEFAULT_NOTIFICATIONS: NotificationPreferences = { email: true, push: false, sms: false };

/**
 * Languages the app actually ships copy for. This used to be a free-text field,
 * which is how profiles ended up storing "ro", "Romana" and "romanian" for the
 * same thing.
 */
const LANGUAGE_OPTIONS = [
  { value: 'ro', label: 'Română' },
  { value: 'en', label: 'English' },
];

// Only what the server actually sends. Push and SMS toggles used to be shown
// here although nothing stored or sent them.
const NOTIFICATION_OPTIONS = [
  { key: 'email', icon: 'mail', label: 'Email', description: 'Mementouri de plată și antrenamente sau meciuri anulate ori mutate. Notificările din aplicație rămân oricum.' },
] as const;

function normalizeLanguage(value?: string | null) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized.startsWith('ro')) return 'ro';
  if (normalized.startsWith('en')) return 'en';
  return normalized;
}

function sameNotifications(a: NotificationPreferences, b: NotificationPreferences) {
  return Boolean(a.email) === Boolean(b.email) && Boolean(a.push) === Boolean(b.push) && Boolean(a.sms) === Boolean(b.sms);
}

export default function ProfileForm({ profile, onSave }: ProfileFormProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('');
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATIONS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setFirstName(profile.firstName ?? '');
    setLastName(profile.lastName ?? '');
    setPhone(profile.phone ?? '');
    setPreferredLanguage(normalizeLanguage(profile.preferredLanguage));
    setNotificationPreferences(profile.notificationPreferences ?? DEFAULT_NOTIFICATIONS);
    setError(null);
    setSuccess(null);
  }, [profile]);

  // Save is only offered when something actually changed — the old always-on
  // button invited a no-op PATCH and a "saved" toast for nothing.
  const dirty = useMemo(() => (
    firstName !== (profile.firstName ?? '')
    || lastName !== (profile.lastName ?? '')
    || phone.trim() !== (profile.phone ?? '').trim()
    || preferredLanguage !== normalizeLanguage(profile.preferredLanguage)
    || !sameNotifications(notificationPreferences, profile.notificationPreferences ?? DEFAULT_NOTIFICATIONS)
  ), [firstName, lastName, notificationPreferences, phone, preferredLanguage, profile]);

  const firstNameError = firstName.trim() ? null : 'Prenumele este obligatoriu.';
  const lastNameError = lastName.trim() ? null : 'Numele este obligatoriu.';
  const phoneError = phone.trim() && !/^[+()\d\s.-]{6,20}$/.test(phone.trim()) ? 'Număr de telefon invalid.' : null;
  const invalid = Boolean(firstNameError || lastNameError || phoneError);

  const handleSave = async () => {
    if (invalid || !dirty) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await onSave({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() ? phone.trim() : null,
        preferredLanguage: preferredLanguage || null,
        notificationPreferences,
      });

      setFirstName(updated.firstName ?? '');
      setLastName(updated.lastName ?? '');
      setPhone(updated.phone ?? '');
      setPreferredLanguage(normalizeLanguage(updated.preferredLanguage));
      setNotificationPreferences(updated.notificationPreferences ?? DEFAULT_NOTIFICATIONS);
      setSuccess('Modificările au fost salvate.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nu s-a putut salva profilul.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setFirstName(profile.firstName ?? '');
    setLastName(profile.lastName ?? '');
    setPhone(profile.phone ?? '');
    setPreferredLanguage(normalizeLanguage(profile.preferredLanguage));
    setNotificationPreferences(profile.notificationPreferences ?? DEFAULT_NOTIFICATIONS);
    setError(null);
  };

  return (
    <View className="gap-4">
      <ProfileCard icon="person" title="Informații personale" description="Cum te văd antrenorii și administratorii clubului.">
        <View className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ProfileField
            label="Prenume"
            icon="person"
            value={firstName}
            onChangeText={(value: string) => { setFirstName(value); setSuccess(null); }}
            autoComplete="given-name"
            error={firstName !== (profile.firstName ?? '') ? firstNameError : null}
          />
          <ProfileField
            label="Nume"
            icon="person"
            value={lastName}
            onChangeText={(value: string) => { setLastName(value); setSuccess(null); }}
            autoComplete="family-name"
            error={lastName !== (profile.lastName ?? '') ? lastNameError : null}
          />
          <ProfileField
            label="Telefon"
            icon="phone"
            value={phone}
            onChangeText={(value: string) => { setPhone(value); setSuccess(null); }}
            keyboardType="phone-pad"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+40 7xx xxx xxx"
            hint="Opțional — folosit doar de club pentru urgențe."
            error={phoneError}
          />

          <View className="min-w-0">
            <Text className="text-[12.5px] font-semibold mb-1.5" style={{ color: 'var(--c-ink-soft)' }}>Limbă preferată</Text>
            <View
              className="flex-row h-11 rounded-[11px] border p-1 gap-1"
              style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' } as any}
              accessibilityRole="radiogroup"
              accessibilityLabel="Limbă preferată"
            >
              {LANGUAGE_OPTIONS.map((option) => {
                const active = preferredLanguage === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => { setPreferredLanguage(option.value); setSuccess(null); }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={option.label}
                    className="flex-1 rounded-[8px] items-center justify-center"
                    style={{
                      backgroundColor: active ? 'var(--c-surface)' : 'transparent',
                      boxShadow: active ? 'var(--e-sm)' : 'none',
                      transition: 'background-color 0.15s ease, box-shadow 0.15s ease',
                    } as any}
                  >
                    <Text className="text-[13px] font-semibold" style={{ color: active ? 'var(--c-ink)' : 'var(--c-muted)' }}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </ProfileCard>

      <ProfileCard icon="notifications" tone="sky" title="Notificări" description="Alege pe ce canale primești noutăți de la club.">
        <View className="gap-2">
          {NOTIFICATION_OPTIONS.map((item) => {
            const enabled = Boolean(notificationPreferences[item.key]);
            return (
              <View
                key={item.key}
                className="flex-row items-center gap-3 rounded-[12px] border px-3.5 py-3"
                style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border-soft)' } as any}
              >
                <View
                  className="w-9 h-9 rounded-[10px] items-center justify-center shrink-0"
                  style={{ backgroundColor: enabled ? 'var(--c-surface-tint)' : 'var(--c-surface-3)', transition: 'background-color 0.2s ease' } as any}
                >
                  <MaterialIcons name={item.icon} size={17} color={enabled ? 'var(--c-brand-fg)' : 'var(--c-muted)'} />
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }}>{item.label}</Text>
                  <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>{item.description}</Text>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={(value: boolean) => {
                    setNotificationPreferences((current) => ({ ...current, [item.key]: value }));
                    setSuccess(null);
                  }}
                  accessibilityLabel={item.label}
                />
              </View>
            );
          })}
        </View>
      </ProfileCard>

      {error ? <FormNotice tone="danger" message={error} /> : null}
      {success ? <FormNotice tone="success" message={success} /> : null}

      {/* Save bar. Sticks to the bottom of the viewport while there are unsaved
          edits, so the action is reachable without scrolling back. On mobile it
          clears the fixed bottom tab bar. */}
      <View
        className="sticky bottom-[88px] lg:bottom-4 z-10 flex-row items-center justify-between gap-3 rounded-[14px] border px-4 py-3"
        style={{
          backgroundColor: 'var(--c-surface)',
          borderColor: dirty ? 'var(--c-brand-border)' : 'var(--c-border)',
          boxShadow: dirty ? 'var(--e-lg)' : 'var(--e-xs)',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        } as any}
      >
        <View className="flex-row items-center gap-2 flex-1 min-w-0">
          <View className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dirty ? 'var(--c-warning)' : 'var(--c-success)' }} />
          <Text className="text-[13px] font-medium" style={{ color: 'var(--c-ink-soft)' }} numberOfLines={1}>
            {dirty ? 'Ai modificări nesalvate' : 'Totul este salvat'}
          </Text>
        </View>
        <View className="flex-row items-center gap-2 shrink-0">
          {dirty && !saving ? (
            <Pressable
              onPress={handleReset}
              accessibilityRole="button"
              accessibilityLabel="Renunță la modificări"
              className="ui-press h-11 px-3.5 rounded-[11px] items-center justify-center"
            >
              <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-muted)' }}>Renunță</Text>
            </Pressable>
          ) : null}
          <PrimaryButton
            label="Salvează"
            loadingLabel="Se salvează…"
            icon="save"
            onPress={handleSave}
            loading={saving}
            disabled={!dirty || invalid}
          />
        </View>
      </View>
    </View>
  );
}
