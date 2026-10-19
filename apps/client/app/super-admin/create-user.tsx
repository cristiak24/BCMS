import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import PageContainer from '../../components/ui/PageContainer';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import SelectField from '../../components/ui/SelectField';
import { FormField } from '../../components/ui/FormField';
import { Skeleton } from '../../components/ui/Skeleton';
import CreateClubDialog from '../../components/super-admin/CreateClubDialog';
import { Notice, Panel } from '../../components/super-admin/ui';
import { CLUB_ROLE_ORDER, formatDate, roleLabel } from '../../components/super-admin/format';
import { superAdminApi, type InvitableRole } from '../../services/superAdminApi';

const ROLE_HINTS: Record<InvitableRole, string> = {
  admin: 'Gestionează tot clubul: echipe, conturi, plăți, documente.',
  coach: 'Își vede echipele, programul, prezența și statisticile.',
  staff: 'Program, statistici live și documente pentru staff.',
  accountant: 'Doar finanțe, documente și agendă.',
  player: 'Își vede programul, prezența și plățile.',
  parent: 'Urmărește copiii: program, prezență, plăți.',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Sent = { email: string; inviteUrl: string; expiresAt: string; clubId: number; clubName: string; emailSent: boolean };

export default function InviteUserScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ clubId?: string }>();
  const [clubs, setClubs] = useState<Array<{ id: number; name: string }> | null>(null);
  const [clubId, setClubId] = useState(params.clubId ?? '');
  const [role, setRole] = useState<InvitableRole>('admin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<{ fullName?: string; email?: string; club?: string; form?: string }>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const [copied, setCopied] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const loadClubs = () => superAdminApi.listClubs()
    .then((response) => setClubs(response.clubs.map((club) => ({ id: club.id, name: club.name })).sort((a, b) => a.name.localeCompare(b.name, 'ro'))))
    .catch((error) => {
      setClubs([]);
      setErrors({ form: error instanceof Error ? error.message : 'Nu am putut încărca cluburile.' });
    });

  useEffect(() => { void loadClubs(); }, []);

  const clubOptions = useMemo(() => [
    { key: '', label: 'Alege clubul…' },
    ...(clubs ?? []).map((club) => ({ key: String(club.id), label: club.name })),
  ], [clubs]);

  const submit = async () => {
    const name = fullName.trim().replace(/\s+/g, ' ');
    const mail = email.trim().toLowerCase();
    const next: typeof errors = {};
    if (!name) next.fullName = 'Scrie numele complet.';
    if (!mail) next.email = 'Scrie adresa de email.';
    else if (!EMAIL_RE.test(mail)) next.email = 'Adresa de email nu pare validă.';
    if (!clubId) next.club = 'Alege clubul.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSending(true);
    try {
      const { invitation } = await superAdminApi.createInvitation({ email: mail, fullName: name, role, clubId: Number(clubId) });
      setSent({
        email: invitation.email,
        inviteUrl: invitation.inviteUrl,
        emailSent: invitation.emailSent !== false,
        expiresAt: invitation.expiresAt,
        clubId: Number(clubId),
        clubName: clubs?.find((club) => String(club.id) === clubId)?.name ?? '',
      });
      setCopied(false);
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : 'Nu am putut trimite invitația.' });
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setSent(null);
    setFullName('');
    setEmail('');
    setErrors({});
  };

  const copyLink = () => {
    if (!sent) return;
    void navigator.clipboard?.writeText(sent.inviteUrl).then(() => setCopied(true));
  };

  return (
    <PageContainer>
      <PageHeader
        keepTitleOnMobile
        title="Invită utilizator"
        subtitle="Persoana primește un link pe email și își creează contul direct în club, cu rolul ales."
      />

      <View className="w-full max-w-[720px] gap-4">
        {sent ? (
          <Panel>
            <View className="items-center text-center gap-2 py-2">
              <View className="w-12 h-12 rounded-full items-center justify-center" style={{ backgroundColor: sent.emailSent ? 'var(--c-success-bg)' : 'var(--c-warning-bg)' }}>
                <MaterialIcons name={sent.emailSent ? 'mark-email-read' : 'link'} size={24} color={sent.emailSent ? 'var(--c-success-fg)' : 'var(--c-warning-fg)'} />
              </View>
              <Text className="text-[17px] font-bold text-center" style={{ color: 'var(--c-ink)' }}>{sent.emailSent ? 'Invitație trimisă' : 'Invitație creată — emailul nu a plecat'}</Text>
              <Text className="t-meta text-center" style={{ color: 'var(--c-muted)' }}>
                {sent.email} · {roleLabel(role)} la {sent.clubName}. Linkul expiră pe {formatDate(sent.expiresAt)}.
                {sent.emailSent ? '' : ' Copiază linkul de mai jos și trimite-l tu.'}
              </Text>
            </View>
            <View className="mt-4 flex-row items-center gap-2 rounded-[11px] border px-3 h-11" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' }}>
              <MaterialIcons name="link" size={16} color="var(--c-faint)" />
              <Text className="flex-1 min-w-0 text-[13px]" style={{ color: 'var(--c-ink-soft)' }} numberOfLines={1}>{sent.inviteUrl}</Text>
              <Pressable onPress={copyLink} accessibilityRole="button" className="ui-press flex-row items-center gap-1 rounded-[8px] px-2 py-1 hover:bg-[var(--c-surface-3)]">
                <MaterialIcons name={copied ? 'check' : 'content-copy'} size={15} color="var(--c-brand-fg)" />
                <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>{copied ? 'Copiat' : 'Copiază'}</Text>
              </Pressable>
            </View>
            <Text className="t-meta mt-1.5" style={{ color: 'var(--c-faint)' }}>Dacă emailul nu ajunge, trimite linkul pe WhatsApp sau SMS.</Text>
            <View className="flex-row flex-wrap justify-end gap-2 mt-4">
              <Button label="Deschide clubul" icon="apartment" onPress={() => router.push(`/super-admin/clubs/${sent.clubId}`)} />
              <Button label="Invită încă o persoană" icon="person-add" variant="primary" onPress={reset} />
            </View>
          </Panel>
        ) : (
          <Panel>
            <View className="gap-4">
              {errors.form ? <Notice tone="warning">{errors.form}</Notice> : null}

              <View>
                <Text className="text-[12.5px] font-semibold mb-1.5" style={{ color: 'var(--c-ink-soft)' }}>Club</Text>
                {clubs == null ? (
                  <Skeleton className="h-9 rounded-[10px]" />
                ) : clubs.length === 0 ? (
                  <View className="flex-row items-center justify-between gap-3 rounded-[11px] border border-dashed px-3 py-3" style={{ borderColor: 'var(--c-border-strong)' }}>
                    <Text className="t-meta flex-1" style={{ color: 'var(--c-muted)' }}>Nu există niciun club. Creează unul înainte de a invita.</Text>
                    <Button size="sm" label="Club nou" icon="add" onPress={() => setCreateOpen(true)} />
                  </View>
                ) : (
                  <View className="flex-row gap-2">
                    <SelectField<string>
                      label="Club"
                      icon="apartment"
                      value={clubId}
                      onChange={(next) => { setClubId(next); setErrors((current) => ({ ...current, club: undefined })); }}
                      options={clubOptions}
                      className="flex-1"
                    />
                    <Button label="Club nou" icon="add" iconOnlyOnMobile onPress={() => setCreateOpen(true)} />
                  </View>
                )}
                {errors.club ? <Text className="text-[12px] font-semibold mt-1.5" style={{ color: 'var(--c-danger-fg)' }}>{errors.club}</Text> : null}
              </View>

              <View>
                <Text className="text-[12.5px] font-semibold mb-1.5" style={{ color: 'var(--c-ink-soft)' }}>Rol</Text>
                <View className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {CLUB_ROLE_ORDER.map((key) => {
                    const active = key === role;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => setRole(key)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        className="ui-press rounded-[11px] border px-3 py-2.5"
                        style={{
                          backgroundColor: active ? 'var(--c-surface-tint)' : 'var(--c-surface)',
                          borderColor: active ? 'var(--c-brand-border)' : 'var(--c-border)',
                        } as any}
                      >
                        <View className="flex-row items-center gap-1.5">
                          <MaterialIcons name={active ? 'radio-button-checked' : 'radio-button-unchecked'} size={15} color={active ? 'var(--c-brand-fg)' : 'var(--c-faint)'} />
                          <Text className="text-[13px] font-semibold" style={{ color: active ? 'var(--c-brand-fg)' : 'var(--c-ink)' }}>{roleLabel(key)}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                <Text className="t-meta mt-1.5" style={{ color: 'var(--c-muted)' }}>{ROLE_HINTS[role]}</Text>
              </View>

              <View className="grid sm:grid-cols-2 gap-3">
                <FormField
                  label="Nume complet"
                  icon="person-outline"
                  value={fullName}
                  onChangeText={(value: string) => { setFullName(value); setErrors((current) => ({ ...current, fullName: undefined })); }}
                  placeholder="ex. Andrei Popescu"
                  autoCapitalize="words"
                  error={errors.fullName}
                />
                <FormField
                  label="Email"
                  icon="mail-outline"
                  value={email}
                  onChangeText={(value: string) => { setEmail(value); setErrors((current) => ({ ...current, email: undefined })); }}
                  placeholder="nume@exemplu.ro"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  error={errors.email}
                  onSubmitEditing={() => void submit()}
                />
              </View>

              <View className="flex-row justify-end">
                <Button label="Trimite invitația" icon="send" variant="primary" loading={sending} disabled={!clubs?.length} onPress={() => void submit()} />
              </View>
            </View>
          </Panel>
        )}
      </View>

      <CreateClubDialog
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(club) => {
          setClubs((current) => [...(current ?? []), { id: club.id, name: club.name }].sort((a, b) => a.name.localeCompare(b.name, 'ro')));
          setClubId(String(club.id));
        }}
      />
    </PageContainer>
  );
}
