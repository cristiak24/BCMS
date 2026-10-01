import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { familyApi } from '../../services/familyApi';
import { parseRosterLines, type RosterOrder } from '../../utils/rosterParse';

/**
 * Paste a roster ("Popescu Matei 2016", one per line — straight from Excel or
 * a WhatsApp message) and add everyone to the team at once. The preview shows
 * exactly what will be saved; names already on the team are skipped server-side.
 */

export default function BulkAddPlayersDialog({
  visible,
  teamId,
  teamName,
  onClose,
  onDone,
}: {
  visible: boolean;
  teamId: number;
  teamName: string;
  onClose: () => void;
  onDone: (summary: { created: number; skipped: string[] }) => void;
}) {
  const [text, setText] = useState('');
  const [order, setOrder] = useState<RosterOrder>('last-first');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) { setText(''); setError(null); }
  }, [visible]);

  const rows = useMemo(() => parseRosterLines(text, order), [text, order]);
  const ignored = useMemo(() => text.split(/\r?\n/).filter((l) => l.trim()).length - rows.length, [text, rows]);

  if (!visible) return null;

  const save = async () => {
    if (!rows.length) return;
    setSaving(true);
    setError(null);
    try {
      const result = await familyApi.bulkAddPlayers(teamId, rows);
      onDone({ created: result.created.length, skipped: result.skipped });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut adăuga jucătorii.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible onRequestClose={saving ? undefined : onClose}>
      <Pressable
        accessibilityLabel="Închide"
        onPress={saving ? undefined : onClose}
        style={{ flex: 1, backgroundColor: 'rgba(2, 8, 23, 0.62)', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Adaugă jucători din listă"
          onClick={(event) => event.stopPropagation()}
          className="w-full max-w-[560px] max-h-[90vh] overflow-y-auto rounded-3xl p-5"
          style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: '0 28px 70px rgba(2, 8, 23, 0.35)' }}
        >
          <View>
            <Text className="text-[18px] font-bold" style={{ color: 'var(--c-ink)' }}>Adaugă jucători din listă</Text>
            <Text className="t-meta mt-1 mb-3" style={{ color: 'var(--c-muted)' }}>
              Câte un jucător pe rând, anul nașterii opțional — ex. „Popescu Matei 2016”. Intră în {teamName}.
            </Text>
          </View>

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-label="Lista de jucători"
            placeholder={'Popescu Matei 2016\nIonescu Andrei 2016\nStan Radu'}
            rows={7}
            className="w-full rounded-[12px] border px-3 py-2.5 text-[14px] font-medium outline-none"
            style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', borderStyle: 'solid', borderWidth: 1, color: 'var(--c-ink)', resize: 'vertical', lineHeight: '20px' }}
          />

          <View className="flex-row items-center gap-2 mt-3">
            <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-muted)' }}>Ordinea:</Text>
            <View className="flex-row p-[3px] rounded-[10px]" style={{ backgroundColor: 'var(--c-surface-3)' }}>
              {([['last-first', 'Nume Prenume'], ['first-last', 'Prenume Nume']] as const).map(([key, label]) => {
                const active = order === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setOrder(key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className="h-8 px-3 rounded-[8px] items-center justify-center"
                    style={{ backgroundColor: active ? 'var(--c-surface)' : 'transparent', boxShadow: active ? 'var(--e-sm)' : 'none' } as any}
                  >
                    <Text className="text-[12.5px] font-semibold" style={{ color: active ? 'var(--c-ink)' : 'var(--c-muted)' }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {rows.length ? (
            <View className="mt-3 rounded-[12px] border overflow-hidden" style={{ borderColor: 'var(--c-border)' } as any}>
              <View className="flex-row px-3 py-2" style={{ backgroundColor: 'var(--c-surface-2)' }}>
                <Text className="flex-1 t-eyebrow" style={{ color: 'var(--c-faint)' }}>Nume</Text>
                <Text className="flex-1 t-eyebrow" style={{ color: 'var(--c-faint)' }}>Prenume</Text>
                <Text className="w-14 t-eyebrow text-right" style={{ color: 'var(--c-faint)' }}>An</Text>
              </View>
              {rows.slice(0, 8).map((row, index) => (
                <View key={index} className="flex-row px-3 py-2 border-t" style={{ borderColor: 'var(--c-border)' } as any}>
                  <Text className="flex-1 text-[13px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{row.lastName}</Text>
                  <Text className="flex-1 text-[13px]" style={{ color: 'var(--c-ink-soft)' }} numberOfLines={1}>{row.firstName}</Text>
                  <Text className="w-14 t-num text-[13px] text-right" style={{ color: 'var(--c-muted)' }}>{row.birthYear ?? '—'}</Text>
                </View>
              ))}
              {rows.length > 8 ? (
                <Text className="px-3 py-2 border-t text-[12px]" style={{ color: 'var(--c-muted)', borderColor: 'var(--c-border)' } as any}>
                  … și încă {rows.length - 8}
                </Text>
              ) : null}
            </View>
          ) : null}
          {ignored > 0 ? (
            <Text className="text-[12px] mt-2" style={{ color: 'var(--c-warning-fg)' }}>
              {ignored} {ignored === 1 ? 'rând ignorat' : 'rânduri ignorate'} (lipsește numele sau prenumele).
            </Text>
          ) : null}
          {error ? <Text className="text-[12.5px] font-semibold mt-2" style={{ color: 'var(--c-danger-fg)' }}>{error}</Text> : null}

          <View className="flex-row justify-end gap-2 mt-5">
            <Pressable onPress={onClose} disabled={saving} accessibilityRole="button" className="ui-press h-11 px-4 rounded-[11px] items-center justify-center">
              <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-muted)' }}>Anulează</Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={saving || rows.length === 0}
              accessibilityRole="button"
              className="ui-press h-11 px-4 rounded-[11px] flex-row items-center gap-1.5"
              style={{ backgroundColor: 'var(--c-brand-surface)', opacity: saving || rows.length === 0 ? 0.5 : 1 } as any}
            >
              {saving ? <ActivityIndicator size="small" color="var(--c-on-brand)" /> : <MaterialIcons name="group-add" size={16} color="var(--c-on-brand)" />}
              <Text className="text-[13.5px] font-bold" style={{ color: 'var(--c-on-brand)' }}>
                {rows.length ? `Adaugă ${rows.length} ${rows.length === 1 ? 'jucător' : 'jucători'}` : 'Adaugă'}
              </Text>
            </Pressable>
          </View>
        </div>
      </Pressable>
    </Modal>
  );
}
