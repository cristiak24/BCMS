import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useSession } from '../../context/AuthContext';
import { LEGAL_VERSION } from '../../config/legal';
import { privacyApi } from '../../services/privacyApi';

const LEGAL_PATHS = ['/termeni', '/confidentialitate', '/cookie-uri'];

/**
 * Asks signed-in people to accept the current Terms and Privacy Policy: every
 * account that existed before they were published, and everyone again when
 * LEGAL_VERSION changes. It fails open — if the status can't be read, nobody is
 * locked out of the app.
 */
export default function LegalAcceptanceGate() {
    const { session, signOut } = useSession();
    const { pathname } = useLocation();
    const userId = session?.id ?? null;
    const [needsAcceptance, setNeedsAcceptance] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setNeedsAcceptance(false);
        if (userId == null) return;
        let cancelled = false;
        privacyApi.status()
            .then((status) => {
                if (!cancelled) setNeedsAcceptance(!status.accepted);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [userId]);

    if (!needsAcceptance || LEGAL_PATHS.includes(pathname)) return null;

    const accept = async () => {
        setSaving(true);
        setError(null);
        try {
            await privacyApi.accept(LEGAL_VERSION);
            setNeedsAcceptance(false);
        } catch {
            setError('Nu am putut salva acceptul. Verifică conexiunea și încearcă din nou.');
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-6">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="legal-gate-title"
                className="w-full max-w-[460px] rounded-[var(--r-xl)] border border-[var(--c-border)] bg-[var(--c-surface)] p-5 shadow-[var(--e-lg)] sm:p-6"
            >
                <span className="flex h-10 w-10 items-center justify-center rounded-[var(--r-md)] bg-[var(--c-surface-tint)] text-[var(--c-brand-fg)]">
                    <ShieldCheck size={22} />
                </span>
                <h2 id="legal-gate-title" className="m-0 mt-3 text-xl font-extrabold tracking-tight text-[var(--c-ink-strong)]">
                    Termeni și confidențialitate
                </h2>
                <p className="m-0 mt-2 text-[14.5px] leading-6 text-[var(--c-ink-soft)]">
                    Am publicat <Link to="/termeni" className="font-bold text-[var(--c-brand-fg)]">Termenii și condițiile</Link>,{' '}
                    <Link to="/confidentialitate" className="font-bold text-[var(--c-brand-fg)]">Politica de confidențialitate</Link> și{' '}
                    <Link to="/cookie-uri" className="font-bold text-[var(--c-brand-fg)]">informarea despre cookie-uri</Link>.
                    Pentru a continua în aplicație, te rugăm să le citești și să le accepți.
                </p>
                {error ? <p role="alert" className="m-0 mt-3 text-[13.5px] font-semibold text-[var(--c-danger)]">{error}</p> : null}
                <button
                    type="button"
                    onClick={() => void accept()}
                    disabled={saving}
                    autoFocus
                    className="mt-5 flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--r-md)] border-0 bg-[var(--c-brand-surface)] px-4 text-[15px] font-bold text-white shadow-[var(--e-sm)] transition-colors hover:bg-[var(--c-brand-strong)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                    {saving ? <Loader2 className="animate-spin" size={18} /> : null}
                    Accept și continui
                </button>
                <button
                    type="button"
                    onClick={() => void signOut()}
                    disabled={saving}
                    className="mt-2 flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-[var(--r-md)] border border-[var(--c-border)] bg-[var(--c-surface)] px-4 text-[14px] font-bold text-[var(--c-muted)] transition-colors hover:bg-[var(--c-surface-2)]"
                >
                    Nu accept, deconectează-mă
                </button>
            </div>
        </div>,
        document.body,
    );
}
