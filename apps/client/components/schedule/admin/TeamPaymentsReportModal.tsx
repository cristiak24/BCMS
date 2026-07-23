import React, { useState, useEffect } from 'react';
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator, TextInput } from '@/src/web/reactNative';
import { X, Receipt, TrendingUp, Clock, Plus, Banknote, Check } from 'lucide-react';
import { financeApi, AdminRecentPayment } from '../../../services/financeApi';
import { teamsApi, Player } from '../../../services/teamsApi';

interface TeamPaymentsReportModalProps {
  visible: boolean;
  teamId: number | null;
  teamName?: string | null;
  onClose: () => void;
}

const PAID_STATUSES = new Set(['paid', 'processed', 'succeeded', 'success']);
const FAILED_STATUSES = new Set(['failed', 'error', 'rejected']);

function formatCurrency(amount: number, currency = 'ron') {
  try {
    return new Intl.NumberFormat('ro-RO', { style: 'currency', currency: currency.toUpperCase() }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function todayDMY() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

function maskDMY(text: string) {
  let cleaned = text.replace(/\D/g, '');
  if (cleaned.length > 2) cleaned = cleaned.slice(0, 2) + '-' + cleaned.slice(2);
  if (cleaned.length > 5) cleaned = cleaned.slice(0, 5) + '-' + cleaned.slice(5, 9);
  return cleaned;
}

function dmyToIso(dmy: string): string | undefined {
  if (dmy.length !== 10) return undefined;
  const [day, month, year] = dmy.split('-');
  const iso = new Date(`${year}-${month}-${day}T12:00:00Z`);
  return Number.isNaN(iso.getTime()) ? undefined : iso.toISOString();
}

function statusMeta(status: string) {
  const s = status.trim().toLowerCase();
  if (PAID_STATUSES.has(s)) return { label: 'Încasat', color: 'var(--c-success-fg)', bg: 'var(--c-success-bg)' };
  if (FAILED_STATUSES.has(s)) return { label: 'Eșuat', color: 'var(--c-danger-fg)', bg: 'var(--c-danger-bg)' };
  return { label: 'În așteptare', color: 'var(--c-warning-fg)', bg: 'var(--c-warning-bg)' };
}

/**
 * Team-scoped payments report shown from the schedule/team screens. Reuses the
 * admin recent-payments endpoint (`financeApi.getAdminRecentPayments`) with the
 * `teamId` filter, and lets the admin record a cash payment manually (a player
 * paying in person) via `financeApi.createManualPayment`.
 */
export default function TeamPaymentsReportModal({ visible, teamId, teamName, onClose }: TeamPaymentsReportModalProps) {
  const [payments, setPayments] = useState<AdminRecentPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Manual cash payment form
  const [players, setPlayers] = useState<Player[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formPlayerId, setFormPlayerId] = useState<number | null>(null);
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDate, setFormDate] = useState(''); // DD-MM-YYYY
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadPayments = async () => {
    if (teamId == null) return;
    setLoading(true);
    setError(false);
    try {
      const data = await financeApi.getAdminRecentPayments(50, teamId);
      setPayments(data);
    } catch (e) {
      console.error('Load team payments failed', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible || teamId == null) return;
    setShowForm(false);
    setFormPlayerId(null);
    setFormAmount('');
    setFormDescription('');
    setFormDate(todayDMY());
    setFormError(null);
    let cancelled = false;
    (async () => {
      await loadPayments();
      try {
        const roster = await teamsApi.getTeamPlayers(teamId);
        if (!cancelled) setPlayers(roster);
      } catch (e) {
        console.error('Load team roster failed', e);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, teamId]);

  if (!visible) return null;

  const currency = payments[0]?.currency ?? 'ron';
  const paid = payments.filter((p) => PAID_STATUSES.has(p.status.trim().toLowerCase()));
  const pending = payments.filter((p) => !PAID_STATUSES.has(p.status.trim().toLowerCase()) && !FAILED_STATUSES.has(p.status.trim().toLowerCase()));
  const collected = paid.reduce((sum, p) => sum + p.amount, 0);

  const parsedAmount = Number(formAmount.replace(',', '.'));
  const isoDate = dmyToIso(formDate);
  const canSubmit = !submitting && formPlayerId != null && Number.isFinite(parsedAmount) && parsedAmount > 0 && isoDate != null;

  const handleSubmit = async () => {
    if (!canSubmit || formPlayerId == null) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await financeApi.createManualPayment({
        playerId: formPlayerId,
        amount: parsedAmount,
        description: formDescription.trim() || undefined,
        method: 'cash',
        date: isoDate,
      });
      setShowForm(false);
      setFormPlayerId(null);
      setFormAmount('');
      setFormDescription('');
      await loadPayments();
    } catch (e) {
      console.error('Manual payment failed', e);
      setFormError(e instanceof Error ? e.message : 'Nu s-a putut înregistra plata.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View className="flex-1 bg-[#0E2041]/60 justify-center items-center p-4">
        <View className="bg-white rounded-[32px] w-full max-w-xl shadow-2xl overflow-hidden">

          <View className="p-6 border-b border-gray-100 flex-row justify-between items-center bg-gray-50/50">
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-2xl bg-[#EAF2FF] items-center justify-center">
                <Receipt size={20} color="var(--c-brand-fg)" />
              </View>
              <View>
                <Text className="text-xl font-black text-[#0D2040] mb-0.5">Raport plăți</Text>
                <Text className="text-xs font-bold text-gray-500">{teamName ? teamName : 'Echipa selectată'}</Text>
              </View>
            </View>
            <Pressable onPress={onClose} className="w-10 h-10 bg-white border border-gray-200 rounded-full items-center justify-center hover:bg-gray-50">
              <X size={20} color="var(--c-muted)" />
            </Pressable>
          </View>

          {/* Summary */}
          <View className="flex-row gap-3 px-6 pt-5">
            <View className="flex-1 rounded-2xl bg-[#E6F8F1] p-4">
              <View className="flex-row items-center gap-1.5 mb-1">
                <TrendingUp size={14} color="var(--c-success-fg)" />
                <Text className="text-[10px] font-black uppercase tracking-widest text-[#0B7A55]">Încasat</Text>
              </View>
              <Text className="text-[18px] font-black text-[#0B7A55]">{loading ? '—' : formatCurrency(collected, currency)}</Text>
              <Text className="text-[10px] font-bold text-[#0B7A55]/70 mt-0.5">{paid.length} plăți</Text>
            </View>
            <View className="flex-1 rounded-2xl bg-[#FEF3C7] p-4">
              <View className="flex-row items-center gap-1.5 mb-1">
                <Clock size={14} color="var(--c-warning-fg)" />
                <Text className="text-[10px] font-black uppercase tracking-widest text-[#B45309]">În așteptare</Text>
              </View>
              <Text className="text-[18px] font-black text-[#B45309]">{loading ? '—' : pending.length}</Text>
              <Text className="text-[10px] font-bold text-[#B45309]/70 mt-0.5">tranzacții</Text>
            </View>
          </View>

          {/* Manual cash payment */}
          <View className="px-6 pt-4">
            {!showForm ? (
              <Pressable
                onPress={() => setShowForm(true)}
                className="flex-row items-center justify-center gap-2 h-11 rounded-2xl bg-[#0B7A55] active:bg-[#0a6449]"
              >
                <Banknote size={16} color="#fff" />
                <Text className="text-white text-[12px] font-black uppercase tracking-wide">Adaugă plată cash</Text>
              </Pressable>
            ) : (
              <View className="rounded-2xl border border-[#E3E9F2] bg-[#F7F9FC] p-4">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-[12px] font-black text-[#0D2040] uppercase tracking-wide">Plată numerar</Text>
                  <Pressable onPress={() => setShowForm(false)} className="w-7 h-7 rounded-full bg-white border border-gray-200 items-center justify-center">
                    <X size={14} color="var(--c-muted)" />
                  </Pressable>
                </View>

                {/* Player selector */}
                <Text className="text-[10px] font-black tracking-widest text-[#1D3E90] uppercase mb-2">Jucător</Text>
                {players.length === 0 ? (
                  <Text className="text-gray-400 text-xs font-bold mb-3">Această echipă nu are jucători.</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                    <View className="flex-row gap-2">
                      {players.map((p) => {
                        const isSel = formPlayerId === p.id;
                        return (
                          <Pressable
                            key={p.id}
                            onPress={() => setFormPlayerId(p.id)}
                            className={`px-3 py-2 rounded-xl border flex-row items-center gap-1.5 ${isSel ? 'bg-[#1D3E90] border-[#1D3E90]' : 'bg-white border-gray-200'}`}
                          >
                            {isSel && <Check size={12} color="#fff" />}
                            <Text className={`text-[12px] font-bold ${isSel ? 'text-white' : 'text-[#0D2040]'}`}>{p.firstName} {p.lastName}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                )}

                <View className="flex-row gap-3">
                  <View className="w-32">
                    <Text className="text-[10px] font-black tracking-widest text-[#1D3E90] uppercase mb-2">Sumă ({currency.toUpperCase()})</Text>
                    <TextInput
                      value={formAmount}
                      onChangeText={setFormAmount}
                      placeholder="0"
                      placeholderTextColor="var(--c-faint)"
                      keyboardType="numeric"
                      className="border border-gray-200 bg-white rounded-xl px-3 h-12 font-bold text-[#0E2041] outline-none"
                    />
                  </View>
                  <View className="w-36">
                    <Text className="text-[10px] font-black tracking-widest text-[#1D3E90] uppercase mb-2">Data plății</Text>
                    <TextInput
                      value={formDate}
                      onChangeText={(t: string) => setFormDate(maskDMY(t))}
                      placeholder="ZZ-LL-AAAA"
                      placeholderTextColor="var(--c-faint)"
                      keyboardType="number-pad"
                      maxLength={10}
                      className="border border-gray-200 bg-white rounded-xl px-3 h-12 font-bold text-[#0E2041] outline-none"
                    />
                  </View>
                </View>

                <View className="mt-3">
                  <Text className="text-[10px] font-black tracking-widest text-[#1D3E90] uppercase mb-2">Descriere (opțional)</Text>
                  <TextInput
                    value={formDescription}
                    onChangeText={setFormDescription}
                    placeholder="ex. Cotizație numerar"
                    placeholderTextColor="var(--c-faint)"
                    className="border border-gray-200 bg-white rounded-xl px-3 h-12 font-bold text-[#0E2041] outline-none"
                  />
                </View>

                {formError && <Text className="text-[11px] font-bold text-red-600 mt-2">{formError}</Text>}

                <Pressable
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                  className={`flex-row items-center justify-center gap-2 h-11 rounded-2xl mt-3 ${canSubmit ? 'bg-[#1D3E90] active:bg-[#15316f]' : 'bg-gray-300'}`}
                >
                  {submitting ? <ActivityIndicator size="small" color="#fff" /> : (
                    <>
                      <Plus size={16} color="#fff" />
                      <Text className="text-white text-[12px] font-black uppercase tracking-wide">Înregistrează plata</Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}
          </View>

          <ScrollView className="px-6 py-5 max-h-[42vh]" showsVerticalScrollIndicator={false}>
            {loading ? (
              <View className="py-12 items-center"><ActivityIndicator size="large" color="var(--c-brand-fg)" /></View>
            ) : error ? (
              <View className="py-12 items-center">
                <Text className="text-gray-400 font-bold">Nu s-au putut încărca plățile.</Text>
              </View>
            ) : payments.length === 0 ? (
              <View className="py-12 items-center">
                <Receipt size={28} color="var(--c-faint)" />
                <Text className="text-gray-400 font-bold mt-3">Nicio plată pentru această echipă.</Text>
              </View>
            ) : (
              <View className="gap-2.5">
                {payments.map((payment) => {
                  const meta = statusMeta(payment.status);
                  const isCash = (payment.provider ?? '').toLowerCase() === 'cash';
                  return (
                    <View key={payment.id} className="flex-row items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3">
                      <View className="flex-1 min-w-0 pr-3">
                        <View className="flex-row items-center gap-1.5">
                          <Text className="font-black text-[#0D2040]" numberOfLines={1}>{payment.playerName}</Text>
                          {isCash && (
                            <View className="px-1.5 py-0.5 rounded-md bg-[#E6F8F1] flex-row items-center gap-1">
                              <Banknote size={10} color="var(--c-success-fg)" />
                              <Text className="text-[9px] font-black uppercase text-[#0B7A55]">Cash</Text>
                            </View>
                          )}
                        </View>
                        <Text className="text-[11px] font-bold text-gray-400" numberOfLines={1}>
                          {payment.description} · {new Date(payment.date).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="font-black text-[15px] text-[#0D2040]">{formatCurrency(payment.amount, payment.currency)}</Text>
                        <View className="px-2 py-0.5 rounded-full mt-1" style={{ backgroundColor: meta.bg }}>
                          <Text className="text-[9px] font-black uppercase tracking-wide" style={{ color: meta.color }}>{meta.label}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>

        </View>
      </View>
    </Modal>
  );
}
