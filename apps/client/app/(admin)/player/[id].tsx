import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import { teamsApi, type Player } from '../../../services/teamsApi';
import PageContainer from '../../../components/ui/PageContainer';
import Button from '../../../components/ui/Button';
import SelectField from '../../../components/ui/SelectField';
import { FormField } from '../../../components/ui/FormField';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ErrorState } from '../../../components/ui/ScreenState';
import { ToastHost, useToasts } from '../../../components/ui/Toast';
import GuardiansPanel from '../../../components/family/GuardiansPanel';
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
    <View className="rounded-[16px] border p-4 md:p-5" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-xs)' } as any}>
      <View className="flex-row items-center gap-2.5 mb-4">
        <View className="w-8 h-8 rounded-[9px] items-center justify-center" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
          <MaterialIcons name={icon} size={17} color="var(--c-brand-fg)" />
        </View>
        <Text className="flex-1 text-[15px] font-bold" style={{ color: 'var(--c-ink)' }}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View className="flex-1 min-w-[130px] px-4 py-3">
      <Text className="t-eyebrow" style={{ color: 'var(--c-faint)' }}>{label}</Text>
      <Text className="text-[15px] font-bold mt-1" style={{ color: tone ?? 'var(--c-ink)' }} numberOfLines={1}>{value}</Text>
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
          <View className="flex-row items-center justify-between gap-3 mb-4">
            <Button icon="chevron-left" label="Înapoi" size="sm" onPress={handleGoBack} />
            <Button
              icon="check"
              label={saving ? 'Se salvează…' : dirty ? 'Salvează' : 'Salvat'}
              variant={dirty ? 'primary' : 'secondary'}
              disabled={!dirty || !!numberError || !!yearError}
              loading={saving}
              onPress={handleSave}
            />
          </View>

          {/* Identity */}
          <View className="rounded-[18px] border overflow-hidden mb-5" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}>
            <View className="flex-row items-center gap-4 p-4 md:p-5">
              <View className="w-16 h-16 md:w-[72px] md:h-[72px] rounded-[18px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                <Text className="text-[22px] md:text-[24px] font-bold" style={{ color: 'var(--c-brand-fg)' }}>{initials}</Text>
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-[22px] md:text-[26px] font-bold leading-tight" style={{ color: 'var(--c-ink)', letterSpacing: '-0.5px' } as any} numberOfLines={2}>
                  {`${firstName} ${lastName}`.trim() || 'Jucător fără nume'}
                </Text>
                <Text className="text-[13px] font-medium mt-1" style={{ color: 'var(--c-muted)' }} numberOfLines={2}>
                  {[player.position, teams.join(', ') || 'Fără echipă'].filter(Boolean).join(' · ')}
                </Text>
                <View className="flex-row flex-wrap gap-1.5 mt-2">
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
              </View>
            </View>
            <View className="flex-row flex-wrap border-t" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' }}>
              <Fact label="Tricou" value={number ? `#${number}` : '—'} />
              <Fact label="Prezență" value={attendance != null ? `${Math.round(attendance)}%` : '—'} tone={attendance != null && attendance < 60 ? 'var(--c-danger-fg)' : undefined} />
              <Fact label="Viză medicală" value={medMeta.label} tone={medMeta.fg} />
              <Fact label="Plată" value={paid ? 'La zi' : amountDue > 0 ? `Restanță ${money(amountDue)}` : 'În așteptare'} tone={paid ? 'var(--c-success-fg)' : 'var(--c-warning-fg)'} />
            </View>
          </View>

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
            </View>
          </View>
        </PageContainer>
      </ScrollView>
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </View>
  );
}
