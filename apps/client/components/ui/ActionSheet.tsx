import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from '@/src/web/reactNative';
import ModalBackdrop from './ModalBackdrop';
import { MaterialIcons } from '@/src/web/expoVectorIcons';

/**
 * Row-level action menu. Dense lists keep one "⋯" per row instead of a strip
 * of four coloured pills under every item; the actions live here. Bottom sheet
 * on phones, a centred card on tablets, and from lg a menu right under (or
 * above) the button that opened it — centred on a desktop it sat far from the
 * row it belonged to. Arrow keys, Home and End move between the items.
 */
export type SheetAction = {
  key: string;
  label: string;
  icon: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
  hint?: string;
  /** The action moves to another step of the same sheet instead of closing it. */
  keepOpen?: boolean;
};

// The control that opens a menu: the last button pressed (pointer or Enter/Space),
// recorded before the dialog moves focus inside itself.
let lastTrigger: { el: HTMLElement; at: number } | null = null;
if (typeof document !== 'undefined') {
  const remember = (event: Event) => {
    if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return;
    const el = (event.target as Element | null)?.closest?.('button, [role="button"]') as HTMLElement | null;
    if (el) lastTrigger = { el, at: Date.now() };
  };
  document.addEventListener('pointerdown', remember, true);
  document.addEventListener('keydown', remember, true);
}

export default function ActionSheet({
  visible,
  title,
  subtitle,
  actions,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!visible || typeof document === 'undefined') return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  // Anchored to the ⋯ that was just pressed. Desktop only; opened any other way
  // (or the trigger is gone), it stays centred.
  const [anchor, setAnchor] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  useLayoutEffect(() => {
    if (!visible || typeof window === 'undefined' || window.innerWidth < 1024) {
      setAnchor(null);
      return;
    }
    const trigger = lastTrigger && Date.now() - lastTrigger.at < 1500 && lastTrigger.el.isConnected ? lastTrigger.el : null;
    if (!trigger) {
      setAnchor(null);
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const right = Math.max(12, window.innerWidth - rect.right);
    // Low on the screen: open upwards so the menu isn't cut off.
    setAnchor(rect.bottom > window.innerHeight * 0.6
      ? { bottom: window.innerHeight - rect.top + 6, right }
      : { top: rect.bottom + 6, right });
  }, [visible]);

  const menuRef = useRef<HTMLElement | null>(null);
  const onMenuKey = (event: { key: string; preventDefault: () => void }) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const last = items.length - 1;
    const next = event.key === 'ArrowDown' ? (at < 0 || at === last ? 0 : at + 1)
      : event.key === 'ArrowUp' ? (at <= 0 ? last : at - 1)
        : event.key === 'Home' ? 0
          : event.key === 'End' ? last
            : null;
    if (next === null) return;
    event.preventDefault();
    items[next]?.focus();
  };

  if (!visible) return null;

  return (
    <Modal visible transparent onRequestClose={onClose}>
      <ModalBackdrop
        onDismiss={onClose}
        className="flex-1 justify-end sm:justify-center items-center sm:p-6"
        // Anchored to its button, the menu needs no dark veil over the page.
        style={{ backgroundColor: anchor ? 'transparent' : 'rgba(2, 8, 23, 0.55)' }}
      >
        {/* A named dialog holding a named menu; „Închide” sits outside the menu
            (a menu holds only menu items). */}
        <View
          accessibilityRole={'dialog' as any}
          accessibilityLabel={title}
          aria-modal="true"
          className={`ui-rise w-full sm:max-w-[360px] rounded-t-[20px] sm:rounded-[18px] border overflow-hidden pb-[env(safe-area-inset-bottom)] ${anchor ? 'lg:max-w-[300px] lg:rounded-[14px]' : ''}`}
          style={{
            backgroundColor: 'var(--c-surface)',
            borderColor: 'var(--c-border)',
            boxShadow: anchor ? 'var(--e-lg)' : '0 28px 70px rgba(2, 8, 23, 0.35)',
            ...(anchor ? { position: 'fixed', top: anchor.top, bottom: anchor.bottom, right: anchor.right } : null),
          } as any}
        >
          <View className="px-4 pt-4 pb-3 border-b" style={{ borderColor: 'var(--c-border)' }}>
            <Text className="text-[15px] font-bold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
          <View ref={menuRef} className="py-1.5" accessibilityRole={'menu' as any} accessibilityLabel={title} onKeyDown={onMenuKey}>
            {actions.map((action) => {
              const fg = action.tone === 'danger' ? 'var(--c-danger-fg)' : 'var(--c-ink)';
              return (
                <Pressable
                  key={action.key}
                  onPress={() => { if (!action.keepOpen) onClose(); action.onPress(); }}
                  accessibilityRole={'menuitem' as any}
                  className="ui-press flex-row items-center gap-3 px-4 py-3 text-left hover:bg-[var(--c-surface-2)]"
                >
                  <MaterialIcons name={action.icon} size={19} color={action.tone === 'danger' ? 'var(--c-danger-fg)' : 'var(--c-muted)'} />
                  <View className="flex-1 min-w-0">
                    <Text className="text-[14px] font-semibold" style={{ color: fg }}>{action.label}</Text>
                    {action.hint ? <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>{action.hint}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <View className="sm:hidden px-4 pb-4 pt-1">
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              className="ui-press h-11 rounded-[12px] items-center justify-center"
              style={{ backgroundColor: 'var(--c-surface-3)' }}
            >
              <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>Închide</Text>
            </Pressable>
          </View>
        </View>
      </ModalBackdrop>
    </Modal>
  );
}
