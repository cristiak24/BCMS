import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Text, TextInput, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import ModalBackdrop from './ModalBackdrop';
import Button, { type ButtonVariant } from './Button';

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
    /**
     * For irreversible actions: the user must type this exact phrase before the
     * confirm button enables (e.g. "DELETE").
     */
    requireTypedConfirmation?: string;
    /** Extra form content (a date field, a select) between message and actions. */
    children?: ReactNode;
    /** Disables confirm without a spinner (e.g. a required field is empty). */
    confirmDisabled?: boolean;
    /**
     * `alertdialog` (default) for a question that interrupts; `dialog` for a
     * form the person fills in (recording a payment), which a screen reader
     * shouldn't announce as an alert.
     */
    role?: 'alertdialog' | 'dialog';
    /**
     * Phones: a bottom sheet (the title fixed at the top, the body scrolling,
     * the buttons fixed at the bottom) instead of a centred card. For forms
     * that can be taller than a phone screen — recording a payment.
     */
    sheetOnPhone?: boolean;
    /** Overrides the confirm button's look (e.g. `warning` for a payment that leaves an advance). */
    confirmVariant?: ButtonVariant;
    /** A warning line fixed just above the buttons (with `confirmVariant: 'warning'`). */
    footerNote?: string;
    /**
     * Opens on „Renunță” although the action isn't destructive: it notifies
     * families or changes someone's permissions, so Enter alone mustn't do it.
     */
    focusCancel?: boolean;
    /**
     * False for a form with typed input (recording a payment): a stray tap beside
     * the phone sheet used to close it and drop the amount and the note. Esc and
     * „Renunță” still close it.
     */
    dismissOnBackdrop?: boolean;
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
    confirmLabel = 'Confirmă',
    cancelLabel = 'Renunță',
    destructive = false,
    loading = false,
    icon,
    requireTypedConfirmation,
    children,
    confirmDisabled = false,
    role = 'alertdialog',
    sheetOnPhone = false,
    confirmVariant,
    footerNote,
    focusCancel = false,
    dismissOnBackdrop = true,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const cardRef = useRef<HTMLDivElement | null>(null);
    const footerRef = useRef<HTMLDivElement | null>(null);
    const previouslyFocused = useRef<HTMLElement | null>(null);
    const [typed, setTyped] = useState('');

    useEffect(() => {
        if (!visible) setTyped('');
    }, [visible]);

    // „ȘTERGE” and „STERGE” both count: a Romanian keyboard types the comma-below letter.
    const plainUpper = (text: string) => text.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const confirmBlocked = confirmDisabled || (!!requireTypedConfirmation && plainUpper(typed) !== plainUpper(requireTypedConfirmation));

    // Read through refs so the effect below runs only when the dialog opens or
    // closes. Callers pass `onCancel` inline, so with it as a dependency every
    // keystroke re-ran the effect and sent focus back to the first field — typing
    // in „Notă” wrote into „Suma”.
    const onCancelRef = useRef(onCancel);
    const loadingRef = useRef(loading);
    const destructiveRef = useRef(destructive || focusCancel);
    onCancelRef.current = onCancel;
    loadingRef.current = loading;
    destructiveRef.current = destructive || focusCancel;

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

        // Once the portal has mounted: the first field when there is one (the
        // amount, a reason, the typed phrase); otherwise the primary action —
        // except on a destructive dialog, which starts on „Renunță” so Enter
        // can't delete by accident.
        const focusTimer = window.setTimeout(() => {
            const items = focusables();
            const field = items.find((el) => el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
            const cancel = footerRef.current?.querySelector<HTMLElement>('button');
            (field ?? (destructiveRef.current ? cancel : items.at(-1)))?.focus();
        }, 0);

        // Tab is the Modal's (src/web/reactNative.tsx): it keeps focus inside.
        // A second trap here ran after it and wrapped from the last control to
        // the first, so the confirm button could never be reached with Tab.
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !loadingRef.current) {
                event.preventDefault();
                onCancelRef.current();
            }
        };

        document.addEventListener('keydown', onKeyDown);

        return () => {
            window.clearTimeout(focusTimer);
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = overflow;
            previouslyFocused.current?.focus?.();
        };
    }, [visible]);

    if (!visible) {
        return null;
    }

    const resolvedIcon: IconName = icon ?? (destructive ? 'warning-amber' : 'help-outline');
    const accent = destructive ? 'var(--c-danger)' : 'var(--c-brand-fg)';
    const accentSoft = destructive ? 'var(--c-danger-bg)' : 'var(--c-surface-tint)';

    return (
        <Modal visible onRequestClose={loading ? undefined : onCancel}>
            <ModalBackdrop
                onDismiss={loading || !dismissOnBackdrop ? undefined : onCancel}
                className={sheetOnPhone ? 'items-stretch justify-end sm:items-center sm:justify-center sm:p-5' : 'items-center justify-center p-5'}
                style={{ backgroundColor: 'rgba(2, 8, 23, 0.62)' }}
            >
                {/* Never taller than the screen: the header and the buttons stay in
                    view and the body scrolls (a payment with four fees ran ~940px
                    on a 812px phone, with the name and the button cut off). */}
                <div
                    ref={cardRef}
                    role={role}
                    aria-modal="true"
                    aria-label={title}
                    aria-describedby={message ? 'confirm-dialog-message' : undefined}
                    className={`flex flex-col w-full ${sheetOnPhone
                        ? 'max-h-[92dvh] rounded-t-[20px] sm:max-w-[440px] sm:max-h-[calc(100dvh-40px)] sm:rounded-[18px] pb-[env(safe-area-inset-bottom)]'
                        : 'max-w-[440px] max-h-[calc(100dvh-40px)] rounded-[18px]'}`}
                    style={{
                        backgroundColor: 'var(--c-surface)',
                        border: '1px solid var(--c-border)',
                        boxShadow: 'var(--e-lg)',
                    }}
                >
                    <View className="flex-row items-center gap-4 px-6 pt-6 pb-3 shrink-0">
                        <View
                            className="h-12 w-12 rounded-[14px] items-center justify-center shrink-0"
                            style={{ backgroundColor: accentSoft }}
                        >
                            <MaterialIcons name={resolvedIcon as never} size={26} color={accent} />
                        </View>
                        <Text accessibilityRole="header" className="flex-1 min-w-0 text-[18px] font-bold leading-snug" style={{ color: 'var(--c-ink)' }}>{title}</Text>
                    </View>

                    <View className="min-h-0 flex-1 overflow-y-auto px-6 pb-1">
                        {/* One non-shrinking block: flex children of the scroller would
                            squeeze (and overlap) instead of scrolling. */}
                        <View className="shrink-0">
                        {message ? (
                            <Text
                                nativeID="confirm-dialog-message"
                                className="leading-5"
                                style={{ color: 'var(--c-muted)' }}
                            >
                                {message}
                            </Text>
                        ) : null}

                        {children ? <View className={message ? 'mt-5' : ''}>{children}</View> : null}

                        {requireTypedConfirmation ? (
                            <View className="mt-5 gap-1.5">
                                <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-muted)' }}>
                                    Scrie <Text className="font-bold" style={{ color: 'var(--c-ink)' }}>{requireTypedConfirmation}</Text> ca să confirmi
                                </Text>
                                <TextInput
                                    value={typed}
                                    onChangeText={setTyped}
                                    autoCapitalize="characters"
                                    autoCorrect={false}
                                    accessibilityLabel={`Scrie ${requireTypedConfirmation} ca să confirmi`}
                                    onSubmitEditing={() => { if (!confirmBlocked && !loading) onConfirm(); }}
                                    className="rounded-[10px] border px-3.5 h-11 text-[14px]"
                                    style={{ backgroundColor: 'var(--c-surface-2)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--c-border)', color: 'var(--c-ink)' } as any}
                                />
                            </View>
                        ) : null}
                        </View>
                    </View>

                    {footerNote ? (
                        <View className="flex-row items-start gap-2 px-6 pt-3 shrink-0" accessibilityRole="status">
                            <MaterialIcons name="warning-amber" size={16} color="var(--c-warning-fg)" />
                            <Text className="flex-1 min-w-0 text-[12.5px] font-semibold leading-snug" style={{ color: 'var(--c-warning-fg)' }}>{footerNote}</Text>
                        </View>
                    ) : null}

                    {/* The system's buttons: the destructive one is danger-fg on danger-bg
                        (6:1 light, 8.7:1 dark); white on --c-danger was 3.8:1 / 2.8:1. */}
                    {/* Phone sheet: both buttons span the width, the confirm last (in thumb reach), so a long
                        label („Înregistrează 1.440,00 RON”) is never cut; on wider screens the row wraps. */}
                    <div ref={footerRef} className={`flex gap-3 px-6 ${footerNote ? 'pt-3' : 'pt-4'} pb-6 shrink-0 ${sheetOnPhone ? 'flex-col sm:flex-row sm:flex-wrap sm:justify-end' : 'flex-row flex-wrap justify-end'}`}>
                        <Button
                            label={cancelLabel}
                            onPress={onCancel}
                            disabled={loading}
                            className={sheetOnPhone ? 'w-full sm:w-auto' : ''}
                        />
                        <Button
                            variant={confirmVariant ?? (destructive ? 'danger' : 'primary')}
                            label={confirmLabel}
                            onPress={onConfirm}
                            loading={loading}
                            disabled={confirmBlocked}
                            className={sheetOnPhone ? 'w-full sm:w-auto' : ''}
                        />
                    </div>
                </div>
            </ModalBackdrop>
        </Modal>
    );
}
