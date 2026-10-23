import { parseApiDate } from '@/utils/dates';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { privacyRequestsApi, type PrivacyRequestRow } from '../../services/privacyApi';
import { deadlineLabel } from '../../utils/privacyDeadline';
import PageContainer from '../ui/PageContainer';
import PageHeader from '../ui/PageHeader';
import FilterChips from '../ui/FilterChips';
import Button from '../ui/Button';
import ConfirmDialog from '../ui/ConfirmDialog';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState, ErrorState } from '../ui/ScreenState';
import { ToastHost, useToasts } from '../ui/Toast';

/**
 * GDPR requests (today: "delete my data") for the people who answer them:
 * a club admin sees their club's, a super admin everyone's. Each open request
 * shows its 30-day deadline; "Marchează rezolvată" closes it with a note on
 * what was done, and the requester is told in the app (audit R3-13 — nothing
 * could close a request before, and the email linked to a page without it).
 * /admin/privacy and /super-admin/privacy.
 */

type Filter = 'open' | 'closed' | 'all';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', coach: 'Antrenor', accountant: 'Contabil', staff: 'Staff', parent: 'Părinte', player: 'Jucător', superadmin: 'Super admin',
};

function formatDay(value: string | null) {
  if (!value) return '—';
  const date = parseApiDate(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
}

const TONE: Record<'neutral' | 'warning' | 'danger', { fg: string; bg: string }> = {
  neutral: { fg: 'var(--c-ink-soft)', bg: 'var(--c-surface-3)' },
  warning: { fg: 'var(--c-warning-fg)', bg: 'var(--c-warning-bg)' },
  danger: { fg: 'var(--c-danger-fg)', bg: 'var(--c-danger-bg)' },
};

function RequestCard({ request, showClub, onResolve }: { request: PrivacyRequestRow; showClub: boolean; onResolve: () => void }) {
  const open = request.status === 'open';
  const deadline = deadlineLabel(request.daysLeft);
  const tone = TONE[deadline.tone];
  const who = request.requester.name || request.requester.email || 'Cont șters';

  return (
    <View
      className="relative overflow-hidden rounded-[14px] border p-4 gap-3 min-w-0"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
    >
      <View className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: open ? tone.fg : 'var(--c-success)' }} />
      <View className="flex-row items-start gap-3 min-w-0">
        <View className="w-10 h-10 rounded-[11px] items-center justify-center shrink-0" style={{ backgroundColor: open ? 'var(--c-danger-bg)' : 'var(--c-success-bg)' }}>
          <MaterialIcons name={open ? 'delete-outline' : 'check-circle'} size={19} color={open ? 'var(--c-danger-fg)' : 'var(--c-success-fg)'} />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-[15px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={2}>
            Ștergerea datelor · {who}
          </Text>
          <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)', userSelect: 'text' } as any} numberOfLines={2}>
            {[
              request.requester.email,
              request.requester.role ? ROLE_LABELS[request.requester.role] ?? request.requester.role : null,
              showClub ? request.club?.name ?? 'Fără club' : null,
            ].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {open ? (
          <View className="rounded-full px-2.5 py-1 shrink-0" style={{ backgroundColor: tone.bg }}>
            <Text className="text-[11.5px] font-bold" style={{ color: tone.fg }}>{deadline.label}</Text>
          </View>
        ) : (
          <View className="rounded-full px-2.5 py-1 shrink-0" style={{ backgroundColor: 'var(--c-success-bg)' }}>
            <Text className="text-[11.5px] font-bold" style={{ color: 'var(--c-success-fg)' }}>Rezolvată</Text>
          </View>
        )}
      </View>

      <View className="flex-row flex-wrap gap-x-5 gap-y-1">
        <Text className="text-[12.5px]" style={{ color: 'var(--c-muted)' }}>
          Primită: <Text className="font-semibold" style={{ color: 'var(--c-ink-soft)' }}>{formatDay(request.createdAt)}</Text>
        </Text>
        <Text className="text-[12.5px]" style={{ color: 'var(--c-muted)' }}>
          Termen legal: <Text className="font-semibold" style={{ color: 'var(--c-ink-soft)' }}>{formatDay(request.dueAt)}</Text>
        </Text>
        {!open ? (
          <Text className="text-[12.5px]" style={{ color: 'var(--c-muted)' }}>
            Închisă: <Text className="font-semibold" style={{ color: 'var(--c-ink-soft)' }}>{formatDay(request.closedAt)}{request.closedBy?.name ? ` · ${request.closedBy.name}` : ''}</Text>
          </Text>
        ) : null}
      </View>

      {request.resolutionNote ? (
        <Text className="text-[13px] leading-5 rounded-[10px] px-3 py-2" style={{ color: 'var(--c-ink-soft)', backgroundColor: 'var(--c-surface-2)' }}>
          „{request.resolutionNote}”
        </Text>
      ) : null}

      {open ? (
        <View className="flex-row justify-end">
          <Button variant="primary" size="sm" icon="check" label="Marchează rezolvată" onPress={onResolve} />
        </View>
      ) : null}
    </View>
  );
}

export default function PrivacyRequestsScreen({ platform = false }: { platform?: boolean }) {
  const [filter, setFilter] = useState<Filter>('open');
  const [rows, setRows] = useState<PrivacyRequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<PrivacyRequestRow | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const { toasts, showToast, dismissToast } = useToasts();

  const load = useCallback(async () => {
    try {
      setError(null);
      setRows(null);
      setRows(await privacyRequestsApi.list(filter));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut încărca cererile.');
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async () => {
    if (!resolving) return;
    setSaving(true);
    try {
      await privacyRequestsApi.resolve(resolving.id, note);
      showToast({ variant: 'success', message: 'Cererea a fost marcată rezolvată. Persoana a fost anunțată în aplicație.' });
      setResolving(null);
      await load();
    } catch (err) {
      showToast({ variant: 'error', message: err instanceof Error ? err.message : 'Nu am putut închide cererea.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-24" showsVerticalScrollIndicator={false}>
      <PageContainer>
        <PageHeader
          keepTitleOnMobile
          // The club admin's menu calls this page „Date personale”; one name everywhere.
          title={platform ? 'Cereri privind datele personale' : 'Date personale'}
          subtitle={platform
            ? 'Cererile de ștergere din toate cluburile. Răspunsul e obligatoriu în cel mult 30 de zile de la cerere.'
            : 'Cererile de ștergere ale membrilor clubului. Răspunsul e obligatoriu în cel mult 30 de zile de la cerere.'}
          actions={
            <Pressable
              onPress={load}
              accessibilityRole="button"
              accessibilityLabel="Reîmprospătează"
              className="ui-press w-10 h-10 rounded-[11px] border items-center justify-center"
              style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
            >
              <MaterialIcons name="refresh" size={17} color="var(--c-ink-soft)" />
            </Pressable>
          }
        />

        <View className="mb-4">
          <FilterChips<Filter>
            label="Stare cereri"
            value={filter}
            onChange={setFilter}
            options={[
              { key: 'open', label: 'Deschise', dot: 'var(--c-danger)' },
              { key: 'closed', label: 'Rezolvate', dot: 'var(--c-success)' },
              { key: 'all', label: 'Toate' },
            ]}
          />
        </View>

        {error ? (
          <ErrorState title="Nu am putut încărca cererile" message={error} actionLabel="Reîncearcă" onAction={load} />
        ) : !rows ? (
          <View className="gap-2.5" accessibilityRole="progressbar" accessibilityLabel="Se încarcă cererile">
            <Skeleton className="h-[150px] w-full rounded-[14px]" />
            <Skeleton className="h-[150px] w-full rounded-[14px]" />
          </View>
        ) : rows.length === 0 ? (
          <EmptyState
            compact
            icon="verified-user"
            title={filter === 'open' ? 'Nicio cerere deschisă' : 'Nicio cerere'}
            message={filter === 'open' ? 'Când cineva cere ștergerea datelor din Profil, cererea apare aici.' : 'Cererile închise apar aici, cu nota de rezolvare.'}
          />
        ) : (
          <View className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
            {rows.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                showClub={platform}
                onResolve={() => { setNote(''); setResolving(request); }}
              />
            ))}
          </View>
        )}
      </PageContainer>

      <ConfirmDialog
        visible={resolving != null}
        icon="check-circle"
        title="Marchezi cererea rezolvată?"
        message={`Fă întâi ce a cerut ${resolving?.requester.name || 'persoana'}: șterge sau anonimizează datele, ori explică ce trebuie păstrat legal (de ex. plățile, pentru contabilitate). Persoana primește nota de mai jos în aplicație.`}
        confirmLabel="Marchează rezolvată"
        cancelLabel="Renunță"
        loading={saving}
        onConfirm={resolve}
        onCancel={() => setResolving(null)}
      >
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Ce s-a făcut (opțional) — ex. Contul și datele copilului au fost șterse."
          placeholderTextColor="var(--c-faint)"
          multiline
          maxLength={1000}
          accessibilityLabel="Notă de rezolvare"
          className="w-full rounded-[11px] border px-3 py-2.5 text-[14px] font-medium min-h-[88px] resize-none leading-5"
          style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)', color: 'var(--c-ink)' } as any}
        />
      </ConfirmDialog>

      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </ScrollView>
  );
}
