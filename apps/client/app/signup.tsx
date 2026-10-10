import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2, Lock, Eye, EyeOff, Ticket, ArrowRight, Phone, Plus, X, Users, UserRound } from 'lucide-react';
import { authApi, type InviteDetails } from '../services/authApi';
import { familyApi } from '../services/familyApi';
import { setActiveChildId } from '../services/apiClient';
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
 * Accepts whatever the user pastes: a short club code (K7M4-QX2P), the full
 * registration link generated in Manage Access (…/signup?inviteToken=…), an
 * /invite/<token> link, or the bare token itself. The server tells codes and
 * link tokens apart.
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

type ChildDraft = { firstName: string; lastName: string; birthDate: string };
const EMPTY_CHILD: ChildDraft = { firstName: '', lastName: '', birthDate: '' };
const MAX_CHILDREN = 5;

/** Same rule as the server (lib/contacts.ts normalizePhone). */
function isValidPhone(value: string) {
    const text = value.trim();
    const digits = text.replace(/\D/g, '').length;
    return /^\+?[0-9 ().-]{6,32}$/.test(text) && digits >= 6 && digits <= 15;
}

export default function Signup() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { session, initializing, reloadSession, signOut } = useSession();
    const urlToken = searchParams.get('inviteToken') ?? '';

    const [codeInput, setCodeInput] = useState(urlToken);
    const [inviteToken, setInviteToken] = useState('');
    const [invite, setInvite] = useState<InviteDetails | null>(null);
    const [validating, setValidating] = useState(false);

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [phone, setPhone] = useState('');
    // Team-code signups: who is registering, and for whom.
    const [joinAs, setJoinAs] = useState<'parent' | 'player' | null>(null);
    const [children, setChildren] = useState<ChildDraft[]>([{ ...EMPTY_CHILD }]);
    const [birthDate, setBirthDate] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // A signed-in parent opening a personal invite link ("fam_…") just gets the
    // child linked to the account they already have.
    const [linkingInvite, setLinkingInvite] = useState(false);
    // Opening any other registration link while a session is still active (a
    // stale sign-in the app never confirmed, or a different account someone
    // is deliberately switching away from) must not bounce back into that
    // session — the link means "sign me up as someone else". Drop it first.
    const [droppingStaleSession, setDroppingStaleSession] = useState(false);
    useEffect(() => {
        if (initializing || !session) return;
        if (session.role === 'parent' && urlToken.startsWith('fam_')) {
            setLinkingInvite(true);
            void familyApi.acceptInvite(urlToken)
                .then(({ playerId }) => setActiveChildId(playerId))
                .catch(() => undefined)
                .finally(() => navigate(getHomeRouteForRole(session.role), { replace: true }));
            return;
        }
        if (urlToken) {
            setDroppingStaleSession(true);
            void signOut().finally(() => setDroppingStaleSession(false));
            return;
        }
        navigate(getHomeRouteForRole(session.role), { replace: true });
    }, [initializing, navigate, session, urlToken, signOut]);

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
        setJoinAs(null);
        setChildren([{ ...EMPTY_CHILD }]);
        setBirthDate('');
        setError(null);
    };

    const isTeamCode = invite?.source === 'team';
    const isGuardianInvite = invite?.source === 'guardian';
    // A parent code/link from the club: the parent types their children here
    // (name + birth year); the code or link may already carry the team.
    const isParentInvite = (invite?.source === 'code' || invite?.source === 'manage-access') && invite.role === 'parent';
    const collectsChildren = isParentInvite || (isTeamCode && joinAs === 'parent');
    const currentYear = new Date().getFullYear();
    const updateChild = (index: number, patch: Partial<ChildDraft>) =>
        setChildren((list) => list.map((child, i) => (i === index ? { ...child, ...patch } : child)));

    const handleSignup = async () => {
        if (!invite || !inviteToken) return;

        if (isTeamCode && !joinAs) {
            setError('Alege dacă îți faci cont ca părinte sau ca jucător.');
            return;
        }
        if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
            setError('Completează prenumele, numele, emailul și parola.');
            return;
        }
        if (!isValidPhone(phone)) {
            setError('Introdu un număr de telefon valid — clubul te poate contacta pe el.');
            return;
        }
        if (password.length < 8) {
            setError('Parola trebuie să aibă cel puțin 8 caractere.');
            return;
        }
        if (collectsChildren && children.some((child) => !child.firstName.trim() || !child.lastName.trim() || !child.birthDate)) {
            setError(isParentInvite
                ? 'Completează prenumele, numele și anul nașterii pentru fiecare copil.'
                : 'Completează numele, prenumele și data nașterii pentru fiecare copil.');
            return;
        }
        if (isParentInvite && children.some((child) => !/^\d{4}$/.test(child.birthDate) || Number(child.birthDate) > currentYear || Number(child.birthDate) < currentYear - 30)) {
            setError('Anul nașterii trebuie să fie format din 4 cifre (ex. 2015).');
            return;
        }
        if (isTeamCode && joinAs === 'player' && !birthDate) {
            setError('Completează data nașterii.');
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
                phone: phone.trim(),
                ...(isTeamCode && joinAs === 'parent'
                    ? { joinAs, children: children.map((child) => ({ firstName: child.firstName.trim(), lastName: child.lastName.trim(), birthDate: child.birthDate })) }
                    : {}),
                ...(isParentInvite
                    ? { children: children.map((child) => ({ firstName: child.firstName.trim(), lastName: child.lastName.trim(), birthYear: Number(child.birthDate) })) }
                    : {}),
                ...(isTeamCode && joinAs === 'player' ? { joinAs, birthDate } : {}),
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

    if (initializing || linkingInvite || droppingStaleSession) {
        return <LoadingScreen message="Verificăm sesiunea..." backgroundColor="var(--c-surface)" color="var(--c-blue)" />;
    }

    const emailLocked = Boolean(invite?.email);
    const roleLabel = invite?.role ? (ROLE_LABELS[invite.role] ?? invite.role) : '';

    return (
        <main className="relative isolate min-h-screen overflow-hidden text-slate-950">
            <PageBackdrop />
            <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[460px] flex-col justify-center px-4 py-4">
                <MobileBrand showOnDesktop />

                <AuthCard>
                    <AuthHeading
                        title="Creează cont"
                        subtitle={isTeamCode
                            ? 'Înscriere în echipă. Antrenorul sau clubul aprobă cererea, apoi intri în aplicație.'
                            : invite
                                ? 'Completează datele tale pentru a intra în club.'
                                : 'Introdu codul primit de la club sau de la antrenorul echipei.'}
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
                                    <Ticket size={18} className="shrink-0 text-[var(--c-muted)]" />
                                    <input
                                        className={`ml-2.5 ${authInputClass}`}
                                        placeholder="Ex: 4KQ7-2M (echipă), K7M4-QX2P sau linkul"
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
                            {/* Role and club come from the invite; the admin chose them. A
                                team code only fixes the team — the person says who they are. */}
                            <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
                                <Lock size={16} className="shrink-0 text-blue-700" />
                                <div className="min-w-0 flex-1">
                                    <p className="m-0 truncate text-[13px] font-black text-blue-950">
                                        {isTeamCode
                                            ? `${invite.teamName ?? 'Echipă'}${invite.clubName ? ` · ${invite.clubName}` : ''}`
                                            : isGuardianInvite
                                                ? `Părinte · ${invite.childName ?? ''}`
                                                : `${roleLabel}${invite.clubName ? ` · ${invite.clubName}` : ''}`}
                                    </p>
                                    <p className="m-0 text-[11px] font-bold text-blue-700">
                                        {isTeamCode
                                            ? 'Cod de echipă'
                                            : isGuardianInvite
                                                ? `Invitație de la ${invite.clubName ?? 'club'} · contul se leagă de copil`
                                                : isParentInvite && invite.teamName
                                                    ? `Copilul intră direct în echipa ${invite.teamName}`
                                                    : 'Rol stabilit de administrator'}
                                    </p>
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

                            {isTeamCode ? (
                                <div>
                                    <span className={authLabelClass}>Îmi fac cont ca</span>
                                    <div className="grid grid-cols-2 gap-2">
                                        {([
                                            { key: 'parent', label: 'Părinte', hint: 'Îmi înscriu copilul', Icon: Users },
                                            { key: 'player', label: 'Jucător', hint: '14 ani sau mai mult', Icon: UserRound },
                                        ] as const).map(({ key, label, hint, Icon }) => {
                                            const active = joinAs === key;
                                            return (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    aria-pressed={active}
                                                    onClick={() => setJoinAs(key)}
                                                    disabled={submitting}
                                                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${active ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                                                >
                                                    <Icon size={18} className={active ? 'shrink-0 text-blue-700' : 'shrink-0 text-slate-400'} />
                                                    <span className="min-w-0">
                                                        <span className={`block text-[13.5px] font-black ${active ? 'text-blue-950' : 'text-slate-800'}`}>{label}</span>
                                                        <span className="block text-[11px] font-bold text-slate-500">{hint}</span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : null}

                            {isTeamCode && !joinAs ? null : (
                                <>
                                    {isTeamCode || isParentInvite ? (
                                        <p className="m-0 -mb-1 text-[12px] font-black uppercase tracking-wide text-slate-500">
                                            {joinAs === 'parent' || isParentInvite ? 'Datele tale (părinte)' : 'Datele tale'}
                                        </p>
                                    ) : null}
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
                                        <span className={authLabelClass}>Telefon</span>
                                        <span className={`${authFieldClass} ${phone && !isValidPhone(phone) ? 'border-red-300' : 'border-slate-200'}`}>
                                            <Phone size={16} className="shrink-0 text-slate-400" />
                                            <input
                                                className={`ml-2.5 ${authInputClass}`}
                                                placeholder="07xx xxx xxx"
                                                type="tel"
                                                inputMode="tel"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                autoComplete="tel"
                                                disabled={submitting}
                                            />
                                        </span>
                                    </label>

                                    {isTeamCode && joinAs === 'player' ? (
                                        <label className="block">
                                            <span className={authLabelClass}>Data nașterii</span>
                                            <span className={`${authFieldClass} border-slate-200`}>
                                                <input
                                                    className={authInputClass}
                                                    type="date"
                                                    value={birthDate}
                                                    max={new Date().toISOString().slice(0, 10)}
                                                    onChange={(e) => setBirthDate(e.target.value)}
                                                    disabled={submitting}
                                                />
                                            </span>
                                        </label>
                                    ) : null}

                                    {collectsChildren ? (
                                        <div className="flex flex-col gap-2.5">
                                            {children.map((child, index) => (
                                                <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                                    <div className="mb-2 flex items-center justify-between">
                                                        <span className="text-[12px] font-black uppercase tracking-wide text-slate-500">
                                                            {children.length > 1 ? `Copilul ${index + 1}` : 'Copilul tău'}
                                                        </span>
                                                        {children.length > 1 ? (
                                                            <button
                                                                type="button"
                                                                aria-label={`Scoate copilul ${index + 1}`}
                                                                onClick={() => setChildren((list) => list.filter((_, i) => i !== index))}
                                                                className="flex h-7 w-7 items-center justify-center rounded-md border-0 bg-transparent text-slate-400 hover:bg-slate-200"
                                                            >
                                                                <X size={15} />
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <span className={`${authFieldClass} border-slate-200 bg-white`}>
                                                            <input className={authInputClass} placeholder="Prenume" aria-label={`Prenume copil ${index + 1}`} value={child.firstName} onChange={(e) => updateChild(index, { firstName: e.target.value })} disabled={submitting} />
                                                        </span>
                                                        <span className={`${authFieldClass} border-slate-200 bg-white`}>
                                                            <input className={authInputClass} placeholder="Nume" aria-label={`Nume copil ${index + 1}`} value={child.lastName} onChange={(e) => updateChild(index, { lastName: e.target.value })} disabled={submitting} />
                                                        </span>
                                                    </div>
                                                    <label className="mt-2 block">
                                                        <span className="mb-1 block text-[11.5px] font-bold text-slate-500">{isParentInvite ? 'Anul nașterii' : 'Data nașterii'}</span>
                                                        <span className={`${authFieldClass} border-slate-200 bg-white`}>
                                                            {isParentInvite ? (
                                                                <input
                                                                    className={authInputClass}
                                                                    type="text"
                                                                    inputMode="numeric"
                                                                    maxLength={4}
                                                                    placeholder={String(currentYear - 10)}
                                                                    aria-label={`Anul nașterii copil ${index + 1}`}
                                                                    value={child.birthDate}
                                                                    onChange={(e) => updateChild(index, { birthDate: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                                                                    disabled={submitting}
                                                                />
                                                            ) : (
                                                                <input
                                                                    className={authInputClass}
                                                                    type="date"
                                                                    aria-label={`Data nașterii copil ${index + 1}`}
                                                                    value={child.birthDate}
                                                                    max={new Date().toISOString().slice(0, 10)}
                                                                    onChange={(e) => updateChild(index, { birthDate: e.target.value })}
                                                                    disabled={submitting}
                                                                />
                                                            )}
                                                        </span>
                                                    </label>
                                                </div>
                                            ))}
                                            {children.length < MAX_CHILDREN ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setChildren((list) => [...list, { ...EMPTY_CHILD, lastName: list[0]?.lastName ?? '' }])}
                                                    disabled={submitting}
                                                    className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-transparent px-3 py-2.5 text-[13px] font-black text-blue-700 hover:bg-blue-50"
                                                >
                                                    <Plus size={15} /> Mai am un copil în club
                                                </button>
                                            ) : null}
                                        </div>
                                    ) : null}

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
                                        <span>{submitting ? 'Se creează contul...' : isTeamCode ? 'Trimite cererea' : 'Creează cont'}</span>
                                    </button>
                                </>
                            )}
                        </form>
                    )}

                    <p className="m-0 mt-5 text-center text-sm font-semibold text-slate-500">
                        Ai deja cont? <Link to="/login" className="font-bold text-[var(--c-brand-fg)] no-underline hover:underline">Autentifică-te</Link>
                    </p>
                </AuthCard>
            </div>
        </main>
    );
}
