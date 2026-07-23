import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import GlassCard from '../ui/GlassCard';
import { clubAdminApi, type ClubAdminAccountRole } from '../../services/clubAdminApi';

const ROLE_OPTIONS: { label: string; value: ClubAdminAccountRole; description: string; }[] = [
    { label: 'Coach', value: 'coach', description: 'Can help run trainings and club operations.' },
    { label: 'Player', value: 'player', description: 'Can join the club roster and complete registration.' },
];

type Props = {
    onCreated?: () => void;
};

export default function CreateClubAccountForm({ onCreated }: Props) {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<ClubAdminAccountRole>('coach');
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<{ fullName?: string; email?: string; }>({});

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

        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) {
            return;
        }

        try {
            setLoading(true);
            const response = await clubAdminApi.createInvitation({
                email: normalizedEmail,
                fullName: normalizedFullName,
                role,
            });
            Alert.alert('Invite sent', `${response.invitation.email} will receive the registration invite shortly.`);
            setFullName('');
            setEmail('');
            setRole('coach');
            setErrors({});
            onCreated?.();
        } catch (error) {
            Alert.alert('Invite failed', error instanceof Error ? error.message : 'Could not create the account invite.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <GlassCard className="p-0 overflow-hidden">
            <View className="px-6 py-5 border-b border-slate-200 bg-[#FBFCFF]">
                <View className="flex-row items-start justify-between gap-4">
                    <View className="flex-1">
                        <Text className="text-[#102A72] text-[24px] font-black tracking-tight">Create account</Text>
                        <Text className="text-[#7483A6] text-[13px] mt-2 leading-5">
                            Send a secure invite for a coach or player inside your club.
                        </Text>
                    </View>
                    <View className="w-12 h-12 rounded-2xl bg-[#E7EEFF] items-center justify-center">
                        <MaterialIcons name="person-add-alt-1" size={24} color="var(--c-brand-fg)" />
                    </View>
                </View>
            </View>

            <View className="p-6 gap-4">
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

                <View className="gap-2">
                    <Text className="text-[11px] font-black uppercase tracking-[0.2em] text-[#6B7AA6]">Role</Text>
                    <View className="gap-3">
                        {ROLE_OPTIONS.map((option) => {
                            const active = role === option.value;

                            return (
                                <Pressable
                                    key={option.value}
                                    onPress={() => setRole(option.value)}
                                    className={`rounded-2xl border px-4 py-4 ${active ? 'border-[#173AA8] bg-[#EEF4FF]' : 'border-slate-200 bg-white'}`}
                                >
                                    <View className="flex-row items-start justify-between gap-4">
                                        <View className="flex-1">
                                            <Text className={`font-black text-[15px] ${active ? 'text-[#173AA8]' : 'text-[#102A72]'}`}>
                                                {option.label}
                                            </Text>
                                            <Text className="text-[#7483A6] text-[12px] mt-1 leading-5">
                                                {option.description}
                                            </Text>
                                        </View>
                                        {active ? <MaterialIcons name="check-circle" size={22} color="var(--c-brand-fg)" /> : null}
                                    </View>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>

                <View className="flex-row items-center justify-between rounded-2xl bg-[#F7F9FF] border border-dashed border-[#DDE6FF] px-4 py-3">
                    <View className="flex-1 pr-3">
                        <Text className="text-[#102A72] text-[13px] font-bold">Invitation policy</Text>
                        <Text className="text-[#7483A6] text-[12px] mt-1 leading-4">
                            Invites expire automatically after 10 minutes and can be revoked from Manage Accounts.
                        </Text>
                    </View>
                    <MaterialIcons name="schedule" size={22} color="var(--c-brand-fg)" />
                </View>

                <Pressable
                    onPress={submit}
                    disabled={loading}
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
        </GlassCard>
    );
}
