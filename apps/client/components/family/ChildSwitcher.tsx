import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { familyApi, type FamilyChild, type FamilyPendingRequest } from '../../services/familyApi';
import { loadFamily } from './useActiveChild';
import { getActiveChildId, setActiveChildId } from '../../services/apiClient';
import { getInitials } from '../coach/coachDisplay';

/**
 * Parent accounts: which child the player screens are showing, plus "add a
 * child". Sits above every page in the player layout for role=parent.
 *
 * The selection lives in localStorage and travels as the X-BCMS-Child header
 * (services/apiClient.ts); switching reloads so every screen refetches for the
 * new child instead of mixing two children's data.
 */

const FIELD_CLASS = 'h-11 rounded-[10px] border px-3 text-[14px] font-medium outline-none w-full';
const FIELD_STYLE = { backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-ink)' };

function Field({ label, value, onChange, placeholder, date }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; date?: boolean }) {
  return (
    <View className="flex-1 min-w-0">
      <Text className="t-eyebrow mb-1" style={{ color: 'var(--c-faint)' }}>{label}</Text>
      {date ? (
        // The RN TextInput shim always renders type="text"; a native date picker needs the real input.
        <input
          type="date"
          aria-label={label}
          value={value}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(event) => onChange(event.target.value)}
          className={FIELD_CLASS}
          style={{ ...FIELD_STYLE, borderStyle: 'solid', borderWidth: 1 }}
        />
      ) : (
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="var(--c-faint)"
          accessibilityLabel={label}
          className={FIELD_CLASS}
          style={FIELD_STYLE as any}
        />
      )}
    </View>
  );
}

function AddChildDialog({ visible, onClose, onSent }: { visible: boolean; onClose: () => void; onSent: (teamName: string) => void }) {
  const [teamCode, setTeamCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTeamCode(''); setFirstName(''); setLastName(''); setBirthDate(''); setError(null);
  }, [visible]);

  if (!visible) return null;

  const submit = async () => {
    if (!teamCode.trim() || !firstName.trim() || !lastName.trim() || !birthDate) {
      setError('Completează codul echipei, numele, prenumele și data nașterii.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const done = await familyApi.requestChild({ teamCode: teamCode.trim(), firstName: firstName.trim(), lastName: lastName.trim(), birthDate });
      onSent(done.teamName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut trimite cererea.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible onRequestClose={sending ? undefined : onClose}>
      <Pressable
        accessibilityLabel="Închide"
        onPress={sending ? undefined : onClose}
        style={{ flex: 1, backgroundColor: 'rgba(2, 8, 23, 0.62)', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Adaugă un copil"
          onClick={(event) => event.stopPropagation()}
          className="w-full max-w-[440px] rounded-3xl p-5"
          style={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: '0 28px 70px rgba(2, 8, 23, 0.35)' }}
        >
          <View>
            <Text className="text-[18px] font-bold" style={{ color: 'var(--c-ink)' }}>Adaugă un copil</Text>
            <Text className="t-meta mt-1 mb-4" style={{ color: 'var(--c-muted)' }}>
              Cere antrenorului codul echipei copilului. După aprobare, copilul apare aici.
            </Text>
          </View>
          <View className="gap-3">
            <Field label="Codul echipei" value={teamCode} onChange={setTeamCode} placeholder="ex. K4Q-72M" />
            <View className="flex-row gap-2">
              <Field label="Prenume" value={firstName} onChange={setFirstName} />
              <Field label="Nume" value={lastName} onChange={setLastName} />
            </View>
            <Field label="Data nașterii" value={birthDate} onChange={setBirthDate} date />
          </View>
          {error ? <Text className="text-[12.5px] font-semibold mt-3" style={{ color: 'var(--c-danger-fg)' }}>{error}</Text> : null}
          <View className="flex-row justify-end gap-2 mt-5">
            <Pressable onPress={onClose} disabled={sending} accessibilityRole="button" className="ui-press h-11 px-4 rounded-[11px] items-center justify-center">
              <Text className="text-[13.5px] font-semibold" style={{ color: 'var(--c-muted)' }}>Anulează</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={sending}
              accessibilityRole="button"
              className="ui-press h-11 px-4 rounded-[11px] flex-row items-center gap-1.5"
              style={{ backgroundColor: 'var(--c-brand-surface)', opacity: sending ? 0.7 : 1 } as any}
            >
              {sending ? <ActivityIndicator size="small" color="var(--c-on-brand)" /> : <MaterialIcons name="send" size={15} color="var(--c-on-brand)" />}
              <Text className="text-[13.5px] font-bold" style={{ color: 'var(--c-on-brand)' }}>Trimite cererea</Text>
            </Pressable>
          </View>
        </div>
      </Pressable>
    </Modal>
  );
}

export default function ChildSwitcher() {
  const [children, setChildren] = useState<FamilyChild[] | null>(null);
  const [pending, setPending] = useState<FamilyPendingRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = (force = false) => loadFamily(force)
    .then((data) => {
      setChildren(data.children);
      setPending(data.pending);
      // A stale or missing selection quietly becomes the first child.
      const stored = getActiveChildId();
      if (data.children.length && !data.children.some((child) => child.id === stored)) {
        setActiveChildId(data.children[0].id);
      }
    })
    ;

  useEffect(() => {
    void load();
  }, []);

  if (!children) return null;

  const activeId = getActiveChildId();
  const active = children.find((child) => child.id === activeId) ?? children[0] ?? null;
  const waiting = pending.filter((p) => p.status === 'pending');

  const choose = (id: number) => {
    setOpen(false);
    if (id === active?.id) return;
    setActiveChildId(id);
    window.location.reload();
  };

  return (
    <View className="w-full px-3 sm:px-4 lg:px-6 xl:px-8 pt-3">
      {active ? (
        <View
          className="rounded-[14px] border px-3 py-2.5 flex-row items-center gap-3 min-w-0"
          style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
        >
          <Pressable
            onPress={() => children.length > 1 && setOpen((v) => !v)}
            disabled={children.length < 2}
            accessibilityRole="button"
            accessibilityLabel={children.length > 1 ? `Copil: ${active.firstName} ${active.lastName}. Schimbă copilul` : `Copil: ${active.firstName} ${active.lastName}`}
            accessibilityState={{ expanded: open }}
            className="flex-1 min-w-0 flex-row items-center gap-3 text-left"
          >
            <View className="w-9 h-9 rounded-full items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-purple-bg)' }}>
              <Text className="text-[12px] font-bold" style={{ color: 'var(--c-purple-fg)' }}>{getInitials(active.firstName, active.lastName)}</Text>
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--c-faint)' }}>Copilul tău</Text>
              <Text className="text-[14.5px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
                {active.firstName} {active.lastName}
                <Text className="text-[12.5px] font-medium" style={{ color: 'var(--c-muted)' }}>{active.teams.length ? ` · ${active.teams.join(', ')}` : ''}</Text>
              </Text>
            </View>
            {children.length > 1 ? <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={20} color="var(--c-faint)" /> : null}
          </Pressable>
          <Pressable
            onPress={() => setAdding(true)}
            accessibilityRole="button"
            accessibilityLabel="Adaugă un copil"
            className="ui-press h-9 px-2.5 rounded-[10px] border flex-row items-center gap-1 shrink-0"
            style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}
          >
            <MaterialIcons name="add" size={16} color="var(--c-brand-fg)" />
            <Text className="hidden sm:flex text-[12.5px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>Copil</Text>
          </Pressable>
        </View>
      ) : (
        <View
          className="rounded-[14px] border p-4 gap-2"
          style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
        >
          <Text className="text-[15px] font-semibold" style={{ color: 'var(--c-ink)' }}>
            {waiting.length ? 'Cererea ta e la antrenor' : 'Contul nu e legat încă de un copil'}
          </Text>
          <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>
            {waiting.length
              ? `${waiting.map((p) => `${p.firstName} ${p.lastName} (${p.teamName})`).join(', ')} — după aprobare vezi programul, prezența și plățile copilului.`
              : 'Adaugă copilul cu codul echipei primit de la antrenor.'}
          </Text>
          <Pressable onPress={() => setAdding(true)} accessibilityRole="button" className="ui-press self-start h-10 px-3.5 rounded-[10px] flex-row items-center gap-1.5 mt-1" style={{ backgroundColor: 'var(--c-brand-surface)' }}>
            <MaterialIcons name="add" size={16} color="var(--c-on-brand)" />
            <Text className="text-[13px] font-bold" style={{ color: 'var(--c-on-brand)' }}>Adaugă copil</Text>
          </Pressable>
        </View>
      )}

      {open && children.length > 1 ? (
        <View className="mt-1.5 rounded-[14px] border overflow-hidden" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any} accessibilityRole={'menu' as any}>
          {children.map((child) => (
            <Pressable
              key={child.id}
              onPress={() => choose(child.id)}
              accessibilityRole={'menuitem' as any}
              className="flex-row items-center gap-3 px-3.5 py-3 text-left"
              style={{ backgroundColor: child.id === active?.id ? 'var(--c-surface-tint)' : 'transparent' }}
            >
              <Text className="flex-1 text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
                {child.firstName} {child.lastName}
                <Text className="text-[12.5px] font-medium" style={{ color: 'var(--c-muted)' }}>{child.teams.length ? ` · ${child.teams.join(', ')}` : ''}</Text>
              </Text>
              {child.id === active?.id ? <MaterialIcons name="check" size={17} color="var(--c-brand-fg)" /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {notice ? (
        <Text className="t-meta mt-2 px-1" style={{ color: 'var(--c-success-fg)' }}>{notice}</Text>
      ) : active && waiting.length ? (
        <Text className="t-meta mt-2 px-1" style={{ color: 'var(--c-muted)' }}>
          În așteptare: {waiting.map((p) => `${p.firstName} ${p.lastName}`).join(', ')}
        </Text>
      ) : null}

      <AddChildDialog
        visible={adding}
        onClose={() => setAdding(false)}
        onSent={(teamName) => {
          setAdding(false);
          setNotice(`Cererea a fost trimisă antrenorului echipei ${teamName}.`);
          void load(true);
        }}
      />
    </View>
  );
}
