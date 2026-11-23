import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import type { StaffResponseRow } from '../../services/eventResponsesApi';
import { RESPONSE_META, responseLabel } from '../../utils/rsvp';
import { tr } from '../../i18n';

const POPOVER_WIDTH = 240;

/**
 * The answer under a player's name in Prezență: „Vine”, „Nu vine”, „Poate”.
 * Only information — the coach marks attendance on their own. A reason opens
 * on hover or focus (fine pointer) and on tap (phones); it is also in the
 * accessible name, so it never depends on hover alone. The bubble is fixed to
 * the viewport (in a portal): the attendance rows clip their overflow.
 */
export default function RsvpIndicator({ row }: { row: StaffResponseRow | null | undefined }) {
  const anchorRef = useRef<HTMLElement | null>(null);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const open = pinned || hovered;

  useEffect(() => {
    if (!open) return undefined;
    setRect(anchorRef.current?.getBoundingClientRect() ?? null);
    // A fixed bubble would drift away from its row on scroll: close it.
    const close = () => { setPinned(false); setHovered(false); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (!row?.status) return null;
  const meta = RESPONSE_META[row.status];
  const label = responseLabel(row.status, 'third');
  const by = row.respondedByRelation === 'parent' && row.respondedByName ? tr('de {0} (părinte)', { '0': row.respondedByName }) : null;
  const a11y = [tr('A răspuns: {0}', { '0': label }), row.reason ? tr('Motiv: {0}', { '0': row.reason }) : null, by].filter(Boolean).join('. ');

  const chip = (
    <View className="h-6 px-2 rounded-full border flex-row items-center gap-1" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}>
      <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.solid }} />
      <Text className="text-[11.5px] font-semibold" style={{ color: meta.fg }} numberOfLines={1}>{label}</Text>
      {row.reason ? <MaterialIcons name="info-outline" size={12} color="var(--c-muted)" /> : null}
    </View>
  );

  if (!row.reason) {
    return <View accessible accessibilityLabel={a11y} className="shrink-0">{chip}</View>;
  }

  const left = rect ? Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8)) : 0;
  const bubble = open && rect && typeof document !== 'undefined' ? createPortal(
    <div
      role="tooltip"
      style={{
        position: 'fixed', top: rect.bottom + 6, left, width: POPOVER_WIDTH, maxWidth: 'calc(100vw - 16px)', zIndex: 60,
        background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 10, boxShadow: 'var(--e-md)', padding: '8px 10px',
      }}
    >
      <Text className="text-[12.5px] font-medium" style={{ color: 'var(--c-ink-soft)', overflowWrap: 'anywhere' } as any}>
        {tr('Motiv: {0}', { '0': `„${row.reason}”` })}
      </Text>
      {by ? <Text className="text-[11.5px] font-medium mt-0.5" style={{ color: 'var(--c-faint)', display: 'block' } as any}>{by}</Text> : null}
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <Pressable
        ref={anchorRef}
        onPress={() => setPinned((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityState={{ expanded: open }}
        className="ui-press tap-40 rounded-full shrink-0"
        {...({
          // Hover opens it on a mouse only; a tap toggles it on a phone.
          onMouseEnter: () => { if (window.matchMedia?.('(hover: hover)').matches) setHovered(true); },
          onMouseLeave: () => setHovered(false),
          onFocus: () => setHovered(true),
          onBlur: () => { setHovered(false); setPinned(false); },
          onKeyDown: (event: KeyboardEvent) => { if (event.key === 'Escape') { setHovered(false); setPinned(false); } },
        } as any)}
      >
        {chip}
      </Pressable>
      {bubble}
    </>
  );
}
