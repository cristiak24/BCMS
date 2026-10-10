import type { ReactNode } from 'react';

/**
 * Shared chrome for the login and signup pages: backdrop, brand mark and the
 * compact form-control classes, so both screens keep one visual rhythm.
 */

type GlyphProps = {
    className?: string;
    size?: number;
};

export function BrandGlyph({ className, size = 28 }: GlyphProps) {
    return (
        <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 32 32" fill="none">
            <path d="M7 9.5C9.8 6.8 12.9 5.4 16 5.4c3.1 0 6.2 1.4 9 4.1v5.2c0 6.2-3.3 10.5-9 13.4-5.7-2.9-9-7.2-9-13.4V9.5Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
            <circle cx="16" cy="15.6" r="5.2" stroke="currentColor" strokeWidth="2" />
            <path d="M10.8 15.6h10.4M16 10.4v10.4M12.4 11.9c2.4 1.6 4.8 1.6 7.2 0M12.4 19.3c2.4-1.6 4.8-1.6 7.2 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
    );
}

export function PageBackdrop() {
    return (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[var(--c-bg)]">
            <div className="absolute inset-0 opacity-70 [background-image:radial-gradient(var(--c-border-strong)_1px,transparent_1.2px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_70%_60%_at_35%_45%,#000,transparent)]" />
        </div>
    );
}

/**
 * Brand lockup. On the login page it only shows below the desktop split (the
 * brand column carries it there); signup has no column, so it shows always.
 */
export function MobileBrand({ showOnDesktop = false }: { showOnDesktop?: boolean }) {
    return (
        <div className={`mb-5 flex items-center gap-2.5 ${showOnDesktop ? '' : 'lg:hidden'}`}>
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--c-brand-surface)] text-white">
                <BrandGlyph size={22} />
            </div>
            <div>
                <p className="m-0 text-base font-extrabold leading-tight tracking-tight text-[var(--c-ink-strong)]">BCMS</p>
                <p className="m-0 text-[11px] font-semibold text-[var(--c-muted)]">Club workspace</p>
            </div>
        </div>
    );
}

export function AuthCard({ children }: { children: ReactNode }) {
    return (
        <div className="ui-rise rounded-[var(--r-xl)] border border-[var(--c-border)] bg-[var(--c-surface)] p-5 shadow-[var(--e-md)] sm:p-7">
            {children}
        </div>
    );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle?: string }) {
    return (
        <div className="mb-6">
            <span className="mb-3 block h-[3px] w-7 rounded-full bg-[var(--c-brand-surface)]" />
            <h1 className="m-0 text-2xl font-extrabold leading-tight tracking-tight text-[var(--c-ink-strong)] md:text-[28px]">{title}</h1>
            {subtitle ? (
                <p className="m-0 mt-1.5 text-sm font-medium leading-6 text-[var(--c-muted)]">{subtitle}</p>
            ) : null}
        </div>
    );
}

export const authLabelClass = 'mb-1.5 flex items-center justify-between text-[13px] font-bold text-[var(--c-ink-soft)]';
export const authFieldClass =
    'flex min-h-[48px] items-center rounded-[var(--r-md)] border bg-[var(--c-surface)] px-3.5 transition-colors focus-within:border-[var(--c-brand-border)] focus-within:ring-[3px] focus-within:ring-[var(--c-brand-border)]/20';
export const authInputClass =
    'min-h-[46px] min-w-0 flex-1 bg-transparent text-[15px] font-medium text-[var(--c-ink-strong)] outline-none placeholder:text-[var(--c-muted)]/70';
export const authPrimaryButtonClass =
    'flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[var(--r-md)] border-0 bg-[var(--c-brand-surface)] px-4 text-[15px] font-bold text-white shadow-[var(--e-sm)] transition-colors hover:bg-[var(--c-brand-strong)] disabled:cursor-not-allowed disabled:opacity-70';
