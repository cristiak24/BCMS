import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import { privacyApi } from '../../services/privacyApi';
import Button from '../ui/Button';
import ConfirmDialog from '../ui/ConfirmDialog';
import { ProfileCard } from './ProfileParts';

const LEGAL_LINKS = [
  { href: '/termeni', label: 'Termeni și condiții' },
  { href: '/confidentialitate', label: 'Politica de confidențialitate' },
  { href: '/cookie-uri', label: 'Cookie-uri' },
];

function formatDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value.includes('T') || value.endsWith('Z') ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** GDPR self-service: read the policies, download your data, ask for erasure. */
export default function PrivacyCard() {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requestedAt, setRequestedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    privacyApi.status()
      .then((status) => {
        if (!cancelled) setRequestedAt(status.erasureRequestedAt);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      await privacyApi.downloadExport();
    } catch (error) {
      Alert.alert('Descărcare date', error instanceof Error ? error.message : 'Nu am putut pregăti datele.');
    } finally {
      setExporting(false);
    }
  };

  const handleErasure = async () => {
    setRequesting(true);
    try {
      const result = await privacyApi.requestErasure();
      setRequestedAt(result.requestedAt);
      setConfirming(false);
    } catch (error) {
      setConfirming(false);
      Alert.alert('Ștergere cont', error instanceof Error ? error.message : 'Nu am putut trimite cererea.');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <ProfileCard
      icon="shield"
      tone="neutral"
      title="Confidențialitate și date"
      description="Drepturile tale conform GDPR: acces, portabilitate și ștergere."
    >
      <View className="gap-3">
        <View className="-my-1">
          {LEGAL_LINKS.map((link) => (
            <Pressable
              key={link.href}
              onPress={() => router.push(link.href)}
              accessibilityRole="link"
              accessibilityLabel={link.label}
              className="ui-press flex-row items-center justify-between py-2.5"
            >
              <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>{link.label}</Text>
              <MaterialIcons name="chevron-right" size={18} color="var(--c-faint)" />
            </Pressable>
          ))}
        </View>

        <View className="h-px" style={{ backgroundColor: 'var(--c-border-soft)' }} />

        <Text className="text-[12.5px] leading-5" style={{ color: 'var(--c-muted)' }}>
          Descarcă o copie a datelor din contul tău (și ale copiilor legați de el), într-un fișier JSON.
        </Text>
        <Button label="Descarcă datele mele" icon="download" onPress={() => void handleExport()} loading={exporting} />

        {requestedAt ? (
          <View className="rounded-[11px] border p-3" style={{ backgroundColor: 'var(--c-warning-bg)', borderColor: 'var(--c-warning-border)' } as any}>
            <Text className="text-[12.5px] font-bold leading-5" style={{ color: 'var(--c-warning-fg)' }}>
              Cerere de ștergere trimisă{formatDate(requestedAt) ? ` pe ${formatDate(requestedAt)}` : ''}. Clubul tău o preia și îți răspunde în cel mult 30 de zile.
            </Text>
          </View>
        ) : (
          <>
            <Text className="text-[12.5px] leading-5" style={{ color: 'var(--c-muted)' }}>
              Poți cere ștergerea contului și a datelor tale. Datele pe care legea ne obligă să le păstrăm (de exemplu cele contabile) nu pot fi șterse.
            </Text>
            <Button label="Cere ștergerea contului" icon="delete-outline" variant="danger" onPress={() => setConfirming(true)} />
          </>
        )}
      </View>

      <ConfirmDialog
        visible={confirming}
        destructive
        icon="delete-outline"
        title="Ștergi contul și datele?"
        message="Trimitem cererea administratorului clubului. După ce o procesează, contul și datele tale personale sunt șterse sau anonimizate, iar acest lucru nu se poate anula. Până atunci poți folosi aplicația."
        confirmLabel="Trimite cererea"
        cancelLabel="Renunț"
        loading={requesting}
        onConfirm={() => void handleErasure()}
        onCancel={() => setConfirming(false)}
      />
    </ProfileCard>
  );
}
