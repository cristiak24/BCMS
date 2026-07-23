import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import GlassCard from '../ui/GlassCard';
import { apiFetch } from '../../services/apiClient';

type InviteResult = {
  inviteToken: string;
  email: string;
  clubName?: string;
  message?: string;
};

type Props = {
  onInviteCreated?: (invite: InviteResult) => void;
};

export default function InviteForm({ onInviteCreated }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [clubName, setClubName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInvite, setSuccessInvite] = useState<InviteResult | null>(null);
  const [createdInvites, setCreatedInvites] = useState<InviteResult[]>([]);

  const handleCreateInvite = async () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedClubName = clubName.trim();

    setError(null);

    if (!trimmedName) {
      setError('User name is required.');
      return;
    }

    if (!trimmedEmail) {
      setError('Admin email is required.');
      return;
    }

    if (!trimmedClubName) {
      setError('Club name is required.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await apiFetch<{ success: boolean; invitation: { inviteUrl?: string } }>(
        '/auth/superadmin/create-admin-invite',
        {
          method: 'POST',
          body: JSON.stringify({ name: trimmedName, email: trimmedEmail, clubName: trimmedClubName }),
        },
      );

      const invite: InviteResult = {
        inviteToken: response.invitation.inviteUrl ?? '',
        email: trimmedEmail,
        clubName: trimmedClubName,
        message: 'Invite sent.',
      };

      setSuccessInvite(invite);
      setCreatedInvites((current) => [invite, ...current].slice(0, 10));
      onInviteCreated?.(invite);
      setName('');
      setEmail('');
      setClubName('');
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Unable to create club admin invite.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GlassCard className="p-6 md:p-7 border border-slate-100">
      <View className="flex-row items-start justify-between gap-4 mb-6">
        <View className="flex-1">
          <Text className="text-2xl font-black text-slate-900">Create Club Admin</Text>
          <Text className="text-slate-500 mt-2">
            Create a club on demand, issue an admin invite, and share the signup link.
          </Text>
        </View>
        <View className="w-12 h-12 rounded-2xl bg-blue-50 items-center justify-center">
          <MaterialIcons name="admin-panel-settings" size={24} color="var(--c-blue-deep)" />
        </View>
      </View>

      <View className="gap-4">
        <View>
          <Text className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
            User name
          </Text>
          <View className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="John Doe"
              placeholderTextColor="var(--c-faint)"
              className="text-slate-900 font-medium"
            />
          </View>
        </View>

        <View>
          <Text className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
            Admin email
          </Text>
          <View className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="admin@club.com"
              placeholderTextColor="var(--c-faint)"
              className="text-slate-900 font-medium"
            />
          </View>
        </View>

        <View>
          <Text className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
            Club name
          </Text>
          <View className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <TextInput
              value={clubName}
              onChangeText={setClubName}
              placeholder="Aurora FC"
              placeholderTextColor="var(--c-faint)"
              className="text-slate-900 font-medium"
            />
          </View>
        </View>

        {error ? (
          <View className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
            <Text className="text-red-700 font-semibold">{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={handleCreateInvite}
          disabled={submitting}
          className={`rounded-2xl px-5 py-4 flex-row items-center justify-center ${submitting ? 'bg-blue-500' : 'bg-blue-700'}`}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <MaterialIcons name="send" size={18} color="#FFFFFF" />
          )}
          <Text className="text-white font-black uppercase tracking-[0.2em] text-[11px] ml-2">
            {submitting ? 'Sending invite' : 'Send admin invite'}
          </Text>
        </Pressable>

        {successInvite ? (
          <View className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
            <Text className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700">
              Invite created
            </Text>
            <Text className="text-emerald-950 font-bold mt-1">{successInvite.email}</Text>
            {successInvite.clubName ? (
              <Text className="text-emerald-700 text-sm mt-2">Club: {successInvite.clubName}</Text>
            ) : null}
            <Text className="text-emerald-700 text-xs mt-2 font-mono break-all">
              Token: {successInvite.inviteToken}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="mt-6">
        <Text className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3">
          Created invites (this session)
        </Text>

        {createdInvites.length === 0 ? (
          <View className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6">
            <Text className="text-slate-500 text-sm text-center">
              No club admin invites created yet in this session.
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            {createdInvites.map((invite, idx) => (
              <View key={idx} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-slate-900 font-black">{invite.email}</Text>
                    {invite.clubName ? (
                      <Text className="text-slate-500 text-sm mt-1">{invite.clubName}</Text>
                    ) : null}
                  </View>
                  <View className="items-end">
                    <Text className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-700">
                      active
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </GlassCard>
  );
}
