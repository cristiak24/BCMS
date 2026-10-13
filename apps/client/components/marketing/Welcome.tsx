import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    ArrowRight,
    Check,
    ChevronDown,
    CreditCard,
    FileText,
    Link2,
    Lock,
    Menu,
    Moon,
    Smartphone,
    Sun,
    WifiOff,
    X,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { BrandGlyph } from '../auth/AuthChrome';
import { Avatar, Chip, CourtArt, Reveal, SectionHead } from './primitives';
import LegalLinks from '../legal/LegalLinks';

/**
 * Public page shown at "/" to signed-out visitors. Pure presentation plus the
 * login/signup entry points: no data fetching, so it renders instantly even
 * before Clerk has finished loading. All names and numbers in the mockups are
 * illustrative.
 */

const NAV_LINKS: Array<{ id: string; label: string }> = [
    { id: 'functionalitati', label: 'Funcționalități' },
    { id: 'live', label: 'Statistici live' },
    { id: 'cum-functioneaza', label: 'Cum funcționează' },
    { id: 'securitate', label: 'Siguranță' },
    { id: 'intrebari', label: 'Întrebări' },
];

const container = 'mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-20';
const sectionSpacing = 'scroll-mt-20 py-16 sm:py-24';
const primaryButton =
    'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[var(--r-md)] border-0 bg-[var(--c-brand-surface)] px-6 text-[15px] font-bold text-white no-underline shadow-[var(--e-sm)] transition-colors hover:bg-[var(--c-brand-strong)]';
const secondaryButton =
    'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[var(--r-md)] border border-[var(--c-border-strong)] bg-[var(--c-surface)] px-6 text-[15px] font-bold text-[var(--c-ink-strong)] no-underline transition-colors hover:bg-[var(--c-surface-2)]';

function scrollToSection(id: string) {
    const node = document.getElementById(id);
    if (!node) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

function ThemeToggleButton() {
    const { theme, toggle } = useTheme();
    return (
        <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Comută la tema luminoasă' : 'Comută la tema întunecată'}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[var(--r-md)] border border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-muted)] transition-colors hover:border-[var(--c-border-strong)] hover:text-[var(--c-ink)]"
        >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
    );
}

function Header() {
    const navigate = useNavigate();
    const [scrolled, setScrolled] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    useEffect(() => {
        if (!menuOpen) return;
        const onKey = (event: globalThis.KeyboardEvent) => {
            if (event.key === 'Escape') setMenuOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [menuOpen]);

    const goTo = (id: string) => {
        setMenuOpen(false);
        scrollToSection(id);
    };

    return (
        <header
            className={`sticky top-0 z-40 border-b backdrop-blur transition-[background-color,border-color] duration-200 ${
                scrolled || menuOpen
                    ? 'border-[var(--c-border)] bg-[var(--c-surface)]/90'
                    : 'border-transparent bg-[var(--c-bg)]/70'
            }`}
        >
            <div className={`${container} flex h-16 items-center justify-between gap-4`}>
                <a
                    href="#"
                    onClick={(event) => {
                        event.preventDefault();
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="flex items-center gap-2.5 no-underline"
                    aria-label="BCMS, înapoi sus"
                >
                    <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--c-brand-surface)] text-white">
                        <BrandGlyph size={21} />
                    </span>
                    <span className="text-base font-extrabold tracking-tight text-[var(--c-ink-strong)]">BCMS</span>
                </a>

                <nav aria-label="Secțiuni" className="hidden items-center gap-1 lg:flex">
                    {NAV_LINKS.map((link) => (
                        <a
                            key={link.id}
                            href={`#${link.id}`}
                            onClick={(event) => {
                                event.preventDefault();
                                goTo(link.id);
                            }}
                            className="rounded-[var(--r-sm)] px-3 py-2 text-[14px] font-semibold text-[var(--c-ink-soft)] no-underline transition-colors hover:bg-[var(--c-surface-3)] hover:text-[var(--c-ink-strong)]"
                        >
                            {link.label}
                        </a>
                    ))}
                </nav>

                <div className="flex items-center gap-2">
                    <ThemeToggleButton />
                    <button
                        type="button"
                        onClick={() => navigate('/login')}
                        className="flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-[var(--r-md)] border-0 bg-[var(--c-brand-surface)] px-4 text-[14px] font-bold text-white shadow-[var(--e-sm)] transition-colors hover:bg-[var(--c-brand-strong)]"
                    >
                        Autentificare
                    </button>
                    <button
                        type="button"
                        onClick={() => setMenuOpen((open) => !open)}
                        aria-expanded={menuOpen}
                        aria-controls="welcome-mobile-menu"
                        aria-label={menuOpen ? 'Închide meniul' : 'Deschide meniul'}
                        className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[var(--r-md)] border border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-ink)] lg:hidden"
                    >
                        {menuOpen ? <X size={18} /> : <Menu size={18} />}
                    </button>
                </div>
            </div>

            {menuOpen ? (
                <nav id="welcome-mobile-menu" aria-label="Secțiuni" className="ui-rise absolute inset-x-0 top-full border-b border-t border-[var(--c-border)] bg-[var(--c-surface)] shadow-[var(--e-md)] lg:hidden">
                    <div className={`${container} flex flex-col py-2`}>
                        {NAV_LINKS.map((link) => (
                            <a
                                key={link.id}
                                href={`#${link.id}`}
                                onClick={(event) => {
                                    event.preventDefault();
                                    goTo(link.id);
                                }}
                                className="flex min-h-[48px] items-center border-b border-[var(--c-border-soft)] text-[15px] font-semibold text-[var(--c-ink)] no-underline last:border-b-0"
                            >
                                {link.label}
                            </a>
                        ))}
                        <Link
                            to="/signup"
                            className="flex min-h-[48px] items-center text-[15px] font-bold text-[var(--c-brand-fg)] no-underline"
                        >
                            Am un cod de invitație — creează cont
                        </Link>
                    </div>
                </nav>
            ) : null}
        </header>
    );
}

/** Product mockup for the hero. Decorative, built from the real tokens. */
function HeroPreview() {
    const card = 'rounded-[var(--r-lg)] border border-[var(--c-border)] bg-[var(--c-surface)]';
    const label = 'm-0 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--c-muted)]';
    return (
        <div aria-hidden="true" className="relative mx-auto w-full max-w-[560px] select-none sm:pb-8 lg:mx-0 lg:ml-auto lg:pb-10 min-[1800px]:[zoom:1.22]">
            <div className="ui-rise overflow-hidden rounded-[var(--r-xl)] border border-[var(--c-border)] bg-[var(--c-bg-alt)] shadow-[var(--e-lg)]" style={{ animationDelay: '0.12s' }}>
                <div className="flex h-11 items-center gap-1.5 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-4">
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--c-border-strong)]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--c-border-strong)]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--c-border-strong)]" />
                    <span className="ml-3 text-[11.5px] font-semibold text-[var(--c-muted)]">U16 Masculin · Acasă</span>
                </div>

                <div className="grid gap-3 p-3.5 sm:grid-cols-5 sm:p-4">
                    <div className={`${card} p-4 sm:col-span-3`}>
                        <div className="flex items-center justify-between gap-2">
                            <p className={`${label} flex items-center gap-2`}>
                                <span className="ui-ping h-2 w-2 rounded-full bg-[var(--c-success)]" />
                                Următorul meci
                            </p>
                            <Chip tone="sky">FRB</Chip>
                        </div>
                        <div className="mt-3.5 flex items-center gap-3">
                            <div className="flex h-[50px] w-[50px] shrink-0 flex-col items-center justify-center rounded-[var(--r-md)] bg-[var(--c-surface-tint)]">
                                <span className="text-[9.5px] font-bold uppercase tracking-wider text-[var(--c-brand-fg)]">Sâm</span>
                                <span className="text-[21px] font-extrabold leading-none tracking-tight text-[var(--c-ink-strong)]">14</span>
                            </div>
                            <div className="min-w-0">
                                <p className="m-0 text-[14px] font-extrabold leading-tight tracking-tight text-[var(--c-ink-strong)]">
                                    U16 Masculin <span className="font-semibold text-[var(--c-muted)]">vs</span> CSM Rivals
                                </p>
                                <p className="m-0 mt-1 text-[12px] font-medium text-[var(--c-muted)]">18:30 · Sala Polivalentă</p>
                            </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between rounded-[var(--r-md)] bg-[var(--c-surface-2)] px-3 py-2">
                            <span className="text-[12px] font-semibold text-[var(--c-muted)]">Lista oficială L12</span>
                            <span className="text-[12px] font-bold text-[var(--c-ink-strong)]">10 / 12 pe foaie</span>
                        </div>
                    </div>

                    <div className={`${card} p-4 sm:col-span-2`}>
                        <p className={label}>Prezență · marți</p>
                        <p className="m-0 mt-2 text-[26px] font-extrabold leading-none tracking-tight text-[var(--c-ink-strong)] t-num">
                            12<span className="text-[15px] font-semibold text-[var(--c-muted)]"> / 14</span>
                        </p>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--c-surface-3)]">
                            <div className="ui-bar h-full w-[86%] rounded-full bg-[var(--c-brand-surface)]" />
                        </div>
                        <p className="m-0 mt-2 text-[11.5px] font-medium text-[var(--c-muted)]">marcată de antrenor</p>
                    </div>

                    <div className={`${card} p-4 sm:col-span-5`}>
                        <div className="flex items-center justify-between gap-2">
                            <p className={label}>Cotizații · martie</p>
                            <span className="text-[12px] font-bold text-[var(--c-ink-strong)]">9 din 12 achitate</span>
                        </div>
                        <div className="mt-3 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
                            <div className="ui-bar h-full w-[75%] rounded-full bg-[var(--c-success)]" />
                            <div className="h-full flex-1 rounded-full bg-[var(--c-danger)] opacity-70" />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            <Chip tone="success">9 achitate</Chip>
                            <Chip tone="danger">3 restante</Chip>
                        </div>
                    </div>
                </div>
            </div>

            <div className="ui-rise mt-3 w-[190px] sm:absolute sm:bottom-0 sm:right-[-14px] sm:mt-0" style={{ animationDelay: '0.3s' }}>
                <div className="auth-float rounded-[var(--r-lg)] border border-[var(--c-border)] bg-[var(--c-surface)] p-3.5 shadow-[var(--e-lg)]">
                    <p className={`${label} flex items-center gap-2`}>
                        <span className="ui-ping h-2 w-2 rounded-full bg-[var(--c-danger)]" />
                        Live · Q4 03:12
                    </p>
                    <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-[26px] font-extrabold leading-none tracking-tight text-[var(--c-ink-strong)] t-num">68</span>
                        <span className="text-[12px] font-semibold text-[var(--c-faint)]">–</span>
                        <span className="text-[26px] font-extrabold leading-none tracking-tight text-[var(--c-muted)] t-num">61</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Hero() {
    const navigate = useNavigate();
    return (
        <section className="relative isolate overflow-hidden">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
                <div className="absolute inset-0 bg-[var(--c-bg)]" />
                <CourtArt className="absolute -right-24 top-6 h-[520px] w-[560px] text-[var(--c-border)] opacity-60 lg:hidden" />
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-[var(--c-bg)]" />
            </div>

            <div className={`${container} grid items-center gap-12 pb-14 pt-12 sm:pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10 lg:pb-24 lg:pt-24 2xl:grid-cols-2 2xl:gap-20 2xl:pb-32 2xl:pt-32`}>
                <div>
                    <p
                        className="ui-rise m-0 inline-flex items-center gap-2 rounded-full border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--c-ink-soft)]"
                    >
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--c-brand-surface)]" />
                        Platformă pentru cluburi de baschet
                    </p>
                    <h1
                        className="ui-rise m-0 mt-5 text-balance font-extrabold tracking-[-0.04em] text-[var(--c-ink-strong)]"
                        style={{ animationDelay: '0.05s', fontSize: 'clamp(38px, 2.6vw + 27px, 80px)', lineHeight: 1.04 }}
                    >
                        Tot clubul de baschet,{' '}
                        <span className="text-[var(--c-brand-fg)]">
                            <span className="whitespace-nowrap">într-un</span> singur loc.
                        </span>
                    </h1>
                    <p
                        className="ui-rise m-0 mt-5 max-w-[540px] text-[17px] font-medium leading-[1.65] text-[var(--c-muted)] sm:text-[18px] 2xl:max-w-[640px] 2xl:text-[20px]"
                        style={{ animationDelay: '0.1s' }}
                    >
                        BCMS adună programul, prezența, vizele medicale, plățile și statisticile live ale meciurilor într-o
                        singură aplicație, pe care o folosesc antrenorii, jucătorii, părinții și conducerea clubului.
                    </p>
                    <div className="ui-rise mt-8 flex flex-col gap-3 sm:flex-row" style={{ animationDelay: '0.15s' }}>
                        <button type="button" onClick={() => navigate('/login')} className={`${primaryButton} cursor-pointer`}>
                            Autentificare <ArrowRight size={17} />
                        </button>
                        <a
                            href="#functionalitati"
                            onClick={(event) => {
                                event.preventDefault();
                                scrollToSection('functionalitati');
                            }}
                            className={secondaryButton}
                        >
                            Vezi ce poate face
                        </a>
                    </div>
                    <ul
                        className="ui-rise m-0 mt-7 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-[13px] font-semibold text-[var(--c-muted)]"
                        style={{ animationDelay: '0.2s' }}
                    >
                        {['Înscriere pe bază de invitație', 'Telefon și desktop', 'Temă luminoasă și întunecată'].map((item) => (
                            <li key={item} className="flex items-center gap-1.5">
                                <Check size={14} className="text-[var(--c-success)]" />
                                {item}
                            </li>
                        ))}
                    </ul>
                    <p className="ui-rise m-0 mt-5 text-[14px] font-medium text-[var(--c-muted)]" style={{ animationDelay: '0.25s' }}>
                        Ai un cod de invitație?{' '}
                        <Link to="/signup" className="font-bold text-[var(--c-brand-fg)] no-underline hover:underline">
                            Creează cont
                        </Link>
                    </p>
                </div>

                <div className="relative">
                    <CourtArt
                        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 hidden h-[140%] w-auto -translate-x-[40%] -translate-y-1/2 text-[var(--c-border)] opacity-60 lg:block"
                    />
                    <HeroPreview />
                </div>
            </div>
        </section>
    );
}

const ROLE_STRIP = ['Administrator', 'Antrenor', 'Jucător', 'Părinte', 'Contabil', 'Staff'];

function RolesStrip() {
    return (
        <section aria-label="Roluri" className="border-y border-[var(--c-border)] bg-[var(--c-surface)]">
            <div className={`${container} flex flex-col items-start gap-4 py-6 lg:flex-row lg:items-center lg:gap-10`}>
                <p className="m-0 shrink-0 text-[13px] font-semibold text-[var(--c-muted)]">Un singur cont, ecranul potrivit pentru fiecare rol:</p>
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                    {ROLE_STRIP.map((role) => (
                        <li
                            key={role}
                            className="rounded-full border border-[var(--c-border)] bg-[var(--c-bg)] px-3.5 py-1.5 text-[13px] font-bold text-[var(--c-ink)]"
                        >
                            {role}
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

const PROBLEMS: Array<{ before: string; after: string }> = [
    {
        before: 'Programul se împrăștie prin grupuri de mesaje și se pierde.',
        after: 'Un calendar unic al echipei, cu meciurile FRB aduse automat.',
    },
    {
        before: 'Cotizațiile se țin în tabele și se cer pe rând.',
        after: 'Fiecare vede ce are de plătit, plătește cu cardul și primește chitanța.',
    },
    {
        before: 'Foaia de meci și statisticile se completează de mână, după joc.',
        after: 'Lista L12 se pregătește în aplicație, iar scorul se ține live, de pe telefon.',
    },
];

function Mission() {
    return (
        <section className={sectionSpacing}>
            <div className={container}>
                <Reveal>
                    <SectionHead
                        eyebrow="De ce BCMS"
                        title="Mai puțină organizare de mână, mai mult timp pentru baschet."
                        description="Un club mic ajunge repede să țină evidența în zeci de locuri. BCMS le aduce pe toate la un loc, fiecare persoană vede doar ce o privește."
                    />
                </Reveal>
                <div className="mt-10 grid gap-3 md:grid-cols-3">
                    {PROBLEMS.map((item, index) => (
                        <Reveal key={item.before} delay={index * 70}>
                            <div className="h-full rounded-[var(--r-lg)] border border-[var(--c-border)] bg-[var(--c-surface)] p-5 sm:p-6">
                                <p className="m-0 flex gap-2.5 text-[14px] font-medium leading-6 text-[var(--c-faint)] line-through decoration-[var(--c-border-strong)]">
                                    <X size={16} className="mt-1 shrink-0 text-[var(--c-faint)]" />
                                    <span>{item.before}</span>
                                </p>
                                <p className="m-0 mt-4 flex gap-2.5 text-[15px] font-bold leading-6 text-[var(--c-ink-strong)]">
                                    <Check size={16} className="mt-1 shrink-0 text-[var(--c-success)]" />
                                    <span>{item.after}</span>
                                </p>
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
}

function MiniRow({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <div className={`flex items-center gap-2.5 rounded-[var(--r-md)] border border-[var(--c-border-soft)] bg-[var(--c-surface)] px-3 py-2 ${className}`}>
            {children}
        </div>
    );
}

function FeatureCard({
    title,
    text,
    wide = false,
    children,
}: {
    title: string;
    text: string;
    wide?: boolean;
    children: ReactNode;
}) {
    return (
        <article className={`ui-lift flex h-full flex-col rounded-[var(--r-xl)] border border-[var(--c-border)] bg-[var(--c-surface)] p-5 sm:p-6 ${wide ? 'lg:col-span-2' : ''}`}>
            <h3 className="m-0 text-[17px] font-extrabold tracking-[-0.01em] text-[var(--c-ink-strong)]">{title}</h3>
            <p className="m-0 mt-2 text-[14px] font-medium leading-6 text-[var(--c-muted)]">{text}</p>
            <div aria-hidden="true" className="mt-5 flex-1 select-none rounded-[var(--r-lg)] bg-[var(--c-bg-alt)] p-3">
                <div className="flex h-full flex-col justify-end gap-2">{children}</div>
            </div>
        </article>
    );
}

function EventRow({ day, dow, title, meta, chips }: { day: string; dow: string; title: string; meta: string; chips: ReactNode }) {
    return (
        <MiniRow>
            <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-[var(--r-sm)] bg-[var(--c-surface-tint)]">
                <span className="text-[8.5px] font-bold uppercase leading-none text-[var(--c-brand-fg)]">{dow}</span>
                <span className="mt-0.5 text-[15px] font-extrabold leading-none text-[var(--c-ink-strong)]">{day}</span>
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-[var(--c-ink-strong)]">{title}</span>
                <span className="block truncate text-[11.5px] font-medium text-[var(--c-muted)]">{meta}</span>
                <span className="mt-1 flex gap-1 sm:hidden">{chips}</span>
            </span>
            <span className="hidden shrink-0 gap-1 sm:flex">{chips}</span>
        </MiniRow>
    );
}

function Features() {
    return (
        <section id="functionalitati" className={`${sectionSpacing} bg-[var(--c-surface)] border-y border-[var(--c-border)]`}>
            <div className={container}>
                <Reveal>
                    <SectionHead
                        eyebrow="Funcționalități"
                        title="Tot ce are nevoie un club, fără aplicații în plus."
                        description="Fiecare modul funcționează singur, dar toate folosesc aceleași echipe, aceleași conturi și aceleași date."
                    />
                </Reveal>

                <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
                    <Reveal className="lg:col-span-2">
                        <FeatureCard
                            wide
                            title="Calendar unic, cu meciurile FRB sincronizate"
                            text="Antrenamente și meciuri într-un singur calendar pe echipă. Meciurile din competițiile FRB ajung automat, fără să le treci de mână."
                        >
                            <EventRow day="14" dow="Sâm" title="U16 Masculin vs CSM Rivals" meta="18:30 · Sala Polivalentă" chips={<><Chip tone="brand">Meci</Chip><Chip tone="sky">FRB</Chip></>} />
                            <EventRow day="17" dow="Mar" title="Antrenament U16" meta="18:00 · Sala Polivalentă" chips={<Chip>Antrenament</Chip>} />
                            <EventRow day="19" dow="Joi" title="Antrenament U16" meta="18:00 · Sala Polivalentă" chips={<Chip>Antrenament</Chip>} />
                        </FeatureCard>
                    </Reveal>

                    <Reveal delay={60}>
                        <FeatureCard title="Prezență marcată de antrenor" text="La fiecare antrenament, antrenorul bifează cine a venit. Jucătorii nu trebuie să confirme nimic.">
                            {[
                                ['AP', 'Andrei P.', 'Prezent', 'success'],
                                ['MR', 'Mihai R.', 'Absent', 'danger'],
                                ['RS', 'Radu S.', 'Prezent', 'success'],
                            ].map(([initials, name, status, tone]) => (
                                <MiniRow key={name}>
                                    <Avatar initials={initials} />
                                    <span className="flex-1 text-[13px] font-bold text-[var(--c-ink-strong)]">{name}</span>
                                    <Chip tone={tone as 'success' | 'danger'}>{status}</Chip>
                                </MiniRow>
                            ))}
                        </FeatureCard>
                    </Reveal>

                    <Reveal className="lg:col-span-2">
                        <FeatureCard
                            wide
                            title="Cotizații și plăți, urmărite pentru tine"
                            text="Clubul stabilește taxele, iar fiecare familie vede ce are de plătit. Cu plata online activată: card salvat, „Plătește tot”, istoric de tranzacții și chitanțe. Notificările ajung și pe email."
                        >
                            <div className="grid gap-2 sm:grid-cols-2">
                                <div className="flex flex-col gap-2">
                                    {[
                                        ['Martie · 150 RON', 'Achitat', 'success'],
                                        ['Aprilie · 150 RON', 'Restant', 'danger'],
                                        ['Echipament · 220 RON', 'Achitat', 'success'],
                                    ].map(([label, status, tone]) => (
                                        <MiniRow key={label}>
                                            <span className="flex-1 truncate text-[13px] font-bold text-[var(--c-ink-strong)]">{label}</span>
                                            <Chip tone={tone as 'success' | 'danger'}>{status}</Chip>
                                        </MiniRow>
                                    ))}
                                </div>
                                <div className="flex flex-col justify-between gap-3 rounded-[var(--r-md)] border border-[var(--c-border-soft)] bg-[var(--c-surface)] p-3">
                                    <div>
                                        <p className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--c-muted)]">De plată acum</p>
                                        <p className="m-0 mt-1 text-[24px] font-extrabold leading-none tracking-tight text-[var(--c-ink-strong)] t-num">150 RON</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[var(--r-md)] bg-[var(--c-brand-surface)] text-[12.5px] font-bold text-white">
                                            <CreditCard size={14} /> Plătește tot
                                        </span>
                                        <span className="text-[11.5px] font-semibold text-[var(--c-muted)]">•••• 4242</span>
                                    </div>
                                </div>
                            </div>
                        </FeatureCard>
                    </Reveal>

                    <Reveal delay={60}>
                        <FeatureCard title="Vize medicale la zi" text="Vezi dintr-o privire cine are viza valabilă, cine expiră curând și cine nu are una.">
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    ['18', 'Valabile', 'success'],
                                    ['3', 'Expiră în 30 zile', 'warning'],
                                    ['1', 'Expirate', 'danger'],
                                    ['2', 'Fără viză', 'neutral'],
                                ].map(([count, label, tone]) => (
                                    <div key={label} className="rounded-[var(--r-md)] border border-[var(--c-border-soft)] bg-[var(--c-surface)] p-2.5">
                                        <p className="m-0 text-[22px] font-extrabold leading-none tracking-tight text-[var(--c-ink-strong)] t-num">{count}</p>
                                        <div className="mt-1.5">
                                            <Chip tone={tone as 'success' | 'warning' | 'danger' | 'neutral'}>{label}</Chip>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </FeatureCard>
                    </Reveal>

                    <Reveal>
                        <FeatureCard title="Lista oficială L12" text="Pregătești foaia de meci în aplicație, pornind de la lista ta constantă, și o exporți în PDF sau Word.">
                            <MiniRow className="justify-between">
                                <span className="text-[12.5px] font-bold text-[var(--c-ink-strong)]">10 / 12 jucători pe foaie</span>
                                <FileText size={15} className="text-[var(--c-muted)]" />
                            </MiniRow>
                            <div className="flex flex-wrap gap-1.5">
                                {[4, 5, 7, 8, 9, 10, 11, 12, 14, 15].map((n) => (
                                    <span key={n} className="flex h-8 w-8 items-center justify-center rounded-[var(--r-sm)] border border-[var(--c-border-soft)] bg-[var(--c-surface)] text-[12px] font-extrabold text-[var(--c-ink-strong)] t-num">
                                        {n}
                                    </span>
                                ))}
                            </div>
                            <div className="flex gap-1.5">
                                <Chip tone="brand">Export PDF</Chip>
                                <Chip tone="brand">Export Word</Chip>
                            </div>
                        </FeatureCard>
                    </Reveal>

                    <Reveal delay={60}>
                        <FeatureCard title="Clasament pe echipă" text="Clasamentul competiției apare pe pagina echipei și pe ecranul de start al antrenorului și al jucătorului.">
                            {[
                                ['1', 'CSM Rivals', '9–1', false],
                                ['2', 'U16 Masculin', '8–2', true],
                                ['3', 'Dinamo Juniors', '6–4', false],
                            ].map(([place, team, record, ours]) => (
                                <MiniRow key={team as string} className={ours ? 'border-[var(--c-brand-border)] bg-[var(--c-surface-tint)]' : ''}>
                                    <span className="w-4 text-[12px] font-extrabold text-[var(--c-muted)] t-num">{place}</span>
                                    <span className="flex-1 truncate text-[13px] font-bold text-[var(--c-ink-strong)]">{team}</span>
                                    <span className="text-[12.5px] font-bold text-[var(--c-ink-soft)] t-num">{record}</span>
                                </MiniRow>
                            ))}
                        </FeatureCard>
                    </Reveal>

                    <Reveal delay={120}>
                        <FeatureCard title="Familii, nu doar conturi" text="Părintele își leagă copiii de contul lui și vede programul, cotizațiile și starea fiecăruia.">
                            <MiniRow>
                                <Avatar initials="AM" />
                                <span className="flex-1 text-[13px] font-bold text-[var(--c-ink-strong)]">Ana M. <span className="font-medium text-[var(--c-muted)]">· părinte</span></span>
                            </MiniRow>
                            {[
                                ['MM', 'Matei M.', 'U14'],
                                ['SM', 'Sofia M.', 'U12'],
                            ].map(([initials, name, team]) => (
                                <MiniRow key={name} className="ml-5">
                                    <Link2 size={13} className="shrink-0 text-[var(--c-faint)]" />
                                    <Avatar initials={initials} size={24} />
                                    <span className="flex-1 text-[12.5px] font-bold text-[var(--c-ink-strong)]">{name}</span>
                                    <Chip tone="brand">{team}</Chip>
                                </MiniRow>
                            ))}
                        </FeatureCard>
                    </Reveal>

                    <Reveal>
                        <FeatureCard title="Fiecare echipă, separat" text="Un membru vede doar datele echipei lui. Antrenorul U16 nu vede jucătorii de la U14.">
                            <div className="flex flex-wrap gap-1.5">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--c-brand-border)] bg-[var(--c-surface-tint)] px-3 py-1.5 text-[12.5px] font-bold text-[var(--c-brand-fg)]">
                                    <Check size={13} /> U16 Masculin
                                </span>
                                {['U14', 'U12', 'Seniori'].map((team) => (
                                    <span key={team} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--c-border-soft)] bg-[var(--c-surface)] px-3 py-1.5 text-[12.5px] font-bold text-[var(--c-faint)]">
                                        <Lock size={12} /> {team}
                                    </span>
                                ))}
                            </div>
                        </FeatureCard>
                    </Reveal>

                    <Reveal delay={60}>
                        <FeatureCard title="Documente la îndemână" text="Regulamente, acorduri și alte fișiere ale clubului, accesibile prin linkuri semnate, nu prin foldere publice.">
                            {['Regulament intern.pdf', 'Acord părinți.pdf'].map((name) => (
                                <MiniRow key={name}>
                                    <FileText size={15} className="shrink-0 text-[var(--c-muted)]" />
                                    <span className="flex-1 truncate text-[13px] font-bold text-[var(--c-ink-strong)]">{name}</span>
                                    <Lock size={13} className="shrink-0 text-[var(--c-faint)]" />
                                </MiniRow>
                            ))}
                        </FeatureCard>
                    </Reveal>

                    <Reveal delay={120}>
                        <FeatureCard title="Pe telefon, ca o aplicație" text="Se instalează pe ecranul principal și se deschide direct, fără magazin de aplicații. Funcționează la fel pe desktop.">
                            <MiniRow>
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[var(--c-brand-surface)] text-white">
                                    <BrandGlyph size={19} />
                                </span>
                                <span className="flex-1">
                                    <span className="block text-[13px] font-bold text-[var(--c-ink-strong)]">BCMS</span>
                                    <span className="block text-[11.5px] font-medium text-[var(--c-muted)]">Adaugă pe ecranul principal</span>
                                </span>
                                <Smartphone size={16} className="shrink-0 text-[var(--c-muted)]" />
                            </MiniRow>
                        </FeatureCard>
                    </Reveal>
                </div>
            </div>
        </section>
    );
}

const LIVE_POINTS: Array<{ title: string; text: string }> = [
    { title: 'Simplu sau Complet', text: 'Simplu: puncte, faulturi și schimbări. Complet adaugă aruncări ratate, recuperări, pase, intercepții, blocaje, mingi pierdute, ceasul de joc și minutele jucate.' },
    { title: 'Merge și fără semnal', text: 'Evenimentele se păstrează pe telefon și se trimit automat când revine conexiunea. Nu pierzi un coș într-o sală cu semnal slab.' },
    { title: 'Oricine poate ține scorul', text: 'Antrenorul poate desemna un părinte, iar ecranul e gândit pentru cineva fără experiență. O greșeală se anulează cu o atingere.' },
];

function LiveStats() {
    return (
        <section id="live" className={sectionSpacing}>
            <div className={container}>
                <Reveal>
                    <div className="overflow-hidden rounded-[var(--r-2xl)] border border-[var(--c-hero-chip-border)] bg-[var(--c-surface-inverse)] p-6 sm:p-10 lg:p-14">
                        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
                            <div>
                                <SectionHead
                                    inverse
                                    eyebrow="Statistici live"
                                    title="Ține scorul meciului de pe telefon, minut cu minut."
                                    description="Fiecare coș, fault și schimbare devine un eveniment. Scorul și statisticile fiecărui jucător se calculează din ele."
                                />
                                <ul className="m-0 mt-8 flex list-none flex-col gap-5 p-0">
                                    {LIVE_POINTS.map((point) => (
                                        <li key={point.title} className="flex gap-3">
                                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--c-hero-chip)] text-[var(--c-hero-fg)]">
                                                <Check size={14} />
                                            </span>
                                            <div>
                                                <p className="m-0 text-[15px] font-bold text-[var(--c-hero-fg)]">{point.title}</p>
                                                <p className="m-0 mt-1 text-[14px] font-medium leading-6 text-[var(--c-hero-muted)]">{point.text}</p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div aria-hidden="true" className="select-none rounded-[var(--r-xl)] border border-[var(--c-border)] bg-[var(--c-surface)] p-4 shadow-[var(--e-lg)] sm:p-5">
                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--c-muted)]">
                                        <span className="ui-ping h-2 w-2 rounded-full bg-[var(--c-danger)]" /> Live · Q4 03:12
                                    </span>
                                    <Chip tone="warning"><WifiOff size={11} /> Offline · 4 în așteptare</Chip>
                                </div>
                                <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
                                    <div>
                                        <p className="m-0 text-[12px] font-bold text-[var(--c-muted)]">U16 Masculin</p>
                                        <p className="m-0 font-extrabold leading-none tracking-tight text-[var(--c-ink-strong)] t-num" style={{ fontSize: 46 }}>68</p>
                                    </div>
                                    <span className="text-[18px] font-semibold text-[var(--c-faint)]">–</span>
                                    <div>
                                        <p className="m-0 text-[12px] font-bold text-[var(--c-muted)]">CSM Rivals</p>
                                        <p className="m-0 font-extrabold leading-none tracking-tight text-[var(--c-muted)] t-num" style={{ fontSize: 46 }}>61</p>
                                    </div>
                                </div>
                                <div className="mt-5 grid grid-cols-5 gap-1.5">
                                    {['+1', '+2', '+3', 'Fault', 'Schimb.'].map((label, i) => (
                                        <span
                                            key={label}
                                            className={`flex h-11 items-center justify-center rounded-[var(--r-md)] text-[12.5px] font-extrabold ${
                                                i < 3 ? 'bg-[var(--c-brand-surface)] text-white' : 'border border-[var(--c-border)] bg-[var(--c-surface-2)] text-[var(--c-ink-soft)]'
                                            }`}
                                        >
                                            {label}
                                        </span>
                                    ))}
                                </div>
                                <div className="mt-4 flex flex-col gap-1.5">
                                    {[
                                        ['03:12', '#7 Andrei P.', '+3'],
                                        ['03:41', '#10 Mihai R.', 'Fault'],
                                        ['04:05', '#4 Radu S.', '+2'],
                                    ].map(([time, who, what]) => (
                                        <div key={time} className="flex items-center gap-3 rounded-[var(--r-md)] bg-[var(--c-bg-alt)] px-3 py-2 text-[12.5px]">
                                            <span className="w-9 font-semibold text-[var(--c-muted)] t-num">{time}</span>
                                            <span className="flex-1 font-bold text-[var(--c-ink-strong)]">{who}</span>
                                            <span className="font-extrabold text-[var(--c-brand-fg)]">{what}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </Reveal>
            </div>
        </section>
    );
}

type RoleKey = 'admin' | 'coach' | 'player' | 'parent';

const ROLE_TABS: Array<{ key: RoleKey; label: string; headline: string }> = [
    { key: 'admin', label: 'Administrator', headline: 'Conduci clubul din același loc.' },
    { key: 'coach', label: 'Antrenor', headline: 'Echipa ta, pregătită pentru fiecare meci.' },
    { key: 'player', label: 'Jucător', headline: 'Știi mereu ce urmează și ce ai de făcut.' },
    { key: 'parent', label: 'Părinte', headline: 'Copilul tău, la un tap distanță.' },
];

const ROLE_STEPS: Record<RoleKey, Array<{ title: string; text: string }>> = {
    admin: [
        { title: 'Pui clubul pe picioare', text: 'Creezi echipele și le legi de sezonul FRB, ca meciurile să ajungă singure în calendar.' },
        { title: 'Inviți oamenii', text: 'Generezi coduri de invitație pentru antrenori, jucători și părinți, cu rolul și echipa potrivite.' },
        { title: 'Urmărești cotizațiile', text: 'Vezi cine a plătit și cine are restanțe, pe echipă, și poți activa plata cu cardul prin Stripe.' },
        { title: 'Păstrezi ordinea', text: 'Încarci documentele clubului, iar jurnalul de audit arată cine a schimbat ce.' },
    ],
    coach: [
        { title: 'Îți vezi echipa', text: 'Calendarul cu antrenamente și meciuri FRB, plus clasamentul, pentru echipele tale.' },
        { title: 'Marchezi prezența', text: 'La fiecare antrenament bifezi cine a venit, iar viza medicală a jucătorilor e la îndemână.' },
        { title: 'Pregătești lista L12', text: 'Pornești de la lista ta constantă, alegi cei 12 și exporți foaia în PDF sau Word.' },
        { title: 'Ții statisticile', text: 'Alegi modul Simplu sau Complet și ții scorul tu sau îl dai unui părinte.' },
    ],
    player: [
        { title: 'Intri în echipă', text: 'Te înscrii cu un cod de invitație sau ceri accesul cu codul echipei; antrenorul aprobă cererea.' },
        { title: 'Vezi programul', text: 'Calendarul echipei tale, cu antrenamente, meciuri, ora și sala.' },
        { title: 'Ești la zi', text: 'Îți vezi viza medicală și cotizațiile, ca să știi din timp ce trebuie reînnoit sau plătit.' },
        { title: 'Plătești online', text: 'Dacă clubul a activat plățile, achiți cu cardul și găsești chitanțele în istoric.' },
    ],
    parent: [
        { title: 'Îți legi copilul', text: 'Prin invitația primită de la club, contul tău se leagă de copil; poți adăuga mai mulți.' },
        { title: 'Urmărești programul', text: 'Vezi când și unde are copilul antrenament sau meci, fără să mai întrebi în grup.' },
        { title: 'Achiți cotizațiile', text: 'Plătești cu cardul, poți salva cardul și poți achita tot dintr-o dată.' },
        { title: 'Ții scorul, dacă ești ales', text: 'Dacă antrenorul te desemnează, primești meciul pe pagina ta de start și ții statisticile.' },
    ],
};

function RolePanel({ role }: { role: RoleKey }) {
    const wrap = 'rounded-[var(--r-xl)] border border-[var(--c-border)] bg-[var(--c-bg-alt)] p-4 sm:p-5';
    const heading = 'm-0 mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--c-muted)]';

    if (role === 'admin') {
        return (
            <div className={wrap}>
                <p className={heading}>Cotizații · martie</p>
                <div className="flex flex-col gap-2">
                    {[
                        ['AP', 'Andrei P.', 'U16', 'Achitat', 'success'],
                        ['MR', 'Mihai R.', 'U16', 'Restant', 'danger'],
                        ['IT', 'Ioana T.', 'U14', 'Achitat', 'success'],
                    ].map(([initials, name, team, status, tone]) => (
                        <MiniRow key={name}>
                            <Avatar initials={initials} />
                            <span className="flex-1 text-[13px] font-bold text-[var(--c-ink-strong)]">{name} <span className="font-medium text-[var(--c-muted)]">· {team}</span></span>
                            <Chip tone={tone as 'success' | 'danger'}>{status}</Chip>
                        </MiniRow>
                    ))}
                </div>
            </div>
        );
    }

    if (role === 'coach') {
        return (
            <div className={wrap}>
                <p className={heading}>Antrenament · marți 18:00</p>
                <div className="flex flex-col gap-2">
                    {[
                        ['AP', 'Andrei P.', 'Prezent', 'success'],
                        ['MR', 'Mihai R.', 'Absent', 'danger'],
                        ['RS', 'Radu S.', 'Prezent', 'success'],
                    ].map(([initials, name, status, tone]) => (
                        <MiniRow key={name}>
                            <Avatar initials={initials} />
                            <span className="flex-1 text-[13px] font-bold text-[var(--c-ink-strong)]">{name}</span>
                            <Chip tone={tone as 'success' | 'danger'}>{status}</Chip>
                        </MiniRow>
                    ))}
                </div>
            </div>
        );
    }

    if (role === 'player') {
        return (
            <div className={wrap}>
                <p className={heading}>Situația mea</p>
                <div className="flex flex-col gap-2">
                    {[
                        ['Următorul meci', 'Sâm 14 · 18:30', 'brand', 'Acasă'],
                        ['Viza medicală', 'Expiră peste 21 zile', 'warning', 'Reînnoiește'],
                        ['Cotizație aprilie', '150 RON', 'danger', 'Restant'],
                    ].map(([label, value, tone, chip]) => (
                        <MiniRow key={label}>
                            <span className="flex-1">
                                <span className="block text-[13px] font-bold text-[var(--c-ink-strong)]">{label}</span>
                                <span className="block text-[11.5px] font-medium text-[var(--c-muted)]">{value}</span>
                            </span>
                            <Chip tone={tone as 'brand' | 'warning' | 'danger'}>{chip}</Chip>
                        </MiniRow>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className={wrap}>
            <p className={heading}>Matei M. · U14</p>
            <div className="flex flex-col gap-2">
                {[
                    ['Antrenament', 'Marți 17:30 · Sala Școlii 5', 'neutral', 'Mâine'],
                    ['Cotizație martie', '120 RON', 'success', 'Achitat'],
                    ['Ține scorul', 'U14 vs Dinamo Juniors', 'brand', 'Desemnat'],
                ].map(([label, value, tone, chip]) => (
                    <MiniRow key={label}>
                        <span className="flex-1">
                            <span className="block text-[13px] font-bold text-[var(--c-ink-strong)]">{label}</span>
                            <span className="block text-[11.5px] font-medium text-[var(--c-muted)]">{value}</span>
                        </span>
                        <Chip tone={tone as 'neutral' | 'success' | 'brand'}>{chip}</Chip>
                    </MiniRow>
                ))}
            </div>
        </div>
    );
}

function HowItWorks() {
    const [active, setActive] = useState<RoleKey>('admin');
    const current = ROLE_TABS.find((tab) => tab.key === active) ?? ROLE_TABS[0];

    const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + ROLE_TABS.length) % ROLE_TABS.length;
        setActive(ROLE_TABS[next].key);
        document.getElementById(`role-tab-${ROLE_TABS[next].key}`)?.focus();
    };

    return (
        <section id="cum-functioneaza" className={`${sectionSpacing} border-t border-[var(--c-border)] bg-[var(--c-surface)]`}>
            <div className={container}>
                <Reveal>
                    <SectionHead
                        eyebrow="Cum funcționează"
                        title="Același club, văzut prin ochii fiecărui rol."
                        description="Alege un rol și vezi cum arată o zi obișnuită în BCMS."
                    />
                </Reveal>

                <Reveal delay={60}>
                    <div role="tablist" aria-label="Roluri" className="mt-8 inline-grid w-full grid-cols-2 gap-1 rounded-[var(--r-lg)] border border-[var(--c-border)] bg-[var(--c-bg-alt)] p-1 sm:w-auto sm:grid-cols-4">
                        {ROLE_TABS.map((tab, index) => {
                            const selected = tab.key === active;
                            return (
                                <button
                                    key={tab.key}
                                    id={`role-tab-${tab.key}`}
                                    role="tab"
                                    type="button"
                                    aria-selected={selected}
                                    aria-controls="role-panel"
                                    tabIndex={selected ? 0 : -1}
                                    onClick={() => setActive(tab.key)}
                                    onKeyDown={(event) => onKeyDown(event, index)}
                                    className={`min-h-[44px] cursor-pointer rounded-[var(--r-md)] border-0 px-5 text-[14px] font-bold transition-colors ${
                                        selected
                                            ? 'bg-[var(--c-surface)] text-[var(--c-ink-strong)] shadow-[var(--e-xs)]'
                                            : 'bg-transparent text-[var(--c-muted)] hover:text-[var(--c-ink)]'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </Reveal>

                <div
                    key={active}
                    id="role-panel"
                    role="tabpanel"
                    aria-labelledby={`role-tab-${active}`}
                    className="ui-rise mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14"
                >
                    <div>
                        <h3
                            className="m-0 text-balance font-extrabold tracking-[-0.02em] text-[var(--c-ink-strong)]"
                            style={{ fontSize: 'clamp(24px, 3vw, 30px)', lineHeight: 1.15 }}
                        >
                            {current.headline}
                        </h3>
                        <ol className="m-0 mt-6 flex list-none flex-col gap-5 p-0">
                            {ROLE_STEPS[active].map((step, index) => (
                                <li key={step.title} className="flex gap-4">
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--c-border-strong)] bg-[var(--c-bg)] text-[13px] font-extrabold text-[var(--c-ink-strong)] t-num">
                                        {index + 1}
                                    </span>
                                    <div>
                                        <p className="m-0 text-[15px] font-bold text-[var(--c-ink-strong)]">{step.title}</p>
                                        <p className="m-0 mt-1 text-[14px] font-medium leading-6 text-[var(--c-muted)]">{step.text}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </div>
                    <div aria-hidden="true" className="select-none self-start lg:sticky lg:top-24">
                        <RolePanel role={active} />
                        <p className="m-0 mt-2.5 text-center text-[11.5px] font-medium text-[var(--c-faint)]">Exemplu ilustrativ, cu date fictive</p>
                    </div>
                </div>
            </div>
        </section>
    );
}

const SECURITY_POINTS: Array<{ title: string; text: string }> = [
    { title: 'Doar pe invitație', text: 'Conturile noi se creează cu un cod de la club sau cu codul echipei, aprobat de antrenor. Nu se poate înscrie oricine.' },
    { title: 'Acces pe roluri și echipe', text: 'Fiecare persoană vede doar ce ține de rolul și de echipa ei. Verificarea se face pe server, nu doar în ecranul aplicației.' },
    { title: 'Autentificare sigură', text: 'Conectarea trece prin Clerk, cu un pas suplimentar de verificare pe un dispozitiv nou.' },
    { title: 'Plăți prin Stripe', text: 'Datele cardului sunt procesate de Stripe și nu trec prin BCMS. Fiecare club decide dacă activează plata online.' },
    { title: 'Jurnal de audit', text: 'Acțiunile importante sunt înregistrate, ca să poți vedea cine a schimbat ce și când.' },
    { title: 'Documente cu link semnat', text: 'Fișierele clubului se deschid doar prin linkuri semnate, nu prin adrese publice.' },
];

function Security() {
    return (
        <section id="securitate" className={sectionSpacing}>
            <div className={container}>
                <Reveal>
                    <SectionHead
                        eyebrow="Siguranță"
                        title="Datele copiilor și ale familiilor sunt tratate cu grijă."
                        description="Un club lucrează cu minori, cu plăți și cu documente personale. De aceea accesul este restrâns implicit."
                    />
                </Reveal>
                <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {SECURITY_POINTS.map((point, index) => (
                        <Reveal key={point.title} delay={(index % 3) * 60}>
                            <div className="h-full rounded-[var(--r-lg)] border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
                                <span className="flex h-8 w-8 items-center justify-center rounded-[var(--r-sm)] bg-[var(--c-surface-tint)] text-[var(--c-brand-fg)]">
                                    <Check size={16} />
                                </span>
                                <h3 className="m-0 mt-4 text-[15px] font-extrabold text-[var(--c-ink-strong)]">{point.title}</h3>
                                <p className="m-0 mt-1.5 text-[14px] font-medium leading-6 text-[var(--c-muted)]">{point.text}</p>
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
}

const FAQ: Array<{ q: string; a: string }> = [
    {
        q: 'Cum îmi fac un cont?',
        a: 'Înscrierea se face pe bază de invitație: primești un cod de la clubul tău și îl folosești la „Creează cont”. Ca jucător poți cere accesul și cu codul echipei, iar antrenorul aprobă cererea.',
    },
    {
        q: 'Trebuie să plătesc online?',
        a: 'Nu. Plata cu cardul prin Stripe este opțională și o activează fiecare club. Cotizațiile, istoricul tranzacțiilor și chitanțele rămân vizibile în aplicație.',
    },
    {
        q: 'Funcționează fără internet?',
        a: 'Ținerea scorului la meci funcționează și offline: evenimentele rămân pe telefon și se sincronizează automat când revine conexiunea. Restul aplicației are nevoie de internet.',
    },
    {
        q: 'Pot instala aplicația pe telefon?',
        a: 'Da. Pe Android primești un banner de instalare. Pe iPhone deschizi pagina în Safari, apeși Partajare și alegi „Adaugă pe ecranul principal”.',
    },
    {
        q: 'Am mai mulți copii în club. Pot folosi un singur cont?',
        a: 'Da. Contul de părinte poate fi legat de mai mulți copii, iar tu alegi pentru care dintre ei vrei să vezi programul și cotizațiile.',
    },
    {
        q: 'Ce vede un antrenor din alte echipe?',
        a: 'Nimic. Fiecare membru vede doar datele echipei lui; administratorul clubului are imaginea de ansamblu.',
    },
];

function Faq() {
    return (
        <section id="intrebari" className={`${sectionSpacing} border-t border-[var(--c-border)] bg-[var(--c-surface)]`}>
            <div className={`${container} grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16`}>
                <Reveal>
                    <SectionHead eyebrow="Întrebări frecvente" title="Ce întreabă de obicei oamenii." />
                </Reveal>
                <Reveal delay={60}>
                    <div className="divide-y divide-[var(--c-border)] rounded-[var(--r-xl)] border border-[var(--c-border)] bg-[var(--c-bg)]">
                        {FAQ.map((item) => (
                            <details key={item.q} className="group px-5 py-1 [&_summary::-webkit-details-marker]:hidden">
                                <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-bold text-[var(--c-ink-strong)]">
                                    {item.q}
                                    <ChevronDown size={18} className="shrink-0 text-[var(--c-muted)] transition-transform duration-200 group-open:rotate-180" />
                                </summary>
                                <p className="m-0 pb-4 pr-8 text-[14.5px] font-medium leading-7 text-[var(--c-muted)]">{item.a}</p>
                            </details>
                        ))}
                    </div>
                </Reveal>
            </div>
        </section>
    );
}

function FinalCta() {
    const navigate = useNavigate();
    return (
        <section className="py-16 sm:py-24">
            <div className={container}>
                <Reveal>
                    <div className="relative overflow-hidden rounded-[var(--r-2xl)] border border-[var(--c-hero-chip-border)] bg-[var(--c-surface-inverse)] px-6 py-14 text-center sm:px-12 sm:py-20">
                        <CourtArt className="pointer-events-none absolute -bottom-20 -right-28 h-[430px] w-[460px] text-[var(--c-hero-fg)] opacity-[0.07]" />
                        <div className="relative">
                            <h2
                                className="m-0 mx-auto max-w-[620px] text-balance font-extrabold tracking-[-0.03em] text-[var(--c-hero-fg)]"
                                style={{ fontSize: 'clamp(28px, 5vw, 44px)', lineHeight: 1.1 }}
                            >
                                Adună-ți clubul într-un singur loc.
                            </h2>
                            <p className="m-0 mx-auto mt-4 max-w-[480px] text-[16px] font-medium leading-7 text-[var(--c-hero-muted)]">
                                Intră în cont și continuă de unde ai rămas, sau creează unul nou cu codul primit de la club.
                            </p>
                            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={() => navigate('/login')}
                                    className="inline-flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--r-md)] border-0 bg-white px-7 text-[15px] font-bold text-[#1B1A3D] transition-opacity hover:opacity-90 sm:w-auto"
                                >
                                    Autentificare <ArrowRight size={17} />
                                </button>
                                <Link
                                    to="/signup"
                                    className="inline-flex min-h-[48px] w-full items-center justify-center rounded-[var(--r-md)] border border-[var(--c-hero-chip-border)] bg-transparent px-7 text-[15px] font-bold text-[var(--c-hero-fg)] no-underline transition-colors hover:bg-[var(--c-hero-chip)] sm:w-auto"
                                >
                                    Creează cont
                                </Link>
                            </div>
                        </div>
                    </div>
                </Reveal>
            </div>
        </section>
    );
}

function Footer() {
    return (
        <footer className="border-t border-[var(--c-border)] bg-[var(--c-surface)]">
            <div className={`${container} flex flex-col gap-6 py-8 sm:flex-row sm:items-center sm:justify-between`}>
                <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[var(--c-brand-surface)] text-white">
                        <BrandGlyph size={19} />
                    </span>
                    <span className="text-[14px] font-extrabold tracking-tight text-[var(--c-ink-strong)]">BCMS</span>
                    <span className="text-[13px] font-medium text-[var(--c-muted)]">© {new Date().getFullYear()}</span>
                </div>
                <nav aria-label="Subsol" className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    {NAV_LINKS.slice(0, 4).map((link) => (
                        <a
                            key={link.id}
                            href={`#${link.id}`}
                            onClick={(event) => {
                                event.preventDefault();
                                scrollToSection(link.id);
                            }}
                            className="text-[13px] font-semibold text-[var(--c-muted)] no-underline hover:text-[var(--c-ink-strong)]"
                        >
                            {link.label}
                        </a>
                    ))}
                    <Link to="/login" className="text-[13px] font-bold text-[var(--c-brand-fg)] no-underline hover:underline">
                        Autentificare
                    </Link>
                </nav>
            </div>
            <div className={`${container} border-t border-[var(--c-border-soft)] py-4`}>
                <LegalLinks />
            </div>
        </footer>
    );
}

export default function Welcome() {
    return (
        <div className="min-h-screen bg-[var(--c-bg)] text-[var(--c-ink)]">
            <Header />
            <main>
                <Hero />
                <RolesStrip />
                <Mission />
                <Features />
                <LiveStats />
                <HowItWorks />
                <Security />
                <Faq />
                <FinalCta />
            </main>
            <Footer />
        </div>
    );
}
