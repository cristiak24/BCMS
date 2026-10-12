import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useFocusEffect } from '@/src/web/reactNavigationNative';
import ClubSelect from './ClubSelect';
import {
  getCachedSuperAdminClubs,
  subscribeToClubs,
  superAdminApi,
  type SuperAdminClub,
} from '../../services/superAdminApi';

type Props = {
  onCreated?: () => void;
  onCreateClub?: () => void;
};

const ROLES = [
  { label: 'Admin', value: 'admin' as const },
  { label: 'Coach', value: 'coach' as const },
  { label: 'Staff', value: 'staff' as const },
  { label: 'Player', value: 'player' as const },
];

export default function InviteUserForm({ onCreated, onCreateClub }: Props) {
  const cachedClubs = getCachedSuperAdminClubs();
  const [hadCachedClubs] = useState(Boolean(cachedClubs));
  const [clubs, setClubs] = useState<SuperAdminClub[]>(cachedClubs ?? []);
  const [clubsLoading, setClubsLoading] = useState(!cachedClubs);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]['value']>('admin');
  const [clubId, setClubId] = useState<number | null>(() => cachedClubs?.[0]?.id ?? null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ fullName?: string; email?: string; club?: string; }>({});

  const loadClubs = useCallback(async () => {
    setClubsLoading(true);
    try {
      const response = await superAdminApi.refreshClubs();
      setClubs(response.clubs);
      setClubId((current) => {
        if (current != null && response.clubs.some((club) => club.id === current)) {
          return current;
        }
        return response.clubs[0]?.id ?? null;
      });
    } catch (error) {
      Alert.alert('Clubs', error instanceof Error ? error.message : 'Could not load clubs.');
    } finally {
      setClubsLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToClubs((nextClubs) => {
      setClubs(nextClubs);
      setClubId((current) => {
        if (current != null && nextClubs.some((club) => club.id === current)) {
          return current;
        }
        return nextClubs[0]?.id ?? null;
      });
      setClubsLoading(false);
    });

    if (!hadCachedClubs) {
      void loadClubs();
    }

    return unsubscribe;
  }, [hadCachedClubs, loadClubs]);

  useFocusEffect(
    useCallback(() => {
      void loadClubs();
    }, [loadClubs]),
  );

  const submit = async () => {
    const normalizedFullName = fullName.trim().replace(/\s+/g, ' ');
    const normalizedEmail = email.trim().toLowerCase();

    const nextErrors: typeof errors = {};
    if (!normalizedFullName) {
      nextErrors.fullName = 'Full name is required.';
    }
    if (!normalizedEmail) {
      nextErrors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      nextErrors.email = 'Enter a valid email address.';
    }
    if (!clubId) {
      nextErrors.club = 'Please select a club.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !role) {
      return;
    }

    const selectedClubId = clubId;
    if (selectedClubId == null) {
      return;
    }

    try {
      setLoading(true);
      const response = await superAdminApi.createInvitation({
        email: normalizedEmail,
        fullName: normalizedFullName,
        role,
        clubId: selectedClubId,
      });
      Alert.alert('Invite sent', `${response.invitation.email} will receive the invite link shortly.`);
      setFullName('');
      setEmail('');
      setErrors({});
      onCreated?.();
    } catch (error) {
      Alert.alert('Invite failed', error instanceof Error ? error.message : 'Could not create invite.');
    } finally {
      setLoading(false);
    }
  };

  const hasClubs = clubs.length > 0;

  return (
    <View className="overflow-hidden rounded-[32px] border border-[#E8EEFF] bg-white shadow-sm">
      <View className="px-5 py-5 border-b border-[#E8EEFF] bg-[#FBFCFF]">
        <View className="flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Text className="text-[#102A72] text-[24px] font-black tracking-tight">Create user invitation</Text>
            <Text className="text-[#7483A6] text-[13px] mt-2 leading-5">
              Pick an existing club, assign a role, and send a 10-minute invite link by email.
            </Text>
          </View>
          <View className="w-12 h-12 rounded-2xl bg-[#E7EEFF] items-center justify-center">
            <MaterialIcons name="person-add" size={24} color="var(--c-brand-fg)" />
          </View>
        </View>
      </View>

      <View className="p-5 gap-4">
        <TextInput
          value={fullName}
          onChangeText={(value) => {
            setFullName(value);
            setErrors((current) => ({ ...current, fullName: undefined }));
          }}
          placeholder="Full name *"
          autoCapitalize="words"
          className={`rounded-2xl bg-[#F7F9FF] px-4 py-4 text-[#102A72] border ${errors.fullName ? 'border-red-300' : 'border-[#DDE6FF]'}`}
          placeholderTextColor="var(--c-faint)"
        />
        {errors.fullName ? <Text className="-mt-2 text-xs font-bold text-red-600">{errors.fullName}</Text> : null}

        <TextInput
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setErrors((current) => ({ ...current, email: undefined }));
          }}
          placeholder="Email address *"
          autoCapitalize="none"
          keyboardType="email-address"
          className={`rounded-2xl bg-[#F7F9FF] px-4 py-4 text-[#102A72] border ${errors.email ? 'border-red-300' : 'border-[#DDE6FF]'}`}
          placeholderTextColor="var(--c-faint)"
        />
        {errors.email ? <Text className="-mt-2 text-xs font-bold text-red-600">{errors.email}</Text> : null}

        {hasClubs ? (
          <ClubSelect
            clubs={clubs}
            value={clubId}
            onChange={(value) => {
              setClubId(value);
              setErrors((current) => ({ ...current, club: undefined }));
            }}
            loading={clubsLoading}
            placeholder={clubsLoading ? 'Loading clubs…' : 'Choose an existing club'}
          />
        ) : (
          <View className="rounded-[28px] border border-dashed border-[#DDE6FF] bg-[#F7F9FF] px-4 py-5 gap-3">
            <View className="flex-row items-start gap-3">
              <View className="w-11 h-11 rounded-2xl bg-[#E7EEFF] items-center justify-center">
                <MaterialIcons name="apartment" size={22} color="var(--c-brand-fg)" />
              </View>
              <View className="flex-1">
                <Text className="text-[#102A72] text-[15px] font-bold">No clubs available</Text>
                <Text className="text-[#7483A6] text-[12px] mt-1 leading-5">
                  Create a club first so the invitation can be linked to it.
                </Text>
              </View>
            </View>

            <Pressable
              onPress={onCreateClub}
              className="self-start rounded-full bg-[#173AA8] px-4 py-3"
            >
              <Text className="text-white font-black text-[12px] tracking-[0.12em] uppercase">
                Create Club
              </Text>
            </Pressable>
          </View>
        )}
        {errors.club ? <Text className="-mt-2 text-xs font-bold text-red-600">{errors.club}</Text> : null}

        <View className="gap-2">
          <Text className="text-[11px] font-black uppercase tracking-[0.2em] text-[#6B7AA6]">
            Role
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {ROLES.map((item) => {
              const active = role === item.value;

              return (
                <Pressable
                  key={item.value}
                  onPress={() => setRole(item.value)}
                  className={`px-4 py-3 rounded-full border ${active ? 'bg-[#173AA8] border-[#173AA8]' : 'bg-[#F7F9FF] border-[#E4EAF7]'}`}
                >
                  <Text className={`font-bold text-[12px] ${active ? 'text-white' : 'text-[#56627F]'}`}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="flex-row items-center justify-between rounded-2xl bg-[#F7F9FF] border border-dashed border-[#DDE6FF] px-4 py-3">
          <View className="flex-1 pr-3">
            <Text className="text-[#102A72] text-[13px] font-bold">Invitation policy</Text>
            <Text className="text-[#7483A6] text-[12px] mt-1 leading-4">
              The invite will expire automatically after 10 minutes. If it expires, send a new one.
            </Text>
          </View>
          <MaterialIcons name="schedule" size={22} color="var(--c-brand-fg)" />
        </View>

        <Pressable
          onPress={submit}
          disabled={loading || clubsLoading || !clubId || !hasClubs}
          className="rounded-2xl bg-[#173AA8] py-4 items-center justify-center mt-1 shadow-lg shadow-blue-900/20 disabled:opacity-60"
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-black tracking-[0.16em] uppercase text-[12px]">
              Send Invite
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
