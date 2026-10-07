import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import { teamsApi, type Player } from '../../../services/teamsApi';
import PageContainer from '../../../components/ui/PageContainer';
import PageHero, { GlassStat } from '../../../components/admin/PageHero';
import Button from '../../../components/ui/Button';
import SelectField from '../../../components/ui/SelectField';
import { FormField } from '../../../components/ui/FormField';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ErrorState } from '../../../components/ui/ScreenState';
import { ToastHost, useToasts } from '../../../components/ui/Toast';
import GuardiansPanel from '../../../components/family/GuardiansPanel';
import { AuditEntries } from '../../../components/audit/AuditLogList';
import type { AuditLogEntry } from '../../../services/clubAdminApi';
import { MEDICAL_META, formatDate, medicalStatus } from '../../../components/myclub/teamDisplay';

/**
 * Admin view of one player: identity form, medical visa, payments and family
 * links. Every figure on the page comes from the player record — the old
 * screen padded it with "Specialty camps 0%", a mock match calendar and a
 * "Remove player" button that did nothing.
 */

const PAID = ['paid', 'processed', 'succeeded', 'success'];

function Card({ title, icon, right, children }: { title: string; icon: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View className="ui-rise rounded-[16px] border p-4 md:p-5" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-xs)' } as any}>
      <View className="flex-row items-center gap-2.5 mb-4">
        <View className="w-8 h-8 rounded-[9px] items-center justify-center" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
          <MaterialIcons name={icon} size={17} color="var(--c-brand-fg)" />
        </View>
        <Text className="f-display flex-1 text-[15px] font-bold" style={{ color: 'var(--c-ink-strong)' }}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export default function PlayerProfile() {
  const { id, returnTo } = useLocalSearchParams();
  const router = useRouter();
  const { toasts, showToast, dismissToast } = useToasts();
  const [player, setPlayer] = useState<Player | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [number, setNumber] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [status, setStatus] = useState('active');
  const [medicalExpiry, setMedicalExpiry] = useState('');

  const hydrate = (data: Player) => {
    setFirstName(data.firstName || '');
    setLastName(data.lastName || '');
    setEmail(data.email || '');
    setNumber(data.number?.toString() || '');
    setBirthYear(data.birthYear?.toString() || '');
    setStatus(data.status || 'active');
    setMedicalExpiry(data.medicalCheckExpiry ? new Date(data.medicalCheckExpiry).toISOString().slice(0, 10) : '');
  };

  const [history, setHistory] = useState<AuditLogEntry[] | null>(null);

  const fetchPlayer = useCallback(async () => {
    if (!id) return;
    try {
      setLoadError(null);
      const data = await teamsApi.getPlayerById(parseInt(id as string, 10));
      setPlayer(data);
      hydrate(data);
    } catch {
      setLoadError('Nu am putut încărca jucătorul.');
    }
    // History is secondary: an older server (404) or an error just hides it.
    teamsApi.getPlayerHistory(parseInt(id as string, 10))
      .then((result) => setHistory(result.logs))
      .catch(() => setHistory([]));
  }, [id]);

  useEffect(() => {
    fetchPlayer();
  }, [fetchPlayer]);

  const handleGoBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back('/admin/roster');
      return;
    }
    if (typeof returnTo === 'string' && returnTo.startsWith('/')) {
      router.replace(returnTo as any);
      return;
    }
    router.replace('/admin/roster' as any);
  }, [returnTo, router]);

  const dirty = useMemo(() => {
    if (!player) return false;
    const original = {
      firstName: player.firstName || '',
      lastName: player.lastName || '',
      email: player.email || '',
      number: player.number?.toString() || '',
      birthYear: player.birthYear?.toString() || '',
      status: player.status || 'active',
      medicalExpiry: player.medicalCheckExpiry ? new Date(player.medicalCheckExpiry).toISOString().slice(0, 10) : '',
    };
    return JSON.stringify(original) !== JSON.stringify({ firstName, lastName, email, number, birthYear, status, medicalExpiry });
  }, [player, firstName, lastName, email, number, birthYear, status, medicalExpiry]);

  const numberError = number && !/^\d{1,2}$/.test(number) ? 'Un număr între 0 și 99.' : null;
  const yearError = birthYear && !/^(19|20)\d{2}$/.test(birthYear) ? 'An de forma 2010.' : null;

  const handleSave = async () => {
    if (!player || numberError || yearError) return;
    setSaving(true);
    try {
      const payload: Partial<Player> = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || null,
        number: number ? parseInt(number, 10) : null,
        birthYear: birthYear ? parseInt(birthYear, 10) : null,
        status,
        medicalCheckExpiry: medicalExpiry ? new Date(`${medicalExpiry}T12:00:00Z`).toISOString() : null,
      };
      await teamsApi.updatePlayer(player.id, payload);
      const next = { ...player, ...payload } as Player;
      setPlayer(next);
      hydrate(next);
      showToast({ variant: 'success', message: 'Profilul a fost salvat.' });
    } catch {
      showToast({ variant: 'error', message: 'Nu am putut salva modificările.' });
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <View className="flex-1 items-center justify-center p-6" style={{ backgroundColor: 'var(--c-bg)' }}>
        <ErrorState title="Jucător negăsit" message={loadError} actionLabel="Încearcă din nou" onAction={fetchPlayer} />
      </View>
    );
  }

  if (!player) {
    return (
      <View className="flex-1" style={{ backgroundColor: 'var(--c-bg)' }}>
        <PageContainer>
          <View className="gap-4" accessibilityRole="progressbar" accessibilityLabel="Se încarcă profilul">
            <Skeleton className="h-9 w-28 rounded-[10px]" />
            <Skeleton className="h-[120px] w-full rounded-[16px]" />
            <Skeleton className="h-[320px] w-full rounded-[16px]" />
          </View>
        </PageContainer>
      </View>
    );
  }

  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
  const teams = player.teamNames?.length ? player.teamNames : player.teamName ? [player.teamName] : [];
  const isActive = status.toLowerCase() === 'active';
  const med = medicalStatus(medicalExpiry || null);
  const medMeta = MEDICAL_META[med];

  const currency = (player.paymentCurrency || 'ron').toUpperCase();
  const transactions = player.paymentTransactions ?? [];
  const amountDue = player.outstandingAmount ?? player.amountDue ?? 0;
  const paid = PAID.includes(player.paymentStatus?.toLowerCase() ?? '') && amountDue <= 0;
  const money = (amount: number, cur = currency) => new Intl.NumberFormat('ro-RO', { style: 'currency', currency: cur.toUpperCase() }).format(amount);
  const attendance = player.attendanceRate;

  return (
    <View className="flex-1" style={{ backgroundColor: 'var(--c-bg)' }}>
      <ScrollView className="flex-1" contentContainerClassName="pb-36" showsVerticalScrollIndicator={false}>
        <PageContainer>
          <View className="mb-3 self-start">
            <Button icon="chevron-left" label="Înapoi" size="sm" onPress={handleGoBack} />
          </View>

          <PageHero
            eyebrow="Jucător"
            title={`${firstName} ${lastName}`.trim() || 'Jucător fără nume'}
            subtitle={[player.position, teams.join(', ') || 'Fără echipă'].filter(Boolean).join(' · ')}
            className="mb-5"
            leading={(
              <View className="w-14 h-14 md:w-16 md:h-16 rounded-[16px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                <Text className="f-display text-[20px] md:text-[22px] font-extrabold" style={{ color: 'var(--c-brand-fg)' }}>{initials}</Text>
              </View>
            )}
            actions={(
              <Button
                icon="check"
                label={saving ? 'Se salvează…' : dirty ? 'Salvează' : 'Salvat'}
                variant={dirty ? 'primary' : 'secondary'}
                disabled={!dirty || !!numberError || !!yearError}
                loading={saving}
                onPress={handleSave}
              />
            )}
          >
            <View className="flex-row flex-wrap gap-1.5">
              <View className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1" style={{ backgroundColor: isActive ? 'var(--c-success-bg)' : 'var(--c-surface-3)' }}>
                <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isActive ? 'var(--c-success)' : 'var(--c-faint)' }} />
                <Text className="text-[11.5px] font-semibold" style={{ color: isActive ? 'var(--c-success-fg)' : 'var(--c-muted)' }}>{isActive ? 'Activ' : 'Inactiv'}</Text>
              </View>
              {player.category ? (
                <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: 'var(--c-surface-3)' }}>
                  <Text className="text-[11.5px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>{player.category}</Text>
                </View>
              ) : null}
            </View>
            <View className="grid grid-cols-2 lg:grid-cols-4 gap-2 ui-stagger">
              <GlassStat value={number ? `#${number}` : '—'} label="Tricou" dot="var(--c-purple)" />
              <GlassStat
                value={attendance != null ? Math.round(attendance) : '—'}
                suffix={attendance != null ? '%' : undefined}
                label="Prezență"
                dot={attendance == null ? 'var(--c-faint)' : attendance < 60 ? 'var(--c-danger)' : attendance < 75 ? 'var(--c-warning)' : 'var(--c-success)'}
                bar={attendance ?? undefined}
              />
              <GlassStat value={medMeta.label} label="Viză medicală" dot={medMeta.fg} />
              <GlassStat
                value={paid ? 'La zi' : amountDue > 0 ? money(amountDue) : 'În așteptare'}
                label={amountDue > 0 ? 'Restanță' : 'Plată'}
                dot={paid ? 'var(--c-success)' : amountDue > 0 ? 'var(--c-danger)' : 'var(--c-warning)'}
                danger={amountDue > 0}
              />
            </View>
          </PageHero>

          <View className="flex-col lg:flex-row lg:items-start gap-5">
            <View className="flex-1 min-w-0 gap-5">
              <Card title="Date personale" icon="badge">
                <View className="gap-4">
                  <View className="flex-col sm:flex-row gap-4">
                    <View className="flex-1"><FormField label="Prenume" value={firstName} onChangeText={setFirstName} /></View>
                    <View className="flex-1"><FormField label="Nume" value={lastName} onChangeText={setLastName} /></View>
                  </View>
                  <FormField label="Email" icon="mail-outline" value={email} onChangeText={setEmail} placeholder="nume@exemplu.ro" keyboardType="email-address" autoCapitalize="none" />
                  <View className="flex-col sm:flex-row gap-4">
                    <View className="flex-1"><FormField label="An naștere" value={birthYear} onChangeText={setBirthYear} keyboardType="numeric" placeholder="2010" error={yearError} /></View>
                    <View className="flex-1"><FormField label="Număr tricou" value={number} onChangeText={setNumber} keyboardType="numeric" placeholder="7" error={numberError} /></View>
                  </View>
                  <View>
                    <Text className="text-[12.5px] font-semibold mb-1.5" style={{ color: 'var(--c-ink-soft)' }}>Stare în club</Text>
                    <SelectField
                      label="Stare în club"
                      options={[{ key: 'active', label: 'Activ' }, { key: 'inactive', label: 'Inactiv' }]}
                      value={isActive ? 'active' : 'inactive'}
                      onChange={setStatus}
                      className="sm:max-w-[240px]"
                    />
                  </View>
                </View>
              </Card>

              {Number(id) > 0 ? (
                <GuardiansPanel playerId={Number(id)} playerName={`${firstName} ${lastName}`.trim() || 'jucător'} onNotify={showToast} />
              ) : null}
            </View>

            <View className="w-full lg:w-[380px] gap-5 shrink-0">
              <Card
                title="Viză medicală"
                icon="medical-services"
                right={(
                  <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: medMeta.bg }}>
                    <Text className="text-[11.5px] font-semibold" style={{ color: medMeta.fg }}>{medMeta.label}</Text>
                  </View>
                )}
              >
                <Text className="text-[12.5px] font-semibold mb-1.5" style={{ color: 'var(--c-ink-soft)' }}>Valabilă până la</Text>
                <input
                  type="date"
                  value={medicalExpiry}
                  onChange={(e) => setMedicalExpiry(e.target.value)}
                  aria-label="Viză valabilă până la"
                  style={{
                    width: '100%',
                    height: 44,
                    borderRadius: 11,
                    border: '1px solid var(--c-border)',
                    backgroundColor: 'var(--c-surface-2)',
                    color: 'var(--c-ink)',
                    padding: '0 12px',
                    fontSize: 14,
                    fontWeight: 600,
                    colorScheme: 'light dark',
                  }}
                />
                <Text className="t-meta mt-2" style={{ color: 'var(--c-muted)' }}>
                  {medicalExpiry ? `Expiră pe ${formatDate(medicalExpiry)}.` : 'Nicio viză înregistrată.'} Salvează ca să aplici.
                </Text>
              </Card>

              <Card title="Plăți" icon="payments">
                <View className="rounded-[12px] px-3.5 py-3 mb-3" style={{ backgroundColor: 'var(--c-surface-2)' }}>
                  <Text className="t-eyebrow" style={{ color: 'var(--c-faint)' }}>{amountDue > 0 ? 'De plătit' : 'Plătit total'}</Text>
                  <Text className="t-num text-[24px] font-bold mt-1" style={{ color: amountDue > 0 ? 'var(--c-warning-fg)' : 'var(--c-ink)' }}>
                    {money(amountDue > 0 ? amountDue : player.paidAmount ?? transactions.reduce((sum, t) => sum + t.amount, 0))}
                  </Text>
                </View>
                {transactions.length === 0 ? (
                  <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>Nicio tranzacție încă.</Text>
                ) : (
                  <View>
                    {transactions.slice(0, 6).map((t, index) => (
                      <View key={t.id} className="flex-row items-center gap-3 py-2.5" style={index > 0 ? ({ borderTopWidth: 1, borderTopColor: 'var(--c-border)' } as any) : undefined}>
                        <View className="flex-1 min-w-0">
                          <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{t.label}</Text>
                          <Text className="t-meta" style={{ color: t.status === 'success' ? 'var(--c-muted)' : 'var(--c-danger-fg)' }}>
                            {new Date(t.date).toLocaleDateString('ro-RO')} · {t.status === 'success' ? 'Plătit' : 'Eșuat'}
                          </Text>
                        </View>
                        <Text className="t-num text-[13.5px] font-bold" style={{ color: 'var(--c-ink)' }}>{money(t.amount, t.currency)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </Card>

              <Card title="Istoric modificări" icon="history">
                {history == null ? (
                  <Skeleton className="h-[60px] w-full rounded-[12px]" />
                ) : history.length === 0 ? (
                  <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>Nicio modificare înregistrată încă.</Text>
                ) : (
                  <AuditEntries logs={history.slice(0, 20)} />
                )}
              </Card>
            </View>
          </View>
        </PageContainer>
      </ScrollView>
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </View>
  );
}
