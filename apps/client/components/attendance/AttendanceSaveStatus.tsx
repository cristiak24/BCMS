import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';

export type SaveState = 'idle' | 'saving' | 'saved';

/**
 * Attendance saves on every tap (audit R3-6), so there is no "Salvează"
 * button to tell the user their work is safe — this is that signal.
 * `track` wraps each request; several in flight read as one "Se salvează…".
 */
export function useSaveStatus() {
  const [state, setState] = useState<SaveState>('idle');
  const inFlight = useRef(0);
  const anySaved = useRef(false);

  const track = useCallback(async <T,>(request: Promise<T>): Promise<T> => {
    inFlight.current += 1;
    setState('saving');
    try {
      const result = await request;
      anySaved.current = true;
      return result;
    } finally {
      inFlight.current -= 1;
      if (inFlight.current === 0) setState(anySaved.current ? 'saved' : 'idle');
    }
  }, []);

  const reset = useCallback(() => {
    anySaved.current = false;
    if (inFlight.current === 0) setState('idle');
  }, []);

  return { state, track, reset };
}

export default function AttendanceSaveStatus({ state }: { state: SaveState }) {
  return (
    <View className="flex-row items-center gap-1.5 min-h-[18px]">
      {state === 'saving' ? (
        <>
          <ActivityIndicator size="small" color="var(--c-muted)" />
          <Text className="text-[12px] font-medium" style={{ color: 'var(--c-muted)' }}>Se salvează…</Text>
        </>
      ) : state === 'saved' ? (
        <>
          <MaterialIcons name="check-circle" size={14} color="var(--c-success-fg)" />
          <Text className="text-[12px] font-medium" style={{ color: 'var(--c-muted)' }}>Salvat automat</Text>
        </>
      ) : (
        <Text className="text-[12px] font-medium" style={{ color: 'var(--c-faint)' }}>Se salvează la fiecare apăsare.</Text>
      )}
    </View>
  );
}
