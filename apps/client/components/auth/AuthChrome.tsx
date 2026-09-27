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
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute inset-0 bg-[#EDF4FA]" />
            <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(18,59,149,0.08)_0%,rgba(18,59,149,0.025)_31%,rgba(255,255,255,0)_58%),linear-gradient(245deg,rgba(217,119,6,0.12)_0%,rgba(217,119,6,0.035)_28%,rgba(255,255,255,0)_56%)]" />
            <div className="absolute inset-0 opacity-55 [background-image:linear-gradient(rgba(18,59,149,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(18,59,149,0.045)_1px,transparent_1px)] [background-size:34px_34px]" />
            <div className="absolute -left-24 top-0 h-full w-[58%] skew-x-[-10deg] bg-white/34" />
            <div className="absolute bottom-0 right-0 h-[48%] w-[62%] skew-x-[-14deg] bg-[#FFF7E8]/52" />

            <svg className="absolute inset-0 h-full w-full opacity-80" viewBox="0 0 1440 900" fill="none" preserveAspectRatio="none">
                <path d="M-80 713C154 585 302 635 472 517C638 402 795 317 1057 374C1222 410 1340 351 1510 268" stroke="var(--c-brand-fg)" strokeOpacity="0.10" strokeWidth="3" />
                <path d="M-92 252C145 334 279 279 463 355C643 429 688 552 905 555C1100 558 1217 482 1510 533" stroke="var(--c-success-fg)" strokeOpacity="0.13" strokeWidth="3" />
                <path d="M83 108H587V365H83V108Z" stroke="var(--c-brand-fg)" strokeOpacity="0.08" strokeWidth="2" />
                <path d="M942 570H1390V874H942V570Z" stroke="var(--c-warning)" strokeOpacity="0.10" strokeWidth="2" />
                <circle cx="336" cy="236" r="72" stroke="var(--c-brand-fg)" strokeOpacity="0.08" strokeWidth="2" />
                <circle cx="1167" cy="722" r="96" stroke="var(--c-warning)" strokeOpacity="0.10" strokeWidth="2" />
                <path d="M336 108V365M83 236H587M1167 570V874M942 722H1390" stroke="var(--c-brand-fg)" strokeOpacity="0.055" strokeWidth="2" />
            </svg>
        </div>
    );
}

/**
 * Small brand row above the card. Login shows it on phones only (desktop has
 * the brand panel); signup has no panel, so it shows it everywhere.
 */
export function MobileBrand({ showOnDesktop = false }: { showOnDesktop?: boolean }) {
    return (
        <div className={`mb-3 flex items-center gap-2.5 ${showOnDesktop ? '' : 'md:hidden'}`}>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#123B95] text-white">
                <BrandGlyph size={22} />
            </div>
            <div>
                <p className="m-0 text-base font-black leading-tight text-slate-950">BCMS</p>
                <p className="m-0 text-[11px] font-bold text-slate-500">Club workspace</p>
            </div>
        </div>
    );
}

export function AuthCard({ children }: { children: ReactNode }) {
    return (
        <div className="rounded-lg border border-white/80 bg-white/82 p-4 shadow-xl shadow-slate-400/30 backdrop-blur-xl sm:p-6 md:p-7">
            {children}
        </div>
    );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle?: string }) {
    return (
        <div className="mb-5">
            <h1 className="m-0 text-2xl font-black leading-tight text-slate-950 md:text-3xl">{title}</h1>
            {subtitle ? (
                <p className="m-0 mt-1.5 text-sm font-semibold leading-6 text-slate-500">{subtitle}</p>
            ) : null}
        </div>
    );
}

export const authLabelClass = 'mb-1.5 flex items-center justify-between text-[13px] font-black text-slate-700';
export const authFieldClass =
    'flex min-h-[48px] items-center rounded-lg border bg-white px-3 transition-colors focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100';
export const authInputClass =
    'min-h-[46px] min-w-0 flex-1 bg-transparent text-[15px] font-bold text-slate-950 outline-none placeholder:text-slate-400';
export const authPrimaryButtonClass =
    'flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg border-0 bg-[#2563EB] px-4 text-[15px] font-black text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-[#1D4ED8] active:bg-[#1E3A8A] disabled:cursor-not-allowed disabled:opacity-70';
