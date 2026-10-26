import type { CSSProperties, ReactNode } from 'react';

/**
 * The dimmed layer behind a dialog or sheet. A plain <div> that closes on a
 * click that lands on the layer itself, not inside the dialog. It used to be a
 * Pressable — a <button> wrapping the whole dialog, so the dialog and every
 * control in it sat inside a button and a screen reader could read it all as
 * one. Esc and the dialog's own buttons still close it from the keyboard.
 */
export default function ModalBackdrop({
  onDismiss,
  className,
  style,
  children,
}: {
  /** Undefined while the dialog is busy (saving): clicks outside do nothing. */
  onDismiss?: () => void;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      className={`rn-view ${className ?? ''}`}
      style={{ flex: 1, ...style }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss?.();
      }}
    >
      {children}
    </div>
  );
}
