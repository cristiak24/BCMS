import { useEffect, useState } from 'react';
import { Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import PageContainer from '../../components/ui/PageContainer';
import PageHeader from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ScreenState';
import { Panel } from '../../components/super-admin/ui';
import { CLUB_ROLE_ORDER, monthLabel, roleLabel } from '../../components/super-admin/format';
import { superAdminApi, type PlatformSettings } from '../../services/superAdminApi';
import { plural } from '../../utils/plural';

/**
 * What the platform runs with. Values come from the server's environment, so
 * they are shown here, not edited (change them on Render and redeploy).
 */

const ROLE_SCOPE: Record<string, string> = {
  superadmin: 'Toată platforma: cluburi, conturi, facturare, jurnal.',
  admin: 'Tot clubul lui: echipe, lot, program, conturi, invitații, finanțe, documente.',
  coach: 'Echipele lui: program, prezență, statistici, cereri de înscriere.',
  staff: 'Program, statistici live, documente pentru staff, agendă.',
  accountant: 'Finanțe, documente și agendă ale clubului.',
  player: 'Propriul program, prezență, plăți și documente.',
  parent: 'Copiii legați de cont: program, prezență, plăți.',
};

function Row({ icon, label, value, ok }: { icon: string; label: string; value: string; ok?: boolean }) {
  return (
    <View className="flex-row items-center gap-3 py-2.5 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
      <MaterialIcons name={icon} size={18} color="var(--c-muted)" />
      <Text className="flex-1 text-[13px] font-medium" style={{ color: 'var(--c-ink-soft)' }}>{label}</Text>
      {ok != null ? (
        <View className="flex-row items-center gap-1.5">
          <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ok ? 'var(--c-success)' : 'var(--c-danger)' }} />
          <Text className="text-[13px] font-semibold" style={{ color: ok ? 'var(--c-success-fg)' : 'var(--c-danger-fg)' }}>{value}</Text>
        </View>
      ) : (
        <Text className="text-[13px] font-semibold text-right shrink" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{value}</Text>
      )}
    </View>
  );
}

export default function SettingsScreen() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    superAdminApi.getSettings()
      .then((response) => setSettings(response.settings))
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca setările.'));
  };

  useEffect(load, []);

  return (
    <PageContainer>
      <PageHeader keepTitleOnMobile title="Setări" subtitle="Configurația platformei și ce poate face fiecare rol." />

      <View className="grid lg:grid-cols-2 gap-4 items-start">
        <Panel title="Platformă" subtitle="Se schimbă din variabilele de mediu ale serverului.">
          {error ? (
            <ErrorState message={error} actionLabel="Încearcă din nou" onAction={load} />
          ) : !settings ? (
            <View className="gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 rounded-[8px]" />)}</View>
          ) : (
            <View>
              <Row icon="mail-outline" label="Trimitere emailuri (Resend)" value={settings.emailConfigured ? 'Configurat' : 'Lipsește cheia'} ok={settings.emailConfigured} />
              <Row icon="credit-card" label="Plăți online (Stripe)" value={settings.stripeConfigured ? 'Configurat' : 'Lipsește cheia'} ok={settings.stripeConfigured} />
              <Row icon="send" label="Expeditor emailuri" value={settings.resendFromEmail} />
              <Row icon="link" label="Adresa aplicației" value={settings.appBaseUrl} />
              <Row icon="schedule" label="Valabilitate invitații" value={`${plural(settings.inviteTtlHours, 'oră', 'ore')} (${plural(Math.round(settings.inviteTtlHours / 24), 'zi', 'zile')})`} />
              <Row icon="insights" label="Activitate înregistrată din" value={settings.activityTrackingSince ? monthLabel(settings.activityTrackingSince) : 'încă nicio activitate'} />
            </View>
          )}
        </Panel>

        <Panel title="Roluri" subtitle="Rolul se alege la invitație și se poate schimba din Utilizatori.">
          <View>
            {(['superadmin', ...CLUB_ROLE_ORDER] as string[]).map((role, index) => (
              <View key={role} className="py-2.5" style={{ borderTopWidth: index ? 1 : 0, borderTopColor: 'var(--c-border)' } as any}>
                <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-ink)' }}>{roleLabel(role)}</Text>
                <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>{ROLE_SCOPE[role]}</Text>
              </View>
            ))}
          </View>
        </Panel>
      </View>
    </PageContainer>
  );
}
