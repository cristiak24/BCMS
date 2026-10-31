import ModalBackdrop from '../../ui/ModalBackdrop';
import { parseApiDate } from '@/utils/dates';
import React, { useState, useEffect } from 'react';
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator, TextInput } from '@/src/web/reactNative';
import { useResponsive } from '../../../hooks/useResponsive';
import { X, Receipt, Plus, Banknote, Check } from 'lucide-react';
import { financeApi, type PlayerBalanceSummary, AdminRecentPayment } from '../../../services/financeApi';
import { teamsApi, Player } from '../../../services/teamsApi';
import { plural } from '../../../utils/plural';

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
  const { isMobile } = useResponsive();
  const [payments, setPayments] = useState<AdminRecentPayment[]>([]);
  // Who owes what in this team — the report used to open on „collected” only.
  const [owing, setOwing] = useState<PlayerBalanceSummary[] | null>(null);
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
      const [data, balances] = await Promise.all([
        financeApi.getAdminRecentPayments(50, teamId),
        financeApi.getBalances(teamId).catch(() => null),
      ]);
      setPayments(data);
      setOwing(balances ? balances.players.filter((row) => row.overdue > 0).sort((a, b) => b.overdue - a.overdue) : null);
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* The system's dialog shell: dark veil (closes on a click outside), a named
          dialog, fine border and --e-lg — it was an indigo-tinted veil and an unnamed box. */}
      <ModalBackdrop
        onDismiss={onClose}
        className={isMobile ? 'justify-end' : 'justify-center items-center p-4'}
        style={{ backgroundColor: 'rgba(2, 8, 23, 0.62)' }}
      >
        <View
          role="dialog"
          aria-modal="true"
          accessibilityLabel={`Raport plăți${teamName ? ` · ${teamName}` : ''}`}
          className={`bg-[var(--c-surface)] border border-[var(--c-border)] overflow-hidden w-full ${isMobile ? 'rounded-t-[20px] max-h-[92%]' : 'rounded-[18px] max-w-xl'}`}
          style={{ boxShadow: 'var(--e-lg)' }}
        >

          <View className="p-6 border-b border-[var(--c-border)] flex-row justify-between items-center bg-[var(--c-surface-2)]">
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-2xl bg-[var(--c-surface-tint)] items-center justify-center">
                <Receipt size={20} color="var(--c-brand-fg)" />
              </View>
              <View>
                <Text className="text-xl font-bold text-[color:var(--c-ink-strong)] mb-0.5">Raport plăți</Text>
                <Text className="text-xs font-bold text-[color:var(--c-muted)]">{teamName ? teamName : 'Echipa selectată'}</Text>
              </View>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Închide" className="w-10 h-10 bg-[var(--c-surface)] border border-[var(--c-border)] rounded-full items-center justify-center hover:bg-[var(--c-surface-2)]">
              <X size={20} color="var(--c-muted)" />
            </Pressable>
          </View>

          {/* What is owed first, then what came in: neutral cards with a status dot
              (filled green/orange panels read „all paid” over a team in arrears). */}
          <View className="flex-row gap-3 px-6 pt-5">
            {[
              { dot: 'var(--c-danger)', label: 'Restanțe', value: owing == null ? '—' : formatCurrency(owing.reduce((sum, row) => sum + row.overdue, 0), currency), hint: owing == null ? 'nu s-au încărcat' : plural(owing.length, 'jucător', 'jucători') },
              { dot: 'var(--c-success)', label: 'Încasat', value: loading ? '—' : formatCurrency(collected, currency), hint: `${plural(paid.length, 'plată', 'plăți')}${pending.length ? ` · ${pending.length} în așteptare` : ''}` },
            ].map((tile) => (
              <View key={tile.label} className="flex-1 rounded-[14px] border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
                <View className="flex-row items-center gap-1.5 mb-1">
                  <View className="w-2 h-2 rounded-full" style={{ backgroundColor: tile.dot }} />
                  <Text className="text-[12.5px] font-semibold text-[color:var(--c-ink-soft)]">{tile.label}</Text>
                </View>
                <Text className="t-num text-[18px] font-bold text-[color:var(--c-ink-strong)]">{tile.value}</Text>
                <Text className="t-meta text-[color:var(--c-muted)] mt-0.5">{tile.hint}</Text>
              </View>
            ))}
          </View>
          {owing && owing.length ? (
            <View className="mx-6 mt-3 rounded-[14px] border border-[var(--c-border)] overflow-hidden">
              {owing.slice(0, 6).map((row, index) => (
                <View key={row.playerId} className={`flex-row items-center justify-between gap-3 px-4 py-2.5 ${index ? 'border-t border-[var(--c-border)]' : ''}`}>
                  <Text className="flex-1 min-w-0 text-[13.5px] font-semibold text-[color:var(--c-ink)]" numberOfLines={1}>{row.playerName}</Text>
                  <Text className="t-num text-[13.5px] font-bold text-[color:var(--c-danger-fg)]">{formatCurrency(row.overdue, currency)}</Text>
                </View>
              ))}
              {owing.length > 6 ? <Text className="t-meta px-4 py-2 border-t border-[var(--c-border)] text-[color:var(--c-muted)]">{`și încă ${plural(owing.length - 6, 'jucător', 'jucători')} · lista completă în Finanțe`}</Text> : null}
            </View>
          ) : null}

          {/* Manual cash payment */}
          <View className="px-6 pt-4">
            {!showForm ? (
              <Pressable
                onPress={() => setShowForm(true)}
                className="flex-row items-center justify-center gap-2 h-11 rounded-2xl bg-[var(--c-brand-surface)] active:opacity-90"
              >
                <Banknote size={16} color="var(--c-on-brand)" />
                <Text className="text-[color:var(--c-on-brand)] text-[13.5px] font-bold">Adaugă plată numerar</Text>
              </Pressable>
            ) : (
              <View className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface-2)] p-4">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-[13.5px] font-bold text-[color:var(--c-ink-strong)]">Plată numerar</Text>
                  <Pressable onPress={() => setShowForm(false)} className="w-7 h-7 rounded-full bg-[var(--c-surface)] border border-[var(--c-border)] items-center justify-center">
                    <X size={14} color="var(--c-muted)" />
                  </Pressable>
                </View>

                {/* Player selector */}
                <Text className="text-[12.5px] font-semibold text-[color:var(--c-ink-soft)] mb-2">Jucător</Text>
                {players.length === 0 ? (
                  <Text className="text-[color:var(--c-faint)] text-xs font-bold mb-3">Această echipă nu are jucători.</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                    <View className="flex-row gap-2">
                      {players.map((p) => {
                        const isSel = formPlayerId === p.id;
                        return (
                          <Pressable
                            key={p.id}
                            onPress={() => setFormPlayerId(p.id)}
                            className={`px-3 py-2 rounded-xl border flex-row items-center gap-1.5 ${isSel ? 'bg-[var(--c-brand-surface)] border-[var(--c-brand-border)]' : 'bg-[var(--c-surface)] border-[var(--c-border)]'}`}
                          >
                            {isSel && <Check size={12} color="var(--c-on-brand)" />}
                            <Text className={`text-[12px] font-bold ${isSel ? 'text-[color:var(--c-on-brand)]' : 'text-[color:var(--c-ink-strong)]'}`}>{p.firstName} {p.lastName}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                )}

                <View className="flex-row gap-3">
                  <View className="w-32">
                    <Text className="text-[12.5px] font-semibold text-[color:var(--c-ink-soft)] mb-2">Sumă ({currency.toUpperCase()})</Text>
                    <TextInput
                      value={formAmount}
                      onChangeText={setFormAmount}
                      placeholder="0"
                      placeholderTextColor="var(--c-faint)"
                      keyboardType="numeric"
                      className="border border-[var(--c-border)] bg-[var(--c-surface)] rounded-xl px-3 h-12 font-bold text-[color:var(--c-ink-strong)] outline-none"
                    />
                  </View>
                  <View className="w-36">
                    <Text className="text-[12.5px] font-semibold text-[color:var(--c-ink-soft)] mb-2">Data plății</Text>
                    <TextInput
                      value={formDate}
                      onChangeText={(t: string) => setFormDate(maskDMY(t))}
                      placeholder="ZZ-LL-AAAA"
                      placeholderTextColor="var(--c-faint)"
                      keyboardType="number-pad"
                      maxLength={10}
                      className="border border-[var(--c-border)] bg-[var(--c-surface)] rounded-xl px-3 h-12 font-bold text-[color:var(--c-ink-strong)] outline-none"
                    />
                  </View>
                </View>

                <View className="mt-3">
                  <Text className="text-[12.5px] font-semibold text-[color:var(--c-ink-soft)] mb-2">Descriere (opțional)</Text>
                  <TextInput
                    value={formDescription}
                    onChangeText={setFormDescription}
                    placeholder="ex. Cotizație numerar"
                    placeholderTextColor="var(--c-faint)"
                    className="border border-[var(--c-border)] bg-[var(--c-surface)] rounded-xl px-3 h-12 font-bold text-[color:var(--c-ink-strong)] outline-none"
                  />
                </View>

                {formError && <Text className="text-[11px] font-bold text-[color:var(--c-danger-fg)] mt-2">{formError}</Text>}

                <Pressable
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                  className={`flex-row items-center justify-center gap-2 h-11 rounded-2xl mt-3 ${canSubmit ? 'bg-[var(--c-brand-surface)] active:bg-[var(--c-brand-strong)]' : 'bg-[var(--c-surface-3)]'}`}
                >
                  {submitting ? <ActivityIndicator size="small" color="var(--c-on-brand)" /> : (
                    <>
                      <Plus size={16} color="var(--c-on-brand)" />
                      <Text className="text-[color:var(--c-on-brand)] text-[13.5px] font-bold">Înregistrează plata</Text>
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
                <Text className="text-[color:var(--c-faint)] font-bold">Nu s-au putut încărca plățile.</Text>
              </View>
            ) : payments.length === 0 ? (
              <View className="py-12 items-center">
                <Receipt size={28} color="var(--c-faint)" />
                <Text className="text-[color:var(--c-faint)] font-bold mt-3">Nicio plată pentru această echipă.</Text>
              </View>
            ) : (
              <View className="gap-2.5">
                {payments.map((payment) => {
                  const meta = statusMeta(payment.status);
                  const isCash = (payment.provider ?? '').toLowerCase() === 'cash';
                  return (
                    <View key={payment.id} className="flex-row items-center justify-between rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-3">
                      <View className="flex-1 min-w-0 pr-3">
                        <View className="flex-row items-center gap-1.5">
                          <Text className="font-bold text-[color:var(--c-ink-strong)]" numberOfLines={1}>{payment.playerName}</Text>
                          {isCash && (
                            <View className="px-1.5 py-0.5 rounded-md bg-[var(--c-success-bg)] flex-row items-center gap-1">
                              <Banknote size={10} color="var(--c-success-fg)" />
                              <Text className="text-[11px] font-bold text-[color:var(--c-success-fg)]">Numerar</Text>
                            </View>
                          )}
                        </View>
                        <Text className="text-[11px] font-bold text-[color:var(--c-faint)]" numberOfLines={1}>
                          {payment.description} · {parseApiDate(payment.date).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="font-bold text-[15px] text-[color:var(--c-ink-strong)]">{formatCurrency(payment.amount, payment.currency)}</Text>
                        <View className="px-2 py-0.5 rounded-full mt-1" style={{ backgroundColor: meta.bg }}>
                          <Text className="text-[11px] font-semibold" style={{ color: meta.color }}>{meta.label}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>

        </View>
      </ModalBackdrop>
    </Modal>
  );
}
