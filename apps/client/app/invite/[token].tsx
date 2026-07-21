import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import { LinearGradient } from '@/src/web/linearGradient';
import { createUserWithEmailAndPassword, deleteUser } from 'firebase/auth';
import { useFirebaseAuth } from '../../context/AuthContext';
import { firebaseAuth } from '../../config/firebase';
import { invitationsApi } from '../../services/invitationsApi';
import { getHomeRouteForRole, type UserRole } from '../../utils/authSession';

type InvitationDetails = Awaited<ReturnType<typeof invitationsApi.validate>>['invitation'];

export default function InviteRegistrationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = useMemo(() => String(params.token ?? '').trim(), [params.token]);
  const { reloadSession } = useFirebaseAuth();

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InvitationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    if (!token) {
      setError('Missing invite token.');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const response = await invitationsApi.validate(token);
        if (!active) return;

        setInvite(response.invitation);
        setError(response.invitation.message);
      } catch (inviteError) {
        if (!active) return;
        setInvite(null);
        setError(inviteError instanceof Error ? inviteError.message : 'This invitation is invalid or expired.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [token]);

  const handleSubmit = async () => {
    if (!invite) {
      return;
    }

    if (!firstName.trim() || !lastName.trim() || !password || !confirmPassword) {
      setError('First name, last name, password and confirmation are required.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    setError(null);

    let createdAccount = false;
    let inviteAccepted = false;

    try {
      await createUserWithEmailAndPassword(firebaseAuth, invite.email, password);
      createdAccount = true;

      const inviteResult = await invitationsApi.accept(token, {
        email: invite.email,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || undefined,
      });
      inviteAccepted = true;

      await firebaseAuth.currentUser?.getIdToken(true);
      try {
        await reloadSession();
      } catch (sessionError) {
        console.warn('[InviteRegistration] Session reload after invite accept failed:', sessionError);
      }

      const nextRoute = getHomeRouteForRole(inviteResult.role as UserRole);
      router.replace(nextRoute);
    } catch (inviteError) {
      if (createdAccount && !inviteAccepted && firebaseAuth.currentUser) {
        try {
          await deleteUser(firebaseAuth.currentUser);
        } catch {
          // Best effort rollback only.
        }
      }

      setError(inviteError instanceof Error ? inviteError.message : 'Could not complete registration.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-[#EEF3FF]">
        <ActivityIndicator size="large" color="#173AA8" />
      </View>
    );
  }

  const invalidInvite = !invite || Boolean(error && !invite?.canAccept);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-[#EEF3FF]"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, padding: 20 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={['#EAF1FF', '#F7F9FF', '#EEF3FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View className="absolute top-16 left-[-40px] w-40 h-40 rounded-full bg-[#D8E4FF]/60" />
        <View className="absolute bottom-12 right-[-48px] w-56 h-56 rounded-full bg-[#CFE2FF]/50" />

        <View className="w-full max-w-[1100px] self-center flex-1 justify-center">
          <View className="flex-col gap-5 lg:flex-row">
            <View className="lg:flex-1 rounded-[32px] border border-[#E8EEFF] bg-white p-6 shadow-sm">
              <View className="flex-row items-start justify-between gap-4">
                <View className="flex-1">
                  <Text className="text-[#173AA8] text-[11px] font-black tracking-[0.3em] uppercase">
                    Secure Invite
                  </Text>
                  <Text className="text-[#102A72] text-[30px] font-black tracking-tight mt-2">
                    Complete your registration
                  </Text>
                  <Text className="text-[#7483A6] text-[14px] leading-6 mt-3">
                    This link is valid for 10 minutes. Your email, club and role are locked from the invitation.
                  </Text>
                </View>
                <View className="w-12 h-12 rounded-2xl bg-[#E7EEFF] items-center justify-center">
                  <MaterialIcons name="verified-user" size={24} color="#173AA8" />
                </View>
              </View>

              {error ? (
                <View className={`mt-5 rounded-2xl border px-4 py-3 ${invalidInvite ? 'bg-[#FFF4F4] border-[#FFD1D1]' : 'bg-[#F4F7FF] border-[#DDE6FF]'}`}>
                  <Text className={`font-semibold ${invalidInvite ? 'text-[#B42318]' : 'text-[#173AA8]'}`}>
                    {error}
                  </Text>
                </View>
              ) : null}

              {invite ? (
                <View className="mt-5 rounded-[28px] bg-[#F7F9FF] border border-[#E8EEFF] p-5">
                  <View className="flex-row flex-wrap gap-3">
                    <View className="rounded-full bg-white px-4 py-2 border border-[#E8EEFF]">
                      <Text className="text-[#102A72] font-bold text-[12px] uppercase tracking-[0.16em]">
                        {invite.role}
                      </Text>
                    </View>
                    <View className="rounded-full bg-white px-4 py-2 border border-[#E8EEFF]">
                      <Text className="text-[#102A72] font-bold text-[12px] uppercase tracking-[0.16em]">
                        {invite.clubName ?? 'Club'}
                      </Text>
                    </View>
                    <View className="rounded-full bg-white px-4 py-2 border border-[#E8EEFF]">
                      <Text className="text-[#102A72] font-bold text-[12px] uppercase tracking-[0.16em]">
                        Expires in 10 min
                      </Text>
                    </View>
                  </View>

                  <View className="mt-4 gap-3">
                    <View className="rounded-2xl bg-white border border-[#E8EEFF] px-4 py-4">
                      <Text className="text-[11px] font-black uppercase tracking-[0.18em] text-[#6B7AA6]">Email</Text>
                      <Text className="text-[#102A72] font-bold mt-1">{invite.email}</Text>
                    </View>
                    <View className="rounded-2xl bg-white border border-[#E8EEFF] px-4 py-4">
                      <Text className="text-[11px] font-black uppercase tracking-[0.18em] text-[#6B7AA6]">Club</Text>
                      <Text className="text-[#102A72] font-bold mt-1">{invite.clubName ?? 'Club assignment'}</Text>
                    </View>
                  </View>
                </View>
              ) : null}
            </View>

            <View className="lg:w-[460px] rounded-[32px] border border-[#E8EEFF] bg-white p-6 shadow-sm">
              <Text className="text-[#102A72] text-[22px] font-black">Your details</Text>
              <Text className="text-[#7483A6] text-[13px] mt-1 leading-5">
                Fill in your personal information to activate the account.
              </Text>

              <View className="mt-5 gap-3">
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="First name"
                  className="rounded-2xl bg-[#F7F9FF] px-4 py-4 border border-[#DDE6FF] text-[#102A72]"
                  placeholderTextColor="#9AA7C2"
                />
                <TextInput
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Last name"
                  className="rounded-2xl bg-[#F7F9FF] px-4 py-4 border border-[#DDE6FF] text-[#102A72]"
                  placeholderTextColor="#9AA7C2"
                />
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Phone number"
                  keyboardType="phone-pad"
                  className="rounded-2xl bg-[#F7F9FF] px-4 py-4 border border-[#DDE6FF] text-[#102A72]"
                  placeholderTextColor="#9AA7C2"
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  secureTextEntry
                  className="rounded-2xl bg-[#F7F9FF] px-4 py-4 border border-[#DDE6FF] text-[#102A72]"
                  placeholderTextColor="#9AA7C2"
                />
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm password"
                  secureTextEntry
                  className="rounded-2xl bg-[#F7F9FF] px-4 py-4 border border-[#DDE6FF] text-[#102A72]"
                  placeholderTextColor="#9AA7C2"
                />
              </View>

              <View className="mt-5 rounded-2xl border border-dashed border-[#DDE6FF] bg-[#F7F9FF] px-4 py-4">
                <Text className="text-[#102A72] text-[13px] font-bold">Locked invitation data</Text>
                <Text className="text-[#7483A6] text-[12px] mt-1 leading-5">
                  Role and club are prefilled from the invite and cannot be changed on this page.
                </Text>
              </View>

              <Pressable
                onPress={handleSubmit}
                disabled={submitting || !invite?.canAccept}
                className="mt-5 rounded-2xl bg-[#173AA8] py-4 items-center justify-center shadow-lg shadow-blue-900/20"
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-black tracking-[0.16em] uppercase text-[12px]">
                    Activate account
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
