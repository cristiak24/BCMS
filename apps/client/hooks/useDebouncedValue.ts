import { useEffect, useState } from 'react';

/**
 * Returns a debounced copy of `value` that only updates after `delayMs` of
 * inactivity. Used to keep list filtering off the keystroke hot path so typing
 * in a search box stays smooth even with large account lists.
 */
export function useDebouncedValue<T>(value: T, delayMs = 200): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(timer);
    }, [value, delayMs]);

    return debounced;
}
