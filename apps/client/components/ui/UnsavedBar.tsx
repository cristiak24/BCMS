import { ActivityIndicator, Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';

/**
 * Floating "N modificări nesalvate · Renunță · Salvează" bar for draft-and-save
 * screens. Render it as a sibling of the page's ScrollView, inside a
 * `flex-1` root.
 *
 * Fixed, not absolute: the window scrolls (the RN-web ScrollView grows with
 * its content), so an absolute bar would sit at the end of the page. Phones
 * keep it just above the bottom nav (~88px + safe area); from lg it floats
 * bottom-right, clear of the sidebar.
 */
export default function UnsavedBar({
  label,
  saving,
  onSave,
  onDiscard,
  saveLabel = 'Salvează',
}: {
  /** Keep it short — it shares a 375px row with two buttons. */
  label: string;
  saving: boolean;
  onSave: () => void;
  onDiscard?: () => void;
  saveLabel?: string;
}) {
  return (
    <View
      className="fixed left-0 right-0 lg:bottom-6 px-3 lg:px-6 items-stretch lg:items-end z-30 bottom-[calc(96px+env(safe-area-inset-bottom,0px))]"
      style={{ pointerEvents: 'none' } as any}
    >
      <View
        className="ui-rise flex-row items-center gap-3 rounded-[16px] border pl-4 pr-2 py-2 lg:min-w-[440px]"
        style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-lg, 0 12px 32px rgba(0,0,0,0.18))', pointerEvents: 'auto' } as any}
      >
        <View className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--c-warning)' }} />
        <Text className="flex-1 min-w-0 text-[13.5px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
          {label}
        </Text>
        {onDiscard ? (
          <Pressable
            onPress={onDiscard}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Renunță la modificări"
            className="ui-press h-10 px-3 rounded-[10px] items-center justify-center"
          >
            <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-muted)' }}>Renunță</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={saveLabel}
          className="ui-press h-10 px-4 rounded-[10px] flex-row items-center justify-center gap-1.5"
          style={{ backgroundColor: 'var(--c-brand-surface)', opacity: saving ? 0.7 : 1 } as any}
        >
          {saving ? <ActivityIndicator size="small" color="var(--c-on-brand)" /> : <MaterialIcons name="save" size={16} color="var(--c-on-brand)" />}
          <Text className="text-[13.5px] font-bold" style={{ color: 'var(--c-on-brand)' }}>{saveLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}
