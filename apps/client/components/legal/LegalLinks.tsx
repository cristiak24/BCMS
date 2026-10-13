import { Link } from 'react-router-dom';

const LINKS = [
    { to: '/termeni', label: 'Termeni și condiții' },
    { to: '/confidentialitate', label: 'Confidențialitate' },
    { to: '/cookie-uri', label: 'Cookie-uri' },
];

/** The three legal pages as one row of links, for footers and forms. */
export default function LegalLinks({ className = '' }: { className?: string }) {
    return (
        <nav aria-label="Informații legale" className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 ${className}`}>
            {LINKS.map((link) => (
                <Link
                    key={link.to}
                    to={link.to}
                    className="text-[12.5px] font-semibold text-[var(--c-muted)] no-underline transition-colors hover:text-[var(--c-ink-strong)] hover:underline"
                >
                    {link.label}
                </Link>
            ))}
        </nav>
    );
}
