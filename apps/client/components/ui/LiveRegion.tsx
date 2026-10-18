import { useEffect, useState } from 'react';

/**
 * The app's screen-reader announcer: one polite and one assertive live region,
 * mounted once at the root (App.tsx) so they exist before anything is said.
 *
 * Toasts and form errors used to be visual only: each screen mounted its own
 * toast stack, and a live region that appears together with its text is not
 * announced. `announce()` writes into the regions that are always there.
 */
type Politeness = 'polite' | 'assertive';
type Listener = (message: string, politeness: Politeness) => void;

const listeners = new Set<Listener>();

export function announce(message: string, politeness: Politeness = 'polite') {
    const text = message.trim();
    if (!text) return;
    listeners.forEach((listener) => listener(text, politeness));
}

const HIDDEN = {
    position: 'absolute',
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: 0,
} as const;

export function LiveRegion() {
    const [polite, setPolite] = useState('');
    const [assertive, setAssertive] = useState('');

    useEffect(() => {
        const timers: ReturnType<typeof setTimeout>[] = [];
        const listener: Listener = (message, politeness) => {
            const set = politeness === 'assertive' ? setAssertive : setPolite;
            // Clear first: the same message twice in a row (two failed saves)
            // is only announced again if the region's text actually changes.
            set('');
            timers.push(setTimeout(() => set(message), 60));
        };
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
            timers.forEach(clearTimeout);
        };
    }, []);

    return (
        <>
            <div role="status" aria-live="polite" aria-atomic="true" style={HIDDEN}>{polite}</div>
            <div role="alert" aria-live="assertive" aria-atomic="true" style={HIDDEN}>{assertive}</div>
        </>
    );
}
