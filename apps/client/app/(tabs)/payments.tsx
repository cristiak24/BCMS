import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import * as Linking from '@/src/web/linking';
import * as WebBrowser from '@/src/web/webBrowser';
import CoachTeams from '../../components/coach/CoachTeams';
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
    return 'Scheduled';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en', {
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
    throw new Error('Stripe did not return a checkout URL.');
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
    <View className="flex-1 min-w-[280px] rounded-[28px] border border-[#E6EDF7] bg-white px-6 py-5">
      <View className="flex-row items-center gap-5">
        <View className="h-16 w-16 rounded-full bg-[#EAF4F8] items-center justify-center">
          <MaterialIcons name={feeIcon(fee.icon)} size={27} color="#006092" />
        </View>

        <View className="flex-1 min-w-0">
          <Text className="text-[#050817] text-lg font-black" numberOfLines={2}>{fee.label}</Text>
          <Text className="text-[#3F4657] text-sm font-medium mt-1" numberOfLines={2}>{fee.description}</Text>
          <Text className="text-[#006092] text-2xl font-black mt-2">{formatCurrency(fee.amount, fee.currency)}</Text>
        </View>

        <Pressable
          onPress={onPay}
          disabled={busy}
          className={`h-14 min-w-[92px] px-6 rounded-full border-2 border-[#006092] items-center justify-center ${busy ? 'opacity-60' : ''}`}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#006092" />
          ) : (
            <Text className="text-[#006092] text-lg font-black">Pay</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function PaymentMethodCard({ method }: { method: PlayerPaymentMethod }) {
  return (
    <View className="rounded-[28px] border border-[#E4EAF2] bg-white px-5 py-5">
      <View className="flex-row items-center gap-4">
        <View className="h-11 w-16 rounded-full bg-[#143BB6] items-center justify-center">
          <Text className="text-white text-[11px] font-black uppercase">{method.brand}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-[#050817] text-base font-black capitalize">{method.brand} ending in {method.last4}</Text>
          <Text className="text-[#4B5563] text-sm mt-1">
            {method.isDefault ? 'Primary' : 'Saved'} {method.expMonth && method.expYear ? `- Exp ${String(method.expMonth).padStart(2, '0')}/${method.expYear}` : ''}
          </Text>
        </View>
        <MaterialIcons name="edit" size={22} color="#2D3345" />
      </View>
    </View>
  );
}

function TransactionRow({ transaction }: { transaction: PlayerPaymentTransaction }) {
  const isSuccess = transaction.status === 'success';

  return (
    <View className="flex-row items-center gap-4 border-t border-[#E6EBF2] px-5 py-5">
      <View className="h-12 w-12 rounded-full bg-[#E8ECF1] items-center justify-center">
        <MaterialIcons name={isSuccess ? 'receipt-long' : 'error-outline'} size={22} color="#2D3345" />
      </View>

      <View className="flex-[2] min-w-0">
        <Text className="text-[#050817] text-base font-black" numberOfLines={1}>{transaction.label}</Text>
        <Text className="text-[#4B5563] text-sm mt-1" numberOfLines={1}>{transaction.description}</Text>
      </View>

      <Text className="hidden md:flex flex-1 text-[#172033] text-base font-medium">{formatDate(transaction.date)}</Text>

      <View className={`hidden md:flex flex-1 self-center rounded-full px-3 py-2 ${isSuccess ? 'bg-[#D8F8DF]' : 'bg-[#FFD9D9]'}`}>
        <Text className={`text-center text-[12px] font-black ${isSuccess ? 'text-[#087A2F]' : 'text-[#D21717]'}`}>
          {isSuccess ? 'Success' : 'Error'}
        </Text>
      </View>

      <Text className="min-w-[98px] text-right text-[#050817] text-base font-black">
        {formatCurrency(transaction.amount, transaction.currency)}
      </Text>
    </View>
  );
}

function PlayerPaymentsScreen() {
  const router = useRouter();
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
      setError(err instanceof Error ? err.message : 'Could not load payments.');
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
      setNotice('Payment cancelled.');
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
        setNotice('Payment confirmed.');
        await loadSummary(true);
        router.replace('/payments' as any);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not confirm payment.');
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
        setNotice('Payment method added.');
        await loadSummary(true);
        router.replace('/payments' as any);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not confirm payment method.');
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
      setError(err instanceof Error ? err.message : 'Could not start Stripe Checkout.');
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
      setError(err instanceof Error ? err.message : 'Could not open Stripe card setup.');
    } finally {
      setActionTarget(null);
    }
  };

  const openReceipts = () => {
    const receipts = summary?.transactions.map((transaction) => transaction.receiptUrl).filter(Boolean) ?? [];
    if (!receipts.length) {
      Alert.alert('Receipts', 'No receipts are available yet.');
      return;
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      receipts.forEach((url) => window.open(url as string, '_blank'));
      return;
    }

    void WebBrowser.openBrowserAsync(receipts[0] as string);
  };

  if (loading) {
    return (
      <View className="flex-1 bg-[#F4F8FF] items-center justify-center">
        <ActivityIndicator size="large" color="#0A2C93" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-[#F4F8FF]" contentContainerClassName="px-5 md:px-10 py-6 md:py-10 pb-20">
      <View className="w-full max-w-7xl mx-auto">
        <View className="flex-row items-start justify-between gap-4 mb-8">
          <View>
            <Text className="text-[#0A2C93] text-3xl md:text-4xl font-black tracking-tight">Finances</Text>
            <Text className="text-[#53627A] text-base font-semibold mt-2">{summary?.playerName ?? 'Player Account'}</Text>
          </View>

          <Pressable onPress={() => loadSummary(true)} className="h-12 w-12 rounded-full bg-white border border-[#E7EEF7] items-center justify-center">
            {refreshing ? <ActivityIndicator size="small" color="#0A2C93" /> : <MaterialIcons name="refresh" size={22} color="#0A2C93" />}
          </Pressable>
        </View>

        {error ? (
          <View className="mb-6 rounded-[24px] border border-red-100 bg-white px-5 py-4 flex-row items-center gap-3">
            <MaterialIcons name="error-outline" size={22} color="#DC2626" />
            <Text className="text-[#B91C1C] font-bold flex-1">{error}</Text>
          </View>
        ) : null}

        {notice ? (
          <View className="mb-6 rounded-[24px] border border-emerald-100 bg-white px-5 py-4 flex-row items-center gap-3">
            <MaterialIcons name="check-circle" size={22} color="#087A2F" />
            <Text className="text-[#087A2F] font-bold flex-1">{notice}</Text>
          </View>
        ) : null}

        {summary && !summary.stripe.configured ? (
          <View className="mb-6 rounded-[24px] border border-amber-100 bg-white px-5 py-4 flex-row items-center gap-3">
            <MaterialIcons name="warning-amber" size={22} color="#D97706" />
            <Text className="text-[#92400E] font-bold flex-1">
              Stripe Checkout nu este configurat încă pentru club. Plățile vor fi disponibile după configurarea cheilor Stripe.
            </Text>
          </View>
        ) : null}

        <View className="flex-col xl:flex-row gap-8 mb-14">
          <View className="flex-[2] rounded-[36px] border border-[#E8EEF7] bg-white px-6 md:px-10 py-8 md:py-11 min-h-[300px] justify-center">
            <View className="flex-col md:flex-row md:items-center gap-8">
              <View className="flex-1">
                <View className="flex-row items-center gap-4">
                  <View className={`rounded-full px-4 py-2 ${summary?.outstandingAmount ? 'bg-[#FFD9D6]' : 'bg-[#D8F8DF]'}`}>
                    <Text className={`text-[13px] font-black ${summary?.outstandingAmount ? 'text-[#B00000]' : 'text-[#087A2F]'}`}>
                      {summary?.dueLabel ?? 'Settled'}
                    </Text>
                  </View>
                  <Text className="text-[#172033] text-base font-semibold">{summary?.billingCycle ?? 'Current Cycle'}</Text>
                </View>

                <Text className="text-[#172033] text-xl font-medium mt-8">Outstanding Balance</Text>
                <Text className="text-[#082A9B] text-6xl md:text-7xl font-black tracking-tight mt-1">
                  {formatCurrency(summary?.outstandingAmount ?? 0, summary?.currency ?? 'ron')}
                </Text>
              </View>

              <View className="w-full md:w-[300px]">
                <Pressable
                  onPress={() => startCheckout()}
                  disabled={!payableFees.length || actionTarget === 'all' || !summary?.stripe.configured}
                  className={`h-[72px] rounded-full bg-[#173EC1] items-center justify-center ${(!payableFees.length || !summary?.stripe.configured) ? 'opacity-50' : ''}`}
                >
                  {actionTarget === 'all' ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text className="text-white text-2xl font-black">Pay All</Text>
                  )}
                </Pressable>
                <Text className="text-[#3F4657] text-sm font-medium mt-4 text-center">{summary?.autoPayNote ?? 'Stripe Checkout'}</Text>
              </View>
            </View>
          </View>

          <View className="w-full xl:w-[360px]">
            <View className="flex-row items-start justify-between mb-6">
              <Text className="text-[#050817] text-3xl font-black leading-9">Payment{'\n'}Methods</Text>
              <Pressable onPress={addPaymentMethod} disabled={actionTarget === 'setup' || !summary?.stripe.configured}>
                <Text className="text-[#006092] text-base font-black">{actionTarget === 'setup' ? 'Opening' : 'Add New'}</Text>
              </Pressable>
            </View>

            <View className="gap-4">
              {summary?.paymentMethods.length ? (
                summary.paymentMethods.map((method) => <PaymentMethodCard key={method.id} method={method} />)
              ) : (
                <View className="rounded-[28px] border border-[#E4EAF2] bg-white px-5 py-8 items-center">
                  <MaterialIcons name="credit-card-off" size={28} color="#8EA1B8" />
                  <Text className="text-[#53627A] font-bold text-center mt-3">No saved card yet.</Text>
                </View>
              )}
            </View>

            <Text className="text-[#3F4657] text-sm mt-5">Your payment info is encrypted and stored by Stripe.</Text>
          </View>
        </View>

        <View className="mb-14">
          <Text className="text-[#050817] text-3xl font-black mb-7">Upcoming Fees</Text>
          {payableFees.length ? (
            <View className="flex-row flex-wrap gap-6">
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
            <View className="rounded-[28px] border border-[#E6EDF7] bg-white px-6 py-10 items-center">
              <MaterialIcons name="check-circle" size={30} color="#087A2F" />
              <Text className="text-[#53627A] text-base font-bold mt-3">No upcoming fees.</Text>
            </View>
          )}
        </View>

        <View>
          <View className="flex-row items-center justify-between gap-4 mb-6">
            <Text className="text-[#050817] text-3xl font-black">Transaction History</Text>
            <Pressable onPress={openReceipts} className="hidden md:flex flex-row items-center gap-2">
              <Text className="text-[#006092] font-black">Download All Receipts</Text>
              <MaterialIcons name="file-download" size={18} color="#006092" />
            </Pressable>
          </View>

          <View className="rounded-[32px] border border-[#E3EAF2] bg-white overflow-hidden">
            <View className="hidden md:flex flex-row items-center gap-4 bg-[#EEF1F6] px-5 py-5">
              <Text className="flex-[2] text-[#2D3345] text-sm font-black uppercase tracking-widest">Transaction</Text>
              <Text className="flex-1 text-[#2D3345] text-sm font-black uppercase tracking-widest">Date</Text>
              <Text className="flex-1 text-[#2D3345] text-sm font-black uppercase tracking-widest">Status</Text>
              <Text className="min-w-[98px] text-right text-[#2D3345] text-sm font-black uppercase tracking-widest">Amount</Text>
            </View>

            {summary?.transactions.length ? (
              summary.transactions.map((transaction) => (
                <TransactionRow key={transaction.id} transaction={transaction} />
              ))
            ) : (
              <View className="px-5 py-10 items-center">
                <MaterialIcons name="receipt-long" size={30} color="#8EA1B8" />
                <Text className="text-[#53627A] font-bold mt-3">No transactions yet.</Text>
              </View>
            )}
          </View>
        </View>
      </View>
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
