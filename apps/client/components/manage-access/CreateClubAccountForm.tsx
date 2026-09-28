import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import GlassCard from '../ui/GlassCard';
import { clubAdminApi, type ClubAdminAccountRole } from '../../services/clubAdminApi';

const ROLE_OPTIONS: { label: string; value: ClubAdminAccountRole; description: string; icon: 'sports' | 'person' }[] = [
    { label: 'Coach', value: 'coach', description: 'Can help run trainings and club operations.', icon: 'sports' },
    { label: 'Player', value: 'player', description: 'Can join the club roster and complete registration.', icon: 'person' },
];

type Props = {
    onCreated?: () => void;
};

// Colours come from tokens only (no [#hex] / bg-white utilities) so the card
// reads as one surface in both themes — the old light-blue header strip and
// pale input fills showed up as an odd second background in dark mode.
const labelStyle = { color: 'var(--c-muted)' } as const;

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
    return (
        <View className="gap-1.5">
            <Text className="text-[12px] font-semibold" style={labelStyle}>{label}</Text>
            {children}
            {error ? (
                <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-danger)' }}>{error}</Text>
            ) : hint ? (
                <Text className="text-[12px] leading-4" style={{ color: 'var(--c-faint)' }}>{hint}</Text>
            ) : null}
        </View>
    );
}

export default function CreateClubAccountForm({ onCreated }: Props) {
    const [label, setLabel] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<ClubAdminAccountRole>('coach');
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<{ label?: string; email?: string; }>({});

    const inputStyle = (hasError: boolean) => ({
        backgroundColor: 'var(--c-surface-2)',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: hasError ? 'var(--c-danger)' : 'var(--c-border)',
        color: 'var(--c-ink)',
    }) as any;

    const submit = async () => {
        const normalizedLabel = label.trim().replace(/\s+/g, ' ');
        const normalizedEmail = email.trim().toLowerCase();

        const nextErrors: typeof errors = {};
        if (!normalizedLabel) {
            nextErrors.label = 'Add a label so you can recognise this invite.';
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
                // Admin-only identifier. The member's real first/last name is
                // whatever they enter when they register from the invite.
                fullName: normalizedLabel,
                role,
            });
            Alert.alert('Invite sent', `${response.invitation.email} will receive the registration invite shortly.`);
            setLabel('');
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
        <GlassCard className="p-0">
            <View className="px-5 md:px-6 py-5 border-b" style={{ borderColor: 'var(--c-border)' } as any}>
                <View className="flex-row items-start justify-between gap-4">
                    <View className="flex-1">
                        <Text className="text-[18px] font-bold tracking-tight" style={{ color: 'var(--c-ink-strong)' }}>New invite</Text>
                        <Text className="text-[13px] mt-1 leading-5" style={{ color: 'var(--c-muted)' }}>
                            Send a secure invite for a coach or player inside your club.
                        </Text>
                    </View>
                    <View className="w-10 h-10 rounded-[10px] items-center justify-center" style={{ backgroundColor: 'var(--c-surface-tint)' } as any}>
                        <MaterialIcons name="person-add-alt-1" size={20} color="var(--c-brand-fg)" />
                    </View>
                </View>
            </View>

            <View className="p-5 md:p-6 gap-5">
                <View className="flex-col md:flex-row gap-4">
                    <View className="flex-1">
                        <Field
                            label="Label (admins only)"
                            hint="Only admins see this. The member sets their real name when they create the account."
                            error={errors.label}
                        >
                            <TextInput
                                value={label}
                                onChangeText={(value) => {
                                    setLabel(value);
                                    setErrors((current) => ({ ...current, label: undefined }));
                                }}
                                placeholder="e.g. Andrei U14 goalkeeper"
                                autoCapitalize="sentences"
                                className="rounded-[10px] border px-3.5 h-11 text-[14px]"
                                style={inputStyle(Boolean(errors.label))}
                                placeholderTextColor="var(--c-faint)"
                            />
                        </Field>
                    </View>
                    <View className="flex-1">
                        <Field label="Email address" error={errors.email}>
                            <TextInput
                                value={email}
                                onChangeText={(value) => {
                                    setEmail(value);
                                    setErrors((current) => ({ ...current, email: undefined }));
                                }}
                                placeholder="name@example.com"
                                autoCapitalize="none"
                                keyboardType="email-address"
                                className="rounded-[10px] border px-3.5 h-11 text-[14px]"
                                style={inputStyle(Boolean(errors.email))}
                                placeholderTextColor="var(--c-faint)"
                            />
                        </Field>
                    </View>
                </View>

                <View className="gap-1.5">
                    <Text className="text-[12px] font-semibold" style={labelStyle}>Role</Text>
                    <View className="flex-col md:flex-row gap-3">
                        {ROLE_OPTIONS.map((option) => {
                            const active = role === option.value;

                            return (
                                <Pressable
                                    key={option.value}
                                    onPress={() => setRole(option.value)}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected: active }}
                                    className="flex-1 rounded-[12px] border px-4 py-3.5"
                                    style={{
                                        backgroundColor: active ? 'var(--c-surface-tint)' : 'var(--c-surface)',
                                        borderColor: active ? 'var(--c-brand-border)' : 'var(--c-border)',
                                    } as any}
                                >
                                    <View className="flex-row items-start gap-3">
                                        <MaterialIcons name={option.icon} size={20} color={active ? 'var(--c-brand-fg)' : 'var(--c-muted)'} />
                                        <View className="flex-1">
                                            <Text className="font-bold text-[14px]" style={{ color: active ? 'var(--c-brand-fg)' : 'var(--c-ink)' }}>
                                                {option.label}
                                            </Text>
                                            <Text className="text-[12px] mt-0.5 leading-4" style={{ color: 'var(--c-muted)' }}>
                                                {option.description}
                                            </Text>
                                        </View>
                                        <MaterialIcons
                                            name={active ? 'radio-button-checked' : 'radio-button-unchecked'}
                                            size={18}
                                            color={active ? 'var(--c-brand-fg)' : 'var(--c-faint)'}
                                        />
                                    </View>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>

                <View className="flex-row items-start gap-2.5">
                    <MaterialIcons name="schedule" size={16} color="var(--c-faint)" />
                    <Text className="flex-1 text-[12px] leading-4" style={{ color: 'var(--c-muted)' }}>
                        Invites expire automatically after 10 minutes and can be revoked from Manage Accounts.
                    </Text>
                </View>

                <Pressable
                    onPress={submit}
                    disabled={loading}
                    className={`rounded-[10px] h-11 flex-row items-center justify-center gap-2 ${loading ? 'opacity-60' : ''}`}
                    style={{ backgroundColor: 'var(--c-brand-surface)', boxShadow: 'var(--e-brand)' } as any}
                >
                    {loading ? (
                        <ActivityIndicator color="var(--c-on-brand)" />
                    ) : (
                        <>
                            <MaterialIcons name="send" size={16} color="var(--c-on-brand)" />
                            <Text className="font-semibold text-[14px]" style={{ color: 'var(--c-on-brand)' }}>
                                Send invite
                            </Text>
                        </>
                    )}
                </Pressable>
            </View>
        </GlassCard>
    );
}
