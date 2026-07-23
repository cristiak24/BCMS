import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from '@/src/web/reactNative';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastAction {
    label: string;
    onPress: () => void;
}

export interface ToastData {
    id: number;
    message: string;
    variant: ToastVariant;
    /** Auto-dismiss delay in ms. Defaults to 4000; pass 0 to keep until dismissed. */
    duration?: number;
    action?: ToastAction;
}

let nextId = 1;

/**
 * Minimal toast queue. Replaces window.alert so feedback matches the design
 * system, and powers the undo-delete flow (an action button on a timed toast).
 */
export function useToasts() {
    const [toasts, setToasts] = useState<ToastData[]>([]);

    const dismissToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const showToast = useCallback((toast: Omit<ToastData, 'id'>) => {
        const id = nextId++;
        setToasts((prev) => [...prev, { ...toast, id }]);
        return id;
    }, []);

    return { toasts, showToast, dismissToast };
}

const VARIANT_META: Record<ToastVariant, { icon: typeof Info; fg: string; bg: string; border: string }> = {
    success: { icon: CheckCircle2, fg: 'var(--c-success-fg)', bg: 'var(--c-success-bg)', border: '#B7E9CF' },
    error: { icon: AlertTriangle, fg: 'var(--c-danger-fg)', bg: 'var(--c-danger-bg)', border: '#FDA29B' },
    info: { icon: Info, fg: 'var(--c-brand-fg)', bg: 'var(--c-surface-tint)', border: '#BFD4FE' },
};

function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: number) => void }) {
    const meta = VARIANT_META[toast.variant];
    const Icon = meta.icon;
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const duration = toast.duration ?? 4000;
        if (duration <= 0) return;
        timerRef.current = setTimeout(() => onDismiss(toast.id), duration);
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [toast.id, toast.duration, onDismiss]);

    return (
        <View
            className="flex-row items-center gap-3 rounded-[14px] px-4 py-3 shadow-[0_10px_30px_rgba(16,24,40,0.14)] border"
            style={{ backgroundColor: meta.bg, borderColor: meta.border, minWidth: 280, maxWidth: 420 }}
        >
            <Icon size={18} color={meta.fg} />
            <Text className="flex-1 text-[13px] font-bold" style={{ color: meta.fg }}>{toast.message}</Text>
            {toast.action && (
                <Pressable
                    onPress={() => {
                        toast.action?.onPress();
                        onDismiss(toast.id);
                    }}
                    className="px-3 py-1.5 rounded-full"
                    style={{ backgroundColor: meta.fg }}
                >
                    <Text className="text-white text-[12px] font-black">{toast.action.label}</Text>
                </Pressable>
            )}
            <Pressable onPress={() => onDismiss(toast.id)} accessibilityLabel="Închide notificarea" className="w-6 h-6 items-center justify-center rounded-full">
                <X size={14} color={meta.fg} />
            </Pressable>
        </View>
    );
}

/** Fixed bottom-center stack of active toasts. Render once near the page root. */
export function ToastHost({ toasts, onDismiss }: { toasts: ToastData[]; onDismiss: (id: number) => void }) {
    if (toasts.length === 0) return null;
    return (
        <View
            className="fixed left-1/2 bottom-6 z-[100] flex-col gap-2.5 items-center"
            style={{ transform: 'translateX(-50%)' as any }}
            pointerEvents="box-none"
        >
            {toasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
            ))}
        </View>
    );
}
