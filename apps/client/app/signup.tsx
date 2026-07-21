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
import { Link, useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import { LinearGradient } from '@/src/web/linearGradient';
import GlassCard from '../components/ui/GlassCard';
import AuraButton from '../components/ui/AuraButton';
import { authApi, type InviteDetails } from '../services/authApi';
import { getHomeRouteForRole } from '../utils/authSession';
import { useFirebaseAuth } from '../context/AuthContext';
import { firebaseAuth } from '../config/firebase';
import { LoadingScreen } from '../components/ui/ScreenState';

type SignupRole = 'player' | 'coach';

const PUBLIC_ROLE_OPTIONS: {
  role: SignupRole;
  label: string;
  hint: string;
  icon: keyof typeof MaterialIcons.glyphMap;
}[] = [
  { role: 'player', label: 'Player', hint: 'Basic member access for athletes.', icon: 'sports-basketball' },
  { role: 'coach', label: 'Coach', hint: 'Team-level access for coaches.', icon: 'sports' },
];

export default function Signup() {
  const router = useRouter();
  const { session, initializing, reloadSession } = useFirebaseAuth();
  const params = useLocalSearchParams<{ inviteToken?: string }>();
  const inviteToken = typeof params.inviteToken === 'string' ? params.inviteToken : '';

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<SignupRole>('player');
  const [inviteDetails, setInviteDetails] = useState<InviteDetails | null>(null);
  const [inviteLoading, setInviteLoading] = useState(Boolean(inviteToken));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if already logged in
  useEffect(() => {
    if (!initializing && session) {
      router.replace(getHomeRouteForRole(session.role));
    }
  }, [initializing, session, router]);

  // Validate invite token on mount
  useEffect(() => {
    let active = true;

    if (!inviteToken) {
      setInviteLoading(false);
      return;
    }

    (async () => {
      try {
        const details = await authApi.getInviteDetails(inviteToken);
        if (!active) return;
        setInviteDetails(details);
        if (details.email) {
          setEmail(details.email);
        }
      } catch (inviteError) {
        if (!active) return;
        setError(
          inviteError instanceof Error ? inviteError.message : 'This invite link is invalid or expired.',
        );
      } finally {
        if (active) setInviteLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [inviteToken]);

  const roleLocked = Boolean(inviteDetails);
  const emailLocked = Boolean(inviteDetails?.email);
  const resolvedRole = useMemo(() => (inviteDetails ? inviteDetails.role : role), [inviteDetails, role]);

  const handleSignup = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      setError('First name, last name, email and password are required.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await authApi.signup({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        password,
        role: inviteDetails ? undefined : role,
        inviteToken: inviteToken || undefined,
      });

      if (!result.success) {
        setError(result.error ?? 'Signup failed.');
        return;
      }

      await firebaseAuth.currentUser?.getIdToken(true);
      await reloadSession();
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : 'Signup failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (initializing) {
    return <LoadingScreen message="Checking your session..." backgroundColor="#FFFFFF" color="#2563EB" />;
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-slate-50"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 px-4 py-10 items-center justify-center">
          <LinearGradient
            colors={['#EFF6FF', '#F8FAFC', '#FFFFFF']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />

          <View className="w-full max-w-md relative">
            <GlassCard className="p-6 md:p-8 border border-slate-200 bg-white/95 rounded-lg">
              {/* Header */}
              <View className="items-center mb-6">
                <View className="w-16 h-16 rounded-lg bg-blue-700 items-center justify-center mb-4">
                  <MaterialIcons name="person-add-alt-1" size={30} color="#FFFFFF" />
                </View>
                <Text className="text-3xl font-black text-slate-900 text-center">Create Account</Text>
                <Text className="text-slate-500 text-center mt-2 text-sm">
                  {inviteToken
                    ? 'Complete your invite to get started.'
                    : 'Join as a Player or Coach. Admins are invited by club managers.'}
                </Text>
              </View>

              {/* Error */}
              {error ? (
                <View className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 mb-4">
                  <Text className="text-red-700 font-semibold text-center">{error}</Text>
                </View>
              ) : null}

              {/* Invite loading */}
              {inviteLoading ? (
                <View className="items-center justify-center py-6">
                  <ActivityIndicator size="small" color="#2563EB" />
                  <Text className="text-slate-500 mt-2">Validating invite…</Text>
                </View>
              ) : null}

              {/* Invite badge */}
              {inviteDetails && !inviteLoading ? (
                <View className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-4 mb-4">
                  <Text className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-700">
                    Invite locked
                  </Text>
                  {inviteDetails.email ? (
                    <Text className="text-blue-950 font-bold mt-1">{inviteDetails.email}</Text>
                  ) : null}
                  <Text className="text-blue-700 text-sm mt-2">
                    Joining as {inviteDetails.role}{inviteDetails.clubName ? ` for ${inviteDetails.clubName}` : ''}
                  </Text>
                </View>
              ) : null}

              {/* Form fields */}
              <View className="gap-4">
                <View>
                  <Text className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
                    First name
                  </Text>
                  <TextInput
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="Maria"
                    placeholderTextColor="#94A3B8"
                    autoComplete="given-name"
                    textContentType="givenName"
                    returnKeyType="next"
                    className="rounded-lg border border-slate-200 bg-white px-4 py-4 text-slate-900"
                  />
                </View>

                <View>
                  <Text className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
                    Last name
                  </Text>
                  <TextInput
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Popescu"
                    placeholderTextColor="#94A3B8"
                    autoComplete="family-name"
                    textContentType="familyName"
                    returnKeyType="next"
                    className="rounded-lg border border-slate-200 bg-white px-4 py-4 text-slate-900"
                  />
                </View>

                <View>
                  <Text className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
                    Email
                  </Text>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    returnKeyType="next"
                    editable={!emailLocked}
                    placeholder="you@club.com"
                    placeholderTextColor="#94A3B8"
                    className={`rounded-lg border px-4 py-4 text-slate-900 ${
                      emailLocked ? 'border-slate-200 bg-slate-100' : 'border-slate-200 bg-white'
                    }`}
                  />
                </View>

                <View>
                  <Text className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
                    Password
                  </Text>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    placeholder="Password"
                    placeholderTextColor="#94A3B8"
                    autoComplete="new-password"
                    textContentType="newPassword"
                    returnKeyType="done"
                    onSubmitEditing={handleSignup}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-4 text-slate-900"
                  />
                </View>

                {/* Role selector — only for public signup */}
                {!roleLocked ? (
                  <View>
                    <Text className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
                      Role
                    </Text>
                    <View className="gap-3">
                      {PUBLIC_ROLE_OPTIONS.map((option) => {
                        const active = option.role === role;
                        return (
                          <Pressable
                            key={option.role}
                            onPress={() => setRole(option.role)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            className={`rounded-lg border px-4 py-4 flex-row items-center justify-between ${
                              active ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white'
                            }`}
                          >
                            <View className="flex-row items-center flex-1 pr-3">
                              <View
                                className={`w-11 h-11 rounded-full items-center justify-center mr-3 ${
                                  active ? 'bg-blue-600' : 'bg-slate-100'
                                }`}
                              >
                                <MaterialIcons
                                  name={option.icon}
                                  size={20}
                                  color={active ? '#FFFFFF' : '#64748B'}
                                />
                              </View>
                              <View className="flex-1">
                                <Text
                                  className={`font-black ${active ? 'text-blue-700' : 'text-slate-800'}`}
                                >
                                  {option.label}
                                </Text>
                                <Text className="text-slate-500 text-xs mt-1">{option.hint}</Text>
                              </View>
                            </View>
                            {active ? (
                              <MaterialIcons name="check-circle" size={22} color="#2563EB" />
                            ) : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                <AuraButton
                  label={
                    inviteDetails
                      ? 'Complete Invite Signup'
                      : `Create ${resolvedRole === 'coach' ? 'Coach' : 'Player'} Account`
                  }
                  onPress={handleSignup}
                  loading={submitting}
                />
              </View>

              <View className="mt-6 items-center">
                <Text className="text-slate-500 text-sm">
                  Already have an account?{' '}
                  <Link href="/login" className="text-blue-700 font-bold">
                    Log in
                  </Link>
                </Text>
              </View>
            </GlassCard>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
