import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useLocation } from 'react-router-dom';
import { l12Api } from '../../services/l12Api';

/** Admin and coach share the L12 screens under their own prefix. */
export function useL12Base() {
  const { pathname } = useLocation();
  return pathname.startsWith('/coach') ? '/coach/l12' : '/admin/l12';
}

export function StatusChip({ set, label }: { set: boolean; label?: string }) {
  return (
    <View className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1 self-start" style={{ backgroundColor: set ? 'var(--c-success-bg)' : 'var(--c-surface-3)' }}>
      <MaterialIcons name={set ? 'check-circle' : 'radio-button-unchecked'} size={13} color={set ? 'var(--c-success-fg)' : 'var(--c-muted)'} />
      <Text className="text-[12px] font-bold" style={{ color: set ? 'var(--c-success-fg)' : 'var(--c-muted)' }}>{label ?? (set ? 'Setat' : 'Nesetat')}</Text>
    </View>
  );
}

/** Small "L12" entry on a match's detail page. */
export function L12MatchLink({ eventId, onOpen }: { eventId: number; onOpen: (path: string) => void }) {
  const base = useL12Base();
  const [state, setState] = useState<'loading' | 'set' | 'unset' | 'hidden'>('loading');
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    l12Api.getForEvent(eventId)
      .then((data) => {
        if (cancelled) return;
        setCount(data.lineup?.players.length ?? 0);
        setState(data.lineup ? 'set' : 'unset');
      })
      // 403 for roles that can't edit L12 (accountant/staff) — just hide it.
      .catch(() => { if (!cancelled) setState('hidden'); });
    return () => { cancelled = true; };
  }, [eventId]);

  if (state === 'hidden') return null;

  return (
    <Pressable
      onPress={() => onOpen(`${base}/match/${eventId}`)}
      accessibilityRole="button"
      accessibilityLabel="Deschide L12 pentru acest meci"
      className="ui-lift ui-press rounded-[16px] border p-4 flex-row items-center gap-3 text-left"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
    >
      <View className="w-10 h-10 rounded-[11px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
        <MaterialIcons name="assignment" size={19} color="var(--c-brand-fg)" />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-[15px] font-semibold" style={{ color: 'var(--c-ink)' }}>L12 — lista oficială</Text>
        <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }}>
          {state === 'loading' ? 'Se verifică…' : state === 'set' ? `${count} jucători pe foaie · export PDF / Word` : 'Nesetat — pornește din L12-ul constant'}
        </Text>
      </View>
      {state === 'loading' ? <ActivityIndicator size="small" color="var(--c-faint)" /> : <StatusChip set={state === 'set'} label={state === 'set' ? `${count}/12` : 'Nesetat'} />}
      <MaterialIcons name="chevron-right" size={20} color="var(--c-faint)" />
    </Pressable>
  );
}
