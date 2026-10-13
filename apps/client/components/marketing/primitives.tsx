import { useEffect, useRef, useState, type ReactNode } from 'react';

function prefersReducedMotion() {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Fades a block in once it scrolls into view. Renders visible straight away without IntersectionObserver or with reduced motion. */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined' || prefersReducedMotion());

    useEffect(() => {
        if (shown) return;
        const node = ref.current;
        if (!node) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setShown(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '0px 0px -6% 0px', threshold: 0.05 },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [shown]);

    return (
        <div
            ref={ref}
            className={`${shown ? 'ui-rise' : 'opacity-0'} ${className}`}
            style={shown && delay ? { animationDelay: `${delay}ms` } : undefined}
        >
            {children}
        </div>
    );
}

/** Half-court line drawing; colour comes from `currentColor`. */
export function CourtArt({ className = '' }: { className?: string }) {
    return (
        <svg aria-hidden="true" className={className} viewBox="0 0 500 470" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="10" y="10" width="480" height="450" rx="3" />
            <rect x="170" y="10" width="160" height="190" />
            <path d="M190 200a60 60 0 0 0 120 0" />
            <path d="M190 200a60 60 0 0 1 120 0" strokeDasharray="7 9" />
            <path d="M220 40h60" />
            <circle cx="250" cy="52" r="9" />
            <path d="M210 52a40 40 0 0 0 80 0" />
            <path d="M30 10v132a237.5 237.5 0 0 0 440 0V10" />
            <path d="M190 460a60 60 0 0 1 120 0" />
        </svg>
    );
}

export function SectionHead({
    eyebrow,
    title,
    description,
    inverse = false,
}: {
    eyebrow: string;
    title: ReactNode;
    description?: ReactNode;
    inverse?: boolean;
}) {
    return (
        <div className="max-w-[640px] 2xl:max-w-[760px]">
            <p className={`m-0 text-[12px] font-bold uppercase tracking-[0.1em] ${inverse ? 'text-[var(--c-tint-fg)]' : 'text-[var(--c-brand-fg)]'}`}>{eyebrow}</p>
            <h2
                className={`m-0 mt-3 text-balance font-extrabold tracking-[-0.03em] ${inverse ? 'text-[var(--c-hero-fg)]' : 'text-[var(--c-ink-strong)]'}`}
                style={{ fontSize: 'clamp(28px, 1.4vw + 22px, 48px)', lineHeight: 1.1 }}
            >
                {title}
            </h2>
            {description ? (
                <p className={`m-0 mt-4 text-[16px] font-medium leading-7 ${inverse ? 'text-[var(--c-hero-muted)]' : 'text-[var(--c-muted)]'}`}>{description}</p>
            ) : null}
        </div>
    );
}

type Tone = 'success' | 'warning' | 'danger' | 'brand' | 'neutral' | 'sky';

const TONES: Record<Tone, string> = {
    success: 'bg-[var(--c-success-bg)] text-[var(--c-success-fg)]',
    warning: 'bg-[var(--c-warning-bg)] text-[var(--c-warning-fg)]',
    danger: 'bg-[var(--c-danger-bg)] text-[var(--c-danger-fg)]',
    brand: 'bg-[var(--c-surface-tint)] text-[var(--c-brand-fg)]',
    neutral: 'bg-[var(--c-surface-3)] text-[var(--c-ink-soft)]',
    sky: 'bg-[var(--c-sky-bg)] text-[var(--c-sky-fg)]',
};

export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
    return (
        <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold ${TONES[tone]}`}>
            {children}
        </span>
    );
}

export function Avatar({ initials, size = 28 }: { initials: string; size?: number }) {
    return (
        <span
            className="flex shrink-0 items-center justify-center rounded-full bg-[var(--c-surface-3)] text-[10px] font-bold text-[var(--c-ink-soft)]"
            style={{ width: size, height: size }}
        >
            {initials}
        </span>
    );
}
