import { useEffect, useRef } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';

type IconName = string;

type ConfirmDialogProps = {
    visible: boolean;
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    /** Styles the confirm button red and uses a warning icon. */
    destructive?: boolean;
    /** Shows a spinner on the confirm button and disables both actions. */
    loading?: boolean;
    icon?: IconName;
    onConfirm: () => void;
    onCancel: () => void;
};

/**
 * Accessible, responsive confirmation modal used before any impactful action
 * (deactivate account, cancel invite, change role, deny request). Backdrop tap,
 * Escape and Cancel all dismiss; Confirm runs the action.
 *
 * Keyboard behaviour is deliberate: the confirm button takes focus on open so
 * the dialog is operable without a mouse, focus is trapped inside while it is
 * open, and it returns to the trigger on close. Body scroll is locked so the
 * page behind does not drift under the overlay.
 */
export default function ConfirmDialog({
    visible,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false,
    loading = false,
    icon,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const cardRef = useRef<HTMLDivElement | null>(null);
    const previouslyFocused = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!visible || typeof document === 'undefined') return;

        previouslyFocused.current = document.activeElement as HTMLElement | null;
        const { overflow } = document.body.style;
        document.body.style.overflow = 'hidden';

        const focusables = () =>
            Array.from(
                cardRef.current?.querySelectorAll<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
                ) ?? [],
            ).filter((el) => !el.hasAttribute('disabled'));

        // Focus the primary action once the portal has mounted.
        const focusTimer = window.setTimeout(() => focusables().at(-1)?.focus(), 0);

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !loading) {
                event.preventDefault();
                onCancel();
                return;
            }

            if (event.key !== 'Tab') return;

            const items = focusables();
            if (items.length === 0) return;

            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement;

            if (event.shiftKey && (active === first || !cardRef.current?.contains(active))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', onKeyDown);

        return () => {
            window.clearTimeout(focusTimer);
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = overflow;
            previouslyFocused.current?.focus?.();
        };
    }, [visible, loading, onCancel]);

    if (!visible) {
        return null;
    }

    const resolvedIcon: IconName = icon ?? (destructive ? 'warning-amber' : 'help-outline');
    const accent = destructive ? 'var(--c-danger)' : 'var(--c-brand-fg)';
    const accentSoft = destructive ? 'var(--c-danger-bg)' : 'var(--c-surface-tint)';

    return (
        <Modal visible onRequestClose={loading ? undefined : onCancel}>
            {/* Backdrop */}
            <Pressable
                accessibilityLabel="Dismiss dialog"
                onPress={loading ? undefined : onCancel}
                style={{
                    flex: 1,
                    backgroundColor: 'rgba(2, 8, 23, 0.62)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 20,
                }}
            >
                {/* Card — stopPropagation so taps inside don't dismiss */}
                <div
                    ref={cardRef}
                    role="alertdialog"
                    aria-modal="true"
                    aria-label={title}
                    aria-describedby={message ? 'confirm-dialog-message' : undefined}
                    onClick={(event) => event.stopPropagation()}
                    className="w-full max-w-[440px] rounded-3xl p-6"
                    style={{
                        backgroundColor: 'var(--c-surface)',
                        border: '1px solid var(--c-border)',
                        boxShadow: '0 28px 70px rgba(2, 8, 23, 0.35)',
                    }}
                >
                    <View className="flex-row items-start gap-4">
                        <View
                            className="h-12 w-12 rounded-2xl items-center justify-center"
                            style={{ backgroundColor: accentSoft }}
                        >
                            <MaterialIcons name={resolvedIcon as never} size={26} color={accent} />
                        </View>
                        <View className="flex-1">
                            <Text className="text-lg font-black" style={{ color: 'var(--c-ink)' }}>{title}</Text>
                            {message ? (
                                <Text
                                    nativeID="confirm-dialog-message"
                                    className="mt-2 leading-5"
                                    style={{ color: 'var(--c-muted)' }}
                                >
                                    {message}
                                </Text>
                            ) : null}
                        </View>
                    </View>

                    <View className="mt-6 flex-row justify-end gap-3">
                        <Pressable
                            onPress={onCancel}
                            disabled={loading}
                            accessibilityRole="button"
                            className="rounded-2xl border px-5 py-3 min-h-[44px] items-center justify-center"
                            style={{
                                borderColor: 'var(--c-border-strong)',
                                backgroundColor: 'var(--c-surface)',
                                opacity: loading ? 0.6 : 1,
                            }}
                        >
                            <Text className="font-bold" style={{ color: 'var(--c-ink-soft)' }}>{cancelLabel}</Text>
                        </Pressable>
                        <Pressable
                            onPress={onConfirm}
                            disabled={loading}
                            accessibilityRole="button"
                            className="rounded-2xl px-5 py-3 min-h-[44px] min-w-[120px] items-center justify-center"
                            style={{
                                backgroundColor: destructive ? 'var(--c-danger)' : 'var(--c-brand-surface)',
                                opacity: loading ? 0.7 : 1,
                            }}
                        >
                            {loading ? (
                                <ActivityIndicator size="small" color="var(--c-surface)" />
                            ) : (
                                <Text className="font-bold" style={{ color: 'var(--c-on-brand)' }}>{confirmLabel}</Text>
                            )}
                        </Pressable>
                    </View>
                </div>
            </Pressable>
        </Modal>
    );
}
