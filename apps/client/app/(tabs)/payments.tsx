import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import * as Linking from '@/src/web/linking';
import * as WebBrowser from '@/src/web/webBrowser';
import CoachTeams from '../../components/coach/CoachTeams';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../../components/ui/ScreenState';
import PageContainer from '../../components/ui/PageContainer';
import PageHeader from '../../components/ui/PageHeader';
import SectionHeader from '../../components/ui/SectionHeader';
import { useResponsive } from '../../hooks/useResponsive';
import { useFirebaseAuth } from '../../context/AuthContext';
import { normalizeRole } from '../../utils/authSession';
import {
  financeApi,
  PlayerPaymentFee,
  PlayerPaymentMethod,
  PlayerPaymentSummary,
  PlayerPaymentTransaction,
} from '../../services/financeApi';

type ActionTarget = 'all' | 'setup' | string | null;

function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(currency.toLowerCase() === 'ron' ? 'ro-RO' : 'en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Programat';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ro-RO', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(date);
}

function getReturnUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/payments`;
  }

  return Linking.createURL('/payments');
}

async function openStripeUrl(url: string | null) {
  if (!url) {
    throw new Error('Stripe nu a returnat un URL de plată.');
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.href = url;
    return;
  }

  await WebBrowser.openBrowserAsync(url);
}

function feeIcon(icon: PlayerPaymentFee['icon']) {
  if (icon === 'trophy') return 'emoji-events' as const;
  if (icon === 'receipt') return 'receipt-long' as const;
  return 'sports-basketball' as const;
}

function FeeCard({
  fee,
  busy,
  onPay,
}: {
  fee: PlayerPaymentFee;
  busy: boolean;
  onPay: () => void;
}) {
  return (
    <View
      className="flex-1 min-w-[280px] rounded-[16px] border p-5"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
    >
      {/* flex-col on mobile: a fixed flex-row squeezed the label/description
          into a ~130px sliver between the icon and the button, truncating fee
          names mid-word ("August Traini..."). */}
      <View className="flex-col sm:flex-row items-start sm:items-center gap-4">
        <View
          className="h-10 w-10 rounded-[10px] items-center justify-center shrink-0"
          style={{ backgroundColor: 'var(--c-surface-tint)' }}
        >
          <MaterialIcons name={feeIcon(fee.icon)} size={19} color="var(--c-brand-fg)" />
        </View>

        <View className="flex-1 min-w-0 w-full sm:w-auto">
          <Text className="text-[15px] font-bold" style={{ color: 'var(--c-ink)' }} numberOfLines={2}>{fee.label}</Text>
          <Text className="text-[12px] font-medium mt-0.5" style={{ color: 'var(--c-muted)' }} numberOfLines={2}>{fee.description}</Text>
          <Text className="text-[20px] font-bold mt-1.5 tracking-tight" style={{ color: 'var(--c-ink)' }}>
            {formatCurrency(fee.amount, fee.currency)}
          </Text>
        </View>

        <Pressable
          onPress={onPay}
          disabled={busy}
          accessibilityRole="button"
          className={`h-9 px-4 rounded-[10px] items-center justify-center w-full sm:w-auto ${busy ? 'opacity-60' : ''}`}
          style={{ backgroundColor: 'var(--c-brand-surface)' }}
        >
          {busy ? (
            <ActivityIndicator size="small" color="var(--c-on-brand)" />
          ) : (
            <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-on-brand)' }}>Plătește</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function PaymentMethodCard({ method }: { method: PlayerPaymentMethod }) {
  // `capitalize` used to sit on the whole sentence, which title-cased every
  // word — "Visa Care Se Termină În 4242". Only the brand needs casing, and
  // it gets it on its own span.
  const brand = method.brand ? method.brand.charAt(0).toUpperCase() + method.brand.slice(1) : 'Card';

  return (
    <View
      className="rounded-[14px] border p-4"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
    >
      <View className="flex-row items-center gap-3">
        <View
          className="h-9 w-12 rounded-[8px] items-center justify-center shrink-0"
          style={{ backgroundColor: 'var(--c-brand-surface)' }}
        >
          <Text className="text-[10px] font-bold uppercase" style={{ color: 'var(--c-on-brand)' }}>{method.brand}</Text>
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-[14px] font-bold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
            {brand} •••• {method.last4}
          </Text>
          <Text className="text-[12px] font-medium mt-0.5" style={{ color: 'var(--c-muted)' }}>
            {method.isDefault ? 'Principal' : 'Salvat'}{method.expMonth && method.expYear ? ` · Exp. ${String(method.expMonth).padStart(2, '0')}/${method.expYear}` : ''}
          </Text>
        </View>
      </View>
    </View>
  );
}

function TransactionRow({ transaction }: { transaction: PlayerPaymentTransaction }) {
  const isSuccess = transaction.status === 'success';

  return (
    <View className="flex-row items-center gap-4 border-t px-4 py-3.5" style={{ borderColor: 'var(--c-border)' } as any}>
      {/* Status-tinted: the "Status" column is hidden below md, so on a phone
          a failed payment was visually identical to a successful one. The icon
          carries that signal at every width. */}
      <View
        className="h-9 w-9 rounded-[10px] items-center justify-center shrink-0"
        style={{ backgroundColor: isSuccess ? 'var(--c-surface-3)' : 'var(--c-danger-bg)' }}
      >
        <MaterialIcons
          name={isSuccess ? 'receipt-long' : 'error-outline'}
          size={17}
          color={isSuccess ? 'var(--c-ink-soft)' : 'var(--c-danger-fg)'}
        />
      </View>

      {/* numberOfLines=2: the date/status columns only show at md+, so on
          mobile this column is the icon-to-amount sliver and 1 line truncated
          ordinary-length labels mid-word ("May Traini..."). */}
      <View className="flex-[2] min-w-0">
        <Text className="text-[14px] font-bold" style={{ color: 'var(--c-ink)' }} numberOfLines={2}>{transaction.label}</Text>
        <Text className="text-[12px] font-medium mt-0.5" style={{ color: 'var(--c-muted)' }} numberOfLines={2}>{transaction.description}</Text>
      </View>

      <Text className="hidden md:flex flex-1 text-[13px] font-medium" style={{ color: 'var(--c-ink-soft)' }}>
        {formatDate(transaction.date)}
      </Text>

      {/* The pill used to carry flex-1, so a 7-character status stretched to
          fill a ~400px column. It hugs its label now; the column still
          reserves the space. */}
      <View className="hidden md:flex flex-1">
        <View
          className="self-start rounded-full px-2.5 py-1"
          style={{ backgroundColor: isSuccess ? 'var(--c-success-bg)' : 'var(--c-danger-bg)' }}
        >
          <Text
            className="text-[11px] font-semibold"
            style={{ color: isSuccess ? 'var(--c-success-fg)' : 'var(--c-danger-fg)' }}
          >
            {isSuccess ? 'Reușită' : 'Eroare'}
          </Text>
        </View>
      </View>

      <Text className="min-w-[98px] text-right text-[14px] font-bold" style={{ color: 'var(--c-ink)' }}>
        {formatCurrency(transaction.amount, transaction.currency)}
      </Text>
    </View>
  );
}

function PlayerPaymentsScreen() {
  const router = useRouter();
  const { isMobile } = useResponsive();
  const params = useLocalSearchParams<{
    payment_session_id?: string;
    setup_session_id?: string;
    payment_status?: string;
  }>();
  const handledSessions = useRef(new Set<string>());
  const [summary, setSummary] = useState<PlayerPaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionTarget, setActionTarget] = useState<ActionTarget>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const payableFees = useMemo(
    () => summary?.fees.filter((fee) => fee.amount > 0) ?? [],
    [summary]
  );

  const loadSummary = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      setSummary(await financeApi.getPlayerPaymentSummary());
    } catch (err) {
      // Never render the server's message: this endpoint returns internal
      // failures verbatim (handleRouteError), which put strings like "Could not
      // load the default credentials..." straight into the UI. Log the real
      // error, show the player something actionable.
      console.error('[payments] Failed to load player payment summary:', err);
      setError('Plățile nu au putut fi încărcate. Încearcă din nou în câteva momente.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    const paymentSessionId = typeof params.payment_session_id === 'string' ? params.payment_session_id : null;
    const setupSessionId = typeof params.setup_session_id === 'string' ? params.setup_session_id : null;
    const cancelled = params.payment_status === 'cancelled';

    if (cancelled) {
      setNotice('Plată anulată.');
      router.replace('/payments' as any);
      return;
    }

    const confirmPayment = async (sessionId: string) => {
      if (handledSessions.current.has(sessionId)) {
        return;
      }

      handledSessions.current.add(sessionId);
      setActionTarget('all');
      try {
        await financeApi.confirmPlayerCheckoutSession(sessionId);
        setNotice('Plată confirmată.');
        await loadSummary(true);
        router.replace('/payments' as any);
      } catch (err) {
        console.error('[payments] Failed to confirm checkout session:', err);
        setError('Nu s-a putut confirma plata.');
      } finally {
        setActionTarget(null);
      }
    };

    const confirmSetup = async (sessionId: string) => {
      if (handledSessions.current.has(sessionId)) {
        return;
      }

      handledSessions.current.add(sessionId);
      setActionTarget('setup');
      try {
        await financeApi.confirmPlayerSetupSession(sessionId);
        setNotice('Metodă de plată adăugată.');
        await loadSummary(true);
        router.replace('/payments' as any);
      } catch (err) {
        console.error('[payments] Failed to confirm setup session:', err);
        setError('Nu s-a putut confirma metoda de plată.');
      } finally {
        setActionTarget(null);
      }
    };

    if (paymentSessionId) {
      void confirmPayment(paymentSessionId);
      return;
    }

    if (setupSessionId) {
      void confirmSetup(setupSessionId);
    }
  }, [loadSummary, params.payment_session_id, params.payment_status, params.setup_session_id, router]);

  const startCheckout = async (feeIds?: string[]) => {
    const target = feeIds?.[0] ?? 'all';
    setActionTarget(target);
    setError(null);
    setNotice(null);

    try {
      const session = await financeApi.createPlayerCheckoutSession(feeIds, getReturnUrl());
      await openStripeUrl(session.url);
    } catch (err) {
      console.error('[payments] Failed to start checkout:', err);
      setError('Nu s-a putut porni Stripe Checkout.');
    } finally {
      setActionTarget(null);
    }
  };

  const addPaymentMethod = async () => {
    setActionTarget('setup');
    setError(null);
    setNotice(null);

    try {
      const session = await financeApi.createPlayerSetupSession(getReturnUrl());
      await openStripeUrl(session.url);
    } catch (err) {
      console.error('[payments] Failed to open card setup:', err);
      setError('Nu s-a putut deschide configurarea cardului Stripe.');
    } finally {
      setActionTarget(null);
    }
  };

  const openReceipts = () => {
    const receipts = summary?.transactions.map((transaction) => transaction.receiptUrl).filter(Boolean) ?? [];
    if (!receipts.length) {
      Alert.alert('Chitanțe', 'Nu există chitanțe disponibile încă.');
      return;
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      receipts.forEach((url) => window.open(url as string, '_blank'));
      return;
    }

    void WebBrowser.openBrowserAsync(receipts[0] as string);
  };

  // The skeleton lives inside the real page container and mirrors the balance
  // panel / fees / history stack, so nothing shifts when the summary arrives.
  if (loading) {
    return (
      <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-20">
        <PageContainer accessibilityRole="progressbar" accessibilityLabel="Se încarcă finanțele">
          <View className="flex-row items-start justify-between gap-4 mb-8">
            <View>
              <Skeleton className="h-9 w-44" />
              <Skeleton className="h-4 w-56 mt-3" />
            </View>
            <Skeleton className="h-12 w-12 rounded-full" />
          </View>

          <View className="flex-col xl:flex-row gap-4 mb-6">
            <Skeleton className="flex-[2]  rounded-[16px]" />
            <Skeleton className="flex-1  rounded-[16px]" />
          </View>

          <View className="mb-14">
            <Skeleton className="h-8 w-52 mb-4" />
            <View className="flex-row flex-wrap gap-4">
              <Skeleton className="h-[190px] flex-1 min-w-[260px] rounded-[16px]" />
              <Skeleton className="h-[190px] flex-1 min-w-[260px] rounded-[16px]" />
            </View>
          </View>

          <View>
            <Skeleton className="h-8 w-60 mb-6" />
            <Skeleton className="h-[280px] w-full rounded-[16px]" />
          </View>
        </PageContainer>
      </ScrollView>
    );
  }

  // A failure with nothing cached is terminal for the screen, so it gets the shared
  // error state with a retry. A failure that still has a summary behind it stays the
  // inline banner below — losing the data the player can still act on would be worse.
  if (error && !summary) {
    return (
      <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-20">
        <PageContainer>
          <ErrorState
            title="Nu am putut încărca finanțele"
            message={error}
            actionLabel="Reîncearcă"
            onAction={() => loadSummary(true)}
          />
        </PageContainer>
      </ScrollView>
    );
  }

  return (
    <ScrollView className="flex-1 bg-[var(--c-bg)]" contentContainerClassName="pb-20">
      <PageContainer>
        <PageHeader
          title="Finanțe"
          subtitle={summary?.playerName ?? 'Cont jucător'}
          actions={
            <Pressable
              onPress={() => loadSummary(true)}
              accessibilityRole="button"
              accessibilityLabel="Reîmprospătează"
              className="w-9 h-9 rounded-[10px] border items-center justify-center"
              style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
            >
              {refreshing ? <ActivityIndicator size="small" color="var(--c-brand-fg)" /> : <MaterialIcons name="refresh" size={17} color="var(--c-ink-soft)" />}
            </Pressable>
          }
        />

        {error ? (
          <View className="mb-6 rounded-[24px] border border-red-100 bg-[var(--c-surface)] px-5 py-4 flex-row items-center gap-3">
            <MaterialIcons name="error-outline" size={22} color="var(--c-danger)" />
            <Text className="text-[#B91C1C] font-bold flex-1">{error}</Text>
          </View>
        ) : null}

        {notice ? (
          <View className="mb-6 rounded-[24px] border border-emerald-100 bg-[var(--c-surface)] px-5 py-4 flex-row items-center gap-3">
            <MaterialIcons name="check-circle" size={22} color="var(--c-success-fg)" />
            <Text className="text-[#087A2F] font-bold flex-1">{notice}</Text>
          </View>
        ) : null}

        {summary && !summary.stripe.configured ? (
          <View className="mb-6 rounded-[24px] border border-amber-100 bg-[var(--c-surface)] px-5 py-4 flex-row items-center gap-3">
            <MaterialIcons name="warning-amber" size={22} color="var(--c-warning)" />
            <Text className="text-[#92400E] font-bold flex-1">
              Stripe Checkout nu este configurat încă pentru club. Plățile vor fi disponibile după configurarea cheilor Stripe.
            </Text>
          </View>
        ) : null}

        <View className="flex-col xl:flex-row gap-4 mb-6">
          <View
            className="flex-1 rounded-[16px] border p-5 justify-center"
            style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
          >
            <View className="flex-col md:flex-row md:items-center gap-6">
              <View className="flex-1">
                <View className="flex-row items-center gap-3">
                  <View
                    className="rounded-full px-2.5 py-1"
                    style={{ backgroundColor: summary?.outstandingAmount ? 'var(--c-danger-bg)' : 'var(--c-success-bg)' }}
                  >
                    <Text
                      className="text-[11px] font-semibold"
                      style={{ color: summary?.outstandingAmount ? 'var(--c-danger-fg)' : 'var(--c-success-fg)' }}
                    >
                      {summary?.dueLabel ?? 'Achitat'}
                    </Text>
                  </View>
                  <Text className="text-[13px] font-medium" style={{ color: 'var(--c-muted)' }}>
                    {summary?.billingCycle ?? 'Ciclu curent'}
                  </Text>
                </View>

                {/* One accent on this page. The amount used to be cyan while the
                    primary button was indigo, so the screen carried two
                    competing brand colours. Ink for the figure, indigo only on
                    the action. */}
                <Text className="text-[11px] font-bold uppercase tracking-[0.07em] mt-5" style={{ color: 'var(--c-faint)' }}>
                  Sold restant
                </Text>
                <Text className="text-[30px] font-bold tracking-tight mt-1" style={{ color: 'var(--c-ink)' }}>
                  {formatCurrency(summary?.outstandingAmount ?? 0, summary?.currency ?? 'ron')}
                </Text>
              </View>

              <View className="w-full md:w-[240px]">
                <Pressable
                  onPress={() => startCheckout()}
                  disabled={!payableFees.length || actionTarget === 'all' || !summary?.stripe.configured}
                  accessibilityRole="button"
                  className={`h-10 rounded-[10px] items-center justify-center ${(!payableFees.length || !summary?.stripe.configured) ? 'opacity-50' : ''}`}
                  style={{ backgroundColor: 'var(--c-brand-surface)' }}
                >
                  {actionTarget === 'all' ? (
                    <ActivityIndicator size="small" color="var(--c-on-brand)" />
                  ) : (
                    <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-on-brand)' }}>Plătește tot</Text>
                  )}
                </Pressable>
                <Text className="text-[12px] font-medium mt-2.5 text-center" style={{ color: 'var(--c-muted)' }}>
                  {summary?.autoPayNote ?? 'Stripe Checkout'}
                </Text>
              </View>
            </View>
          </View>

          <View className="w-full xl:w-[340px]">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-[15px] font-bold" style={{ color: 'var(--c-ink)' }}>Metode de plată</Text>
              <Pressable
                onPress={addPaymentMethod}
                disabled={actionTarget === 'setup' || !summary?.stripe.configured}
                accessibilityRole="button"
              >
                <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>
                  {actionTarget === 'setup' ? 'Se deschide' : 'Adaugă'}
                </Text>
              </Pressable>
            </View>

            <View className="gap-2.5">
              {summary?.paymentMethods.length ? (
                summary.paymentMethods.map((method) => <PaymentMethodCard key={method.id} method={method} />)
              ) : (
                <EmptyState
                  icon="credit-card-off"
                  compact
                  title="Niciun card salvat"
                  message="Adaugă o metodă de plată pentru a plăti mai rapid."
                />
              )}
            </View>

            <Text className="text-[12px] font-medium mt-3" style={{ color: 'var(--c-faint)' }}>
              Datele tale de plată sunt criptate și stocate de Stripe.
            </Text>
          </View>
        </View>

        <View className="mb-6">
          <SectionHeader
            title="Taxe viitoare"
            subtitle="Taxele pe care le ai de achitat."
            isMobile={isMobile}
          />
          {payableFees.length ? (
            <View className="flex-row flex-wrap gap-4">
              {payableFees.map((fee) => (
                <FeeCard
                  key={fee.id}
                  fee={fee}
                  busy={actionTarget === fee.id}
                  onPay={() => startCheckout([fee.id])}
                />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="check-circle"
              compact
              title="Nicio taxă viitoare"
              message="Nu ai taxe de achitat în acest moment."
            />
          )}
        </View>

        <View>
          <SectionHeader
            title="Istoric tranzacții"
            subtitle="Plățile efectuate și chitanțele lor."
            actionLabel={summary?.transactions.length ? 'Descarcă chitanțele' : undefined}
            onAction={summary?.transactions.length ? openReceipts : undefined}
            isMobile={isMobile}
          />

          <View
            className="rounded-[16px] border overflow-hidden"
            style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
          >
            <View
              className="hidden md:flex flex-row items-center gap-4 px-4 py-3"
              style={{ backgroundColor: 'var(--c-surface-2)' }}
            >
              <Text className="flex-[2] text-[11px] font-bold uppercase tracking-[0.07em]" style={{ color: 'var(--c-faint)' }}>Tranzacție</Text>
              <Text className="flex-1 text-[11px] font-bold uppercase tracking-[0.07em]" style={{ color: 'var(--c-faint)' }}>Dată</Text>
              <Text className="flex-1 text-[11px] font-bold uppercase tracking-[0.07em]" style={{ color: 'var(--c-faint)' }}>Status</Text>
              <Text className="min-w-[98px] text-right text-[11px] font-bold uppercase tracking-[0.07em]" style={{ color: 'var(--c-faint)' }}>Sumă</Text>
            </View>

            {summary?.transactions.length ? (
              summary.transactions.map((transaction) => (
                <TransactionRow key={transaction.id} transaction={transaction} />
              ))
            ) : (
              <EmptyState
                icon="receipt-long"
                compact
                title="Nicio tranzacție încă"
                message="Plățile efectuate apar aici, împreună cu chitanțele."
              />
            )}
          </View>
        </View>
      </PageContainer>
    </ScrollView>
  );
}

export default function PaymentsScreen() {
  const { session } = useFirebaseAuth();

  if (normalizeRole(session?.role) === 'coach') {
    return <CoachTeams />;
  }

  return <PlayerPaymentsScreen />;
}
