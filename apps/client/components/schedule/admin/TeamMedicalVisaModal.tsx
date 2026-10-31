import Button from '../../ui/Button';
import ModalBackdrop from '../../ui/ModalBackdrop';
import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from '@/src/web/reactNative';
import { useResponsive } from '../../../hooks/useResponsive';
import { X, Calendar as CalendarIcon, CheckSquare, ShieldCheck } from 'lucide-react';
import { teamsApi, Player } from '../../../services/teamsApi';

interface TeamMedicalVisaModalProps {
  visible: boolean;
  teamId: number | null;
  teamName?: string | null;
  onClose: () => void;
  onSuccess: (updatedCount: number, failedCount: number) => void;
}

// Quick validity presets: set a medical visa expiry N months from today.
const VALIDITY_PRESETS = [
  { label: '6 luni', months: 6 },
  { label: '12 luni', months: 12 },
  { label: '24 luni', months: 24 },
] as const;

function formatDMY(date: Date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}-${m}-${date.getFullYear()}`;
}

/**
 * Team-scoped bulk editor for player medical visa expiry. Reached from the
 * schedule screen when it is scoped to a team (My Club → "Program"). Reuses the
 * same `teamsApi.updatePlayer({ medicalCheckExpiry })` write as the Compliance
 * UpdateFileModal, but pre-scoped to a single team's roster.
 */
export default function TeamMedicalVisaModal({ visible, teamId, teamName, onClose, onSuccess }: TeamMedicalVisaModalProps) {
  const { isMobile } = useResponsive();
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([]);
  const [expiryDate, setExpiryDate] = useState(''); // DD-MM-YYYY
  const [loading, setLoading] = useState(false);
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  useEffect(() => {
    if (!visible || teamId == null) return;
    setSelectedPlayerIds([]);
    setExpiryDate('');
    setPlayers([]);
    let cancelled = false;
    (async () => {
      setLoadingPlayers(true);
      try {
        const data = await teamsApi.getTeamPlayers(teamId);
        if (!cancelled) setPlayers(data);
      } catch (e) {
        console.error('Load team players failed', e);
      } finally {
        if (!cancelled) setLoadingPlayers(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, teamId]);

  const handleDateChange = (text: string) => {
    let cleaned = text.replace(/\D/g, '');
    if (cleaned.length > 2) cleaned = cleaned.slice(0, 2) + '-' + cleaned.slice(2);
    if (cleaned.length > 5) cleaned = cleaned.slice(0, 5) + '-' + cleaned.slice(5, 9);
    setExpiryDate(cleaned);
  };

  const applyPreset = (months: number) => {
    const target = new Date();
    target.setMonth(target.getMonth() + months);
    setExpiryDate(formatDMY(target));
  };

  const togglePlayer = (id: number) => {
    setSelectedPlayerIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const allSelected = players.length > 0 && selectedPlayerIds.length === players.length;
  const handleSelectAll = () => {
    setSelectedPlayerIds(allSelected ? [] : players.map((p) => p.id));
  };

  const handleSubmit = async () => {
    if (selectedPlayerIds.length === 0 || expiryDate.length !== 10) return;

    setLoading(true);
    try {
      const [day, month, year] = expiryDate.split('-');
      const isoDate = new Date(`${year}-${month}-${day}T12:00:00Z`).toISOString();

      const results = await Promise.allSettled(
        selectedPlayerIds.map((id) => teamsApi.updatePlayer(id, { medicalCheckExpiry: isoDate }))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      onSuccess(selectedPlayerIds.length - failed, failed);
      onClose();
    } catch (e) {
      console.error('Bulk medical visa update failed', e);
      onSuccess(0, selectedPlayerIds.length);
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  const canSubmit = !loading && selectedPlayerIds.length > 0 && expiryDate.length === 10;

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
          accessibilityLabel={`Vize medicale${teamName ? ` · ${teamName}` : ''}`}
          className={`bg-[var(--c-surface)] border border-[var(--c-border)] overflow-hidden w-full ${isMobile ? 'rounded-t-[20px] max-h-[92%]' : 'rounded-[18px] max-w-lg'}`}
          style={{ boxShadow: 'var(--e-lg)' }}
        >

          <View className="p-6 border-b border-[var(--c-border)] flex-row justify-between items-center bg-[var(--c-surface-2)]">
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-2xl bg-[var(--c-success-bg)] items-center justify-center">
                <ShieldCheck size={20} color="var(--c-success-fg)" />
              </View>
              <View>
                <Text className="text-xl font-bold text-[color:var(--c-ink-strong)] mb-0.5">Vize medicale</Text>
                <Text className="text-xs font-bold text-[color:var(--c-muted)]">{teamName ? teamName : 'Echipa selectată'}</Text>
              </View>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Închide" className="w-10 h-10 bg-[var(--c-surface)] border border-[var(--c-border)] rounded-full items-center justify-center hover:bg-[var(--c-surface-2)]">
              <X size={20} color="var(--c-muted)" />
            </Pressable>
          </View>

          <ScrollView className="p-6 max-h-[70vh]" showsVerticalScrollIndicator={false}>
            <View className="space-y-6">

              {/* Validity period */}
              <View>
                <Text className="text-[12.5px] font-semibold text-[color:var(--c-ink-soft)] mb-2">Perioadă de valabilitate</Text>
                <View className="flex-row flex-wrap gap-2 mb-3">
                  {VALIDITY_PRESETS.map((preset) => (
                    <Pressable
                      key={preset.months}
                      onPress={() => applyPreset(preset.months)}
                      className="px-4 py-2 rounded-xl border bg-[var(--c-surface-2)] border-[var(--c-border)] hover:bg-[var(--c-surface-tint)]"
                    >
                      <Text className="text-[12px] font-bold text-[color:var(--c-ink-strong)]">{preset.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text className="text-[12.5px] font-semibold text-[color:var(--c-ink-soft)] mb-2">Dată expirare (DD-MM-YYYY)</Text>
                <View className="flex-row items-center border border-[var(--c-border)] bg-[var(--c-surface-2)] rounded-2xl px-4 h-14">
                  <CalendarIcon size={18} color="var(--c-faint)" />
                  <TextInput
                    placeholder="DD-MM-YYYY"
                    className="flex-1 ml-3 text-[14px] font-bold text-[color:var(--c-ink-strong)] outline-none"
                    placeholderTextColor="var(--c-faint)"
                    value={expiryDate}
                    onChangeText={handleDateChange}
                    keyboardType="number-pad"
                    maxLength={10}
                  />
                </View>
              </View>

              {/* Players */}
              <View>
                <View className="flex-row justify-between items-center mb-2 px-1">
                  <Text className="text-[12px] font-bold text-[color:var(--c-brand-fg)]">Jucători vizați</Text>
                  {players.length > 0 && !loadingPlayers && (
                    <Pressable onPress={handleSelectAll} className="flex-row items-center gap-1.5 bg-[var(--c-surface-tint)] px-2 py-1 rounded-md">
                      <CheckSquare size={12} color="var(--c-brand-fg)" />
                      <Text className="text-[12px] font-bold text-[color:var(--c-brand-fg)]">{allSelected ? 'Deselectează' : 'Selectează toți'}</Text>
                    </Pressable>
                  )}
                </View>

                <View className="border border-[var(--c-border)] bg-[var(--c-surface)] rounded-2xl overflow-hidden min-h-[60px] p-2 flex-row flex-wrap gap-2">
                  {loadingPlayers && <ActivityIndicator size="small" color="var(--c-brand-fg)" className="m-2" />}
                  {!loadingPlayers && players.length === 0 && (
                    <Text className="p-2 text-[color:var(--c-faint)] text-xs">Această echipă nu are jucători.</Text>
                  )}
                  {!loadingPlayers && players.map((p) => {
                    const isSelected = selectedPlayerIds.includes(p.id);
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => togglePlayer(p.id)}
                        className={`px-3 py-2 rounded-xl flex-row items-center gap-2 border ${isSelected ? 'bg-[var(--c-brand-surface)] border-[var(--c-brand-border)]' : 'bg-[var(--c-surface-2)] border-[var(--c-border)]'}`}
                      >
                        <View className={`w-3.5 h-3.5 rounded border items-center justify-center ${isSelected ? 'bg-[var(--c-surface)] border-[var(--c-surface)]' : 'border-[var(--c-border-strong)]'}`}>
                          {isSelected && <View className="w-1.5 h-1.5 bg-[var(--c-brand-surface)] rounded-sm" />}
                        </View>
                        <Text className={`text-[12px] font-bold ${isSelected ? 'text-[color:var(--c-on-brand)]' : 'text-[color:var(--c-ink-strong)]'}`}>{p.firstName} {p.lastName}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

            </View>
          </ScrollView>

          {/* The system's buttons: the hand-built ones were 52px, bold 16px, and the
              disabled „Setează (0)” was white on grey (~1.2:1), unreadable. */}
          <View className="flex-row justify-end gap-3 px-6 py-4 border-t border-[var(--c-border)]">
            <Button label="Renunță" onPress={onClose} />
            <Button
              variant="primary"
              label={selectedPlayerIds.length ? `Setează pentru ${selectedPlayerIds.length}` : 'Alege jucătorii'}
              loading={loading}
              disabled={!canSubmit}
              onPress={() => void handleSubmit()}
            />
          </View>

        </View>
      </ModalBackdrop>
    </Modal>
  );
}
