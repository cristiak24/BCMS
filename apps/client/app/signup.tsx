import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2, Lock, Eye, EyeOff, Ticket, ArrowRight } from 'lucide-react';
import { authApi, type InviteDetails } from '../services/authApi';
import { getHomeRouteForRole } from '../utils/authSession';
import { useSession } from '../context/AuthContext';
import { LoadingScreen } from '../components/ui/ScreenState';
import {
    AuthCard,
    AuthHeading,
    MobileBrand,
    PageBackdrop,
    authFieldClass,
    authInputClass,
    authLabelClass,
    authPrimaryButtonClass,
} from '../components/auth/AuthChrome';

const ROLE_LABELS: Record<string, string> = {
    player: 'Jucător',
    coach: 'Antrenor',
    parent: 'Părinte',
    admin: 'Administrator',
    superadmin: 'Super admin',
};

/**
 * Accepts whatever the user pastes: the full registration link generated in
 * Manage Access (…/signup?inviteToken=…), an /invite/<token> link, or the bare
 * token itself.
 */
export function extractInviteToken(raw: string) {
    const value = raw.trim();
    if (!value) return '';
    try {
        const url = new URL(value);
        const fromQuery = url.searchParams.get('inviteToken');
        if (fromQuery) return fromQuery.trim();
        const fromPath = url.pathname.match(/\/invite\/([^/?#]+)/);
        if (fromPath) return decodeURIComponent(fromPath[1]);
    } catch {
        // Not a URL: treat it as the token itself.
    }
    return value;
}

export default function Signup() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { session, initializing, reloadSession } = useSession();
    const urlToken = searchParams.get('inviteToken') ?? '';

    const [codeInput, setCodeInput] = useState(urlToken);
    const [inviteToken, setInviteToken] = useState('');
    const [invite, setInvite] = useState<InviteDetails | null>(null);
    const [validating, setValidating] = useState(false);

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!initializing && session) {
            navigate(getHomeRouteForRole(session.role), { replace: true });
        }
    }, [initializing, navigate, session]);

    const validateCode = useCallback(async (raw: string) => {
        const token = extractInviteToken(raw);
        if (!token) {
            setError('Introdu codul sau linkul de invitație.');
            return;
        }

        setValidating(true);
        setError(null);
        try {
            const details = await authApi.getInviteDetails(token);
            setInvite(details);
            setInviteToken(token);
            if (details.email) setEmail(details.email);
        } catch {
            setInvite(null);
            setInviteToken('');
            setError('Codul de invitație nu este valid sau a expirat. Cere unul nou administratorului clubului.');
        } finally {
            setValidating(false);
        }
    }, []);

    // A registration link opens this page with the token already in the URL.
    useEffect(() => {
        if (urlToken) void validateCode(urlToken);
    }, [urlToken, validateCode]);

    const resetInvite = () => {
        setInvite(null);
        setInviteToken('');
        setCodeInput('');
        setEmail('');
        setError(null);
    };

    const handleSignup = async () => {
        if (!invite || !inviteToken) return;

        if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
            setError('Completează prenumele, numele, emailul și parola.');
            return;
        }
        if (password.length < 8) {
            setError('Parola trebuie să aibă cel puțin 8 caractere.');
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const result = await authApi.signup({
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                email: email.trim().toLowerCase(),
                password,
                inviteToken,
            });

            if (!result.success) {
                setError(result.error ?? 'Nu am putut crea contul.');
                return;
            }

            await reloadSession();
        } catch (signupError) {
            setError(signupError instanceof Error ? signupError.message : 'Nu am putut crea contul.');
        } finally {
            setSubmitting(false);
        }
    };

    if (initializing) {
        return <LoadingScreen message="Verificăm sesiunea..." backgroundColor="var(--c-surface)" color="var(--c-blue)" />;
    }

    const emailLocked = Boolean(invite?.email);
    const roleLabel = invite ? (ROLE_LABELS[invite.role] ?? invite.role) : '';

    return (
        <main className="relative isolate min-h-screen overflow-hidden text-slate-950">
            <PageBackdrop />
            <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[460px] flex-col justify-center px-4 py-4">
                <MobileBrand showOnDesktop />

                <AuthCard>
                    <AuthHeading
                        title="Creează cont"
                        subtitle={invite
                            ? 'Completează datele tale pentru a intra în club.'
                            : 'Conturile se creează pe baza invitației primite de la administratorul clubului.'}
                    />

                    {error ? (
                        <div className="mb-3.5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-red-700">
                            <AlertCircle className="mt-0.5 shrink-0" size={16} />
                            <p className="m-0 text-[13px] font-bold leading-5">{error}</p>
                        </div>
                    ) : null}

                    {!invite ? (
                        <form
                            className="flex flex-col gap-3.5"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void validateCode(codeInput);
                            }}
                        >
                            <label className="block">
                                <span className={authLabelClass}>Cod de invitație</span>
                                <span className={`${authFieldClass} border-slate-200`}>
                                    <Ticket size={18} className="shrink-0 text-blue-700" />
                                    <input
                                        className={`ml-2.5 ${authInputClass}`}
                                        placeholder="Lipește linkul sau codul primit"
                                        value={codeInput}
                                        onChange={(e) => setCodeInput(e.target.value)}
                                        autoCapitalize="none"
                                        autoCorrect="off"
                                        spellCheck={false}
                                        disabled={validating}
                                    />
                                </span>
                            </label>
                            <button type="submit" disabled={validating || !codeInput.trim()} className={authPrimaryButtonClass}>
                                {validating ? <Loader2 className="animate-spin" size={18} /> : null}
                                <span>{validating ? 'Verificăm codul...' : 'Continuă'}</span>
                                {!validating ? <ArrowRight size={17} /> : null}
                            </button>
                        </form>
                    ) : (
                        <form
                            className="flex flex-col gap-3.5"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void handleSignup();
                            }}
                        >
                            {/* Role and club come from the invite; the admin chose them. */}
                            <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
                                <Lock size={16} className="shrink-0 text-blue-700" />
                                <div className="min-w-0 flex-1">
                                    <p className="m-0 truncate text-[13px] font-black text-blue-950">
                                        {roleLabel}{invite.clubName ? ` · ${invite.clubName}` : ''}
                                    </p>
                                    <p className="m-0 text-[11px] font-bold text-blue-700">Rol stabilit de administrator</p>
                                </div>
                                {!urlToken ? (
                                    <button
                                        type="button"
                                        onClick={resetInvite}
                                        className="shrink-0 border-0 bg-transparent px-0 text-[12px] font-black text-blue-700 hover:underline"
                                    >
                                        Alt cod
                                    </button>
                                ) : null}
                            </div>

                            <div className="grid grid-cols-2 gap-2.5">
                                <label className="block min-w-0">
                                    <span className={authLabelClass}>Prenume</span>
                                    <span className={`${authFieldClass} border-slate-200`}>
                                        <input
                                            className={authInputClass}
                                            placeholder="Maria"
                                            value={firstName}
                                            onChange={(e) => setFirstName(e.target.value)}
                                            autoComplete="given-name"
                                            disabled={submitting}
                                        />
                                    </span>
                                </label>
                                <label className="block min-w-0">
                                    <span className={authLabelClass}>Nume</span>
                                    <span className={`${authFieldClass} border-slate-200`}>
                                        <input
                                            className={authInputClass}
                                            placeholder="Popescu"
                                            value={lastName}
                                            onChange={(e) => setLastName(e.target.value)}
                                            autoComplete="family-name"
                                            disabled={submitting}
                                        />
                                    </span>
                                </label>
                            </div>

                            <label className="block">
                                <span className={authLabelClass}>Email</span>
                                <span className={`${authFieldClass} border-slate-200 ${emailLocked ? 'bg-slate-100' : ''}`}>
                                    <input
                                        className={authInputClass}
                                        placeholder="nume@club.ro"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        autoCapitalize="none"
                                        autoComplete="email"
                                        readOnly={emailLocked}
                                        disabled={submitting}
                                    />
                                    {emailLocked ? <Lock size={15} className="shrink-0 text-slate-400" /> : null}
                                </span>
                            </label>

                            <label className="block">
                                <span className={authLabelClass}>Parolă</span>
                                <span className={`${authFieldClass} border-slate-200`}>
                                    <input
                                        className={authInputClass}
                                        placeholder="Minim 8 caractere"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        autoComplete="new-password"
                                        disabled={submitting}
                                    />
                                    <button
                                        type="button"
                                        aria-label={showPassword ? 'Ascunde parola' : 'Arată parola'}
                                        onClick={() => setShowPassword((value) => !value)}
                                        className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-slate-500 hover:bg-slate-100"
                                    >
                                        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                                    </button>
                                </span>
                            </label>

                            <button type="submit" disabled={submitting} className={`mt-1 ${authPrimaryButtonClass}`}>
                                {submitting ? <Loader2 className="animate-spin" size={18} /> : null}
                                <span>{submitting ? 'Se creează contul...' : 'Creează cont'}</span>
                            </button>
                        </form>
                    )}

                    <p className="m-0 mt-5 text-center text-sm font-semibold text-slate-500">
                        Ai deja cont? <Link to="/login" className="font-black text-blue-700 no-underline hover:underline">Autentifică-te</Link>
                    </p>
                </AuthCard>
            </div>
        </main>
    );
}
