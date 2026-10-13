import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail } from 'lucide-react';
import { LEGAL_OPERATOR, LEGAL_UPDATED_LABEL } from '../../config/legal';
import { BrandGlyph } from '../auth/AuthChrome';
import LegalLinks from './LegalLinks';
import type { LegalBlock, LegalDocument } from './documents';

function Block({ block }: { block: LegalBlock }) {
    if (block.type === 'p') {
        return <p className="m-0 mt-3 text-[15px] leading-7 text-[var(--c-ink-soft)]">{block.text}</p>;
    }
    if (block.type === 'ul') {
        return (
            <ul className="m-0 mt-3 flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-7 text-[var(--c-ink-soft)] marker:text-[var(--c-faint)]">
                {block.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
        );
    }
    return (
        <div className="mt-3 overflow-x-auto rounded-[var(--r-md)] border border-[var(--c-border)]">
            <table className="w-full min-w-[520px] border-collapse text-left text-[13.5px] leading-6">
                <thead>
                    <tr className="bg-[var(--c-surface-2)]">
                        {block.head.map((cell) => (
                            <th key={cell} scope="col" className="border-b border-[var(--c-border)] px-3.5 py-2.5 text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--c-muted)]">{cell}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {block.rows.map((row) => (
                        <tr key={row[0]} className="align-top">
                            {row.map((cell, index) => (
                                <td
                                    key={`${row[0]}-${index}`}
                                    className={`border-b border-[var(--c-border-soft)] px-3.5 py-2.5 last-of-type:border-b-0 ${index === 0 ? 'font-semibold text-[var(--c-ink-strong)]' : 'text-[var(--c-ink-soft)]'}`}
                                >
                                    {cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ContactCard() {
    const { product, legalName, registration, address, contactEmail } = LEGAL_OPERATOR;
    const lines = [legalName || product, registration, address].filter(Boolean);
    return (
        <section id="contact" className="scroll-mt-24 border-t border-[var(--c-border)] pt-8">
            <h2 className="m-0 text-xl font-extrabold tracking-tight text-[var(--c-ink-strong)]">Contact</h2>
            <div className="mt-3 rounded-[var(--r-lg)] border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
                {lines.map((line) => (
                    <p key={line} className="m-0 text-[14.5px] leading-6 text-[var(--c-ink-soft)]">{line}</p>
                ))}
                {contactEmail ? (
                    <a href={`mailto:${contactEmail}`} className="mt-2 inline-flex items-center gap-2 text-[14.5px] font-bold text-[var(--c-brand-fg)] no-underline hover:underline">
                        <Mail size={16} />
                        {contactEmail}
                    </a>
                ) : null}
                {!contactEmail && import.meta.env.DEV ? (
                    <p className="m-0 mt-2 text-[13px] font-semibold text-[var(--c-warning)]">
                        Lipsește adresa de contact: completeaz-o în config/legal.ts înainte de publicare.
                    </p>
                ) : null}
            </div>
            <p className="m-0 mt-3 text-[13.5px] leading-6 text-[var(--c-muted)]">
                Pentru datele din club (ce se păstrează, cine are acces), administratorul clubului tău este primul interlocutor.
            </p>
        </section>
    );
}

export default function LegalPage({ doc }: { doc: LegalDocument }) {
    const navigate = useNavigate();

    useEffect(() => {
        const previous = document.title;
        document.title = `${doc.title} · BCMS`;
        window.scrollTo({ top: 0 });
        return () => {
            document.title = previous;
        };
    }, [doc.title]);

    const goBack = () => {
        if (window.history.length > 1) navigate(-1);
        else navigate('/');
    };

    return (
        <div className="min-h-screen bg-[var(--c-bg)] text-[var(--c-ink)]">
            <header className="sticky top-0 z-30 border-b border-[var(--c-border)] bg-[var(--c-surface)]/90 backdrop-blur">
                <div className="mx-auto flex h-14 w-full max-w-[1040px] items-center justify-between gap-3 px-4 sm:px-6">
                    <Link to="/" className="flex items-center gap-2.5 no-underline" aria-label="BCMS, pagina principală">
                        <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[var(--c-brand-surface)] text-white">
                            <BrandGlyph size={19} />
                        </span>
                        <span className="text-[15px] font-extrabold tracking-tight text-[var(--c-ink-strong)]">BCMS</span>
                    </Link>
                    <button
                        type="button"
                        onClick={goBack}
                        className="flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--c-border)] bg-[var(--c-surface)] px-3 text-[13.5px] font-bold text-[var(--c-ink)] transition-colors hover:bg-[var(--c-surface-2)]"
                    >
                        <ArrowLeft size={16} />
                        Înapoi
                    </button>
                </div>
            </header>

            <main className="mx-auto w-full max-w-[1040px] px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
                <p className="m-0 text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--c-brand-fg)]">Informații legale</p>
                <h1 className="m-0 mt-2 text-[28px] font-extrabold leading-tight tracking-tight text-[var(--c-ink-strong)] sm:text-[36px]">{doc.title}</h1>
                <p className="m-0 mt-2 max-w-[680px] text-[15.5px] leading-7 text-[var(--c-muted)]">{doc.summary}</p>
                <p className="m-0 mt-3 text-[13px] font-semibold text-[var(--c-faint)]">Ultima actualizare: {LEGAL_UPDATED_LABEL}</p>

                <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
                    <nav aria-label="Cuprins" className="lg:sticky lg:top-24 lg:self-start">
                        <p className="m-0 mb-2 text-[11.5px] font-bold uppercase tracking-[0.08em] text-[var(--c-muted)]">Cuprins</p>
                        <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
                            {doc.sections.map((section) => (
                                <li key={section.id}>
                                    <a href={`#${section.id}`} className="block rounded-[var(--r-sm)] px-2 py-1.5 text-[13.5px] font-semibold leading-5 text-[var(--c-ink-soft)] no-underline transition-colors hover:bg-[var(--c-surface-3)] hover:text-[var(--c-ink-strong)]">
                                        {section.title}
                                    </a>
                                </li>
                            ))}
                            <li>
                                <a href="#contact" className="block rounded-[var(--r-sm)] px-2 py-1.5 text-[13.5px] font-semibold leading-5 text-[var(--c-ink-soft)] no-underline transition-colors hover:bg-[var(--c-surface-3)] hover:text-[var(--c-ink-strong)]">
                                    Contact
                                </a>
                            </li>
                        </ol>
                    </nav>

                    <article className="min-w-0">
                        <div className="flex flex-col gap-8">
                            {doc.sections.map((section) => (
                                <section key={section.id} id={section.id} className="scroll-mt-24">
                                    <h2 className="m-0 text-xl font-extrabold tracking-tight text-[var(--c-ink-strong)]">{section.title}</h2>
                                    {section.blocks.map((block, index) => <Block key={index} block={block} />)}
                                </section>
                            ))}
                            <ContactCard />
                        </div>
                    </article>
                </div>
            </main>

            <footer className="border-t border-[var(--c-border)] bg-[var(--c-surface)]">
                <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <span className="text-[13px] font-medium text-[var(--c-muted)]">© {new Date().getFullYear()} BCMS</span>
                    <LegalLinks />
                </div>
            </footer>
        </div>
    );
}
