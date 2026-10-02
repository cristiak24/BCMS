import { useEffect } from 'react';
import { Modal, Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';

/**
 * Row-level action menu. Dense lists keep one "⋯" per row instead of a strip
 * of four coloured pills under every item; the actions live here. Bottom sheet
 * on phones, centred card from sm up.
 */
export type SheetAction = {
  key: string;
  label: string;
  icon: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
  hint?: string;
};

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

  if (!visible) return null;

  return (
    <Modal visible transparent onRequestClose={onClose}>
      <Pressable
        accessibilityLabel="Închide meniul"
        onPress={onClose}
        className="flex-1 justify-end sm:justify-center items-center sm:p-6"
        style={{ backgroundColor: 'rgba(2, 8, 23, 0.55)' }}
      >
        <Pressable
          onPress={(e: any) => e.stopPropagation()}
          accessibilityRole={'menu' as any}
          className="ui-rise w-full sm:max-w-[360px] rounded-t-[20px] sm:rounded-[18px] border overflow-hidden pb-[env(safe-area-inset-bottom)]"
          style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: '0 28px 70px rgba(2, 8, 23, 0.35)' } as any}
        >
          <View className="px-4 pt-4 pb-3 border-b" style={{ borderColor: 'var(--c-border)' }}>
            <Text className="text-[15px] font-bold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
          <View className="py-1.5">
            {actions.map((action) => {
              const fg = action.tone === 'danger' ? 'var(--c-danger-fg)' : 'var(--c-ink)';
              return (
                <Pressable
                  key={action.key}
                  onPress={() => { onClose(); action.onPress(); }}
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}
