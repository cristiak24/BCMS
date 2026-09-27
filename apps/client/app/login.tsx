import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    AlertCircle,
    CheckCircle2,
    Loader2,
} from 'lucide-react';
import { getHomeRouteForRole } from '../utils/authSession';
import { useLogin } from '../hooks/useLogin';
import { useSession } from '../context/AuthContext';
import { LoadingScreen } from '../components/ui/ScreenState';
import {
    AuthCard,
    AuthHeading,
    BrandGlyph,
    MobileBrand,
    PageBackdrop,
    authFieldClass,
    authInputClass,
    authLabelClass,
    authPrimaryButtonClass,
} from '../components/auth/AuthChrome';

type GlyphProps = {
    className?: string;
    size?: number;
};

function MailGlyph({ className, size = 22 }: GlyphProps) {
    return (
        <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 28 28" fill="none">
            <path d="M4.6 8.4h18.8v13H4.6v-13Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
            <path d="M5.4 9.2 14 15.3l8.6-6.1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8.5 5.6h11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.45" />
        </svg>
    );
}

function LockGlyph({ className, size = 22 }: GlyphProps) {
    return (
        <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 28 28" fill="none">
            <path d="M6.4 12.1h17.2v12H6.4v-12Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
            <path d="M10 12.1V9.3c0-3 2-5.1 5-5.1s5 2.1 5 5.1v2.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M15 16.1v4.1M11.1 18.1h7.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.62" />
        </svg>
    );
}

function EyeGlyph({ className, hidden = false, size = 18 }: GlyphProps & { hidden?: boolean }) {
    return (
        <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 28 28" fill="none">
            <path d="M3.8 14s3.7-6 10.2-6 10.2 6 10.2 6-3.7 6-10.2 6-10.2-6-10.2-6Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
            <circle cx="14" cy="14" r="3.2" stroke="currentColor" strokeWidth="2" />
            {hidden ? <path d="M5.8 23.2 22.2 6.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /> : null}
        </svg>
    );
}

function RoleGlyph({ className, size = 16 }: GlyphProps) {
    return (
        <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
            <circle cx="7.2" cy="8.2" r="2.6" stroke="currentColor" strokeWidth="2" />
            <path d="M3.5 18.5c.7-2.9 2.3-4.4 4.7-4.4 1.7 0 3 .8 3.9 2.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M14.2 8.4h6.3M14.2 13h6.3M14.2 17.6h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

function LoginGlyph({ className, size = 20 }: GlyphProps) {
    return (
        <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 28 28" fill="none">
            <path d="M4.5 14h13" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            <path d="m13.5 9 5 5-5 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M18.5 5.8h4.2v16.4h-4.2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.72" />
        </svg>
    );
}

function ArrowGlyph({ className, size = 18 }: GlyphProps) {
    return (
        <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
            <path d="M4 12h15M14 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function TacticNodeGlyph({ className, size = 23, variant = 'target' }: GlyphProps & { variant?: 'target' | 'route' | 'seal' }) {
    if (variant === 'route') {
        return (
            <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 28 28" fill="none">
                <circle cx="7" cy="8" r="2.6" stroke="currentColor" strokeWidth="2.1" />
                <circle cx="21" cy="14" r="2.6" stroke="currentColor" strokeWidth="2.1" />
                <circle cx="9" cy="21" r="2.6" stroke="currentColor" strokeWidth="2.1" />
                <path d="M9.4 9.2 18.6 13M18.7 15.7 11.4 19.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
            </svg>
        );
    }

    if (variant === 'seal') {
        return (
            <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 28 28" fill="none">
                <path d="M14 3.9 17 6l3.6-.2 1.1 3.4 2.7 2.4-1.3 3.4.5 3.6-3.3 1.5-2 3-3.6-.8-3.6.8-2-3-3.3-1.5.5-3.6-1.3-3.4 2.7-2.4L7.4 5.8 11 6l3-2.1Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="m10.2 14.1 2.4 2.4 5.3-5.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }

    return (
        <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="8.5" stroke="currentColor" strokeWidth="2.1" />
            <circle cx="14" cy="14" r="2.7" stroke="currentColor" strokeWidth="2.1" />
            <path d="M14 5.5v17M5.5 14h17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity="0.58" />
        </svg>
    );
}

function TacticsCanvas() {
    return (
        <div className="relative min-h-[420px] overflow-hidden">
            <svg aria-hidden="true" className="absolute inset-x-0 top-0 h-[420px] w-full" viewBox="0 0 720 420" fill="none">
                <defs>
                    <linearGradient id="courtWash" x1="70" x2="690" y1="30" y2="370" gradientUnits="userSpaceOnUse">
                        <stop stopColor="var(--c-tint-fg)" />
                        <stop offset="0.48" stopColor="var(--c-surface-2)" />
                        <stop offset="1" stopColor="var(--c-warning-bg)" />
                    </linearGradient>
                    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="18" stdDeviation="22" floodColor="var(--c-brand-fg)" floodOpacity="0.16" />
                    </filter>
                </defs>
                <rect x="22" y="24" width="676" height="366" rx="8" fill="url(#courtWash)" filter="url(#softShadow)" />
                <rect x="46" y="48" width="628" height="318" rx="8" stroke="var(--c-brand-fg)" strokeOpacity="0.16" strokeWidth="2" />
                <path d="M360 48V366" stroke="var(--c-brand-fg)" strokeOpacity="0.12" strokeWidth="2" />
                <circle cx="360" cy="207" r="54" stroke="var(--c-brand-fg)" strokeOpacity="0.14" strokeWidth="2" />
                <path d="M46 126H158V288H46" stroke="var(--c-brand-fg)" strokeOpacity="0.14" strokeWidth="2" />
                <path d="M674 126H562V288H674" stroke="var(--c-brand-fg)" strokeOpacity="0.14" strokeWidth="2" />
                <path d="M158 158C218 177 218 237 158 256" stroke="var(--c-brand-fg)" strokeOpacity="0.14" strokeWidth="2" />
                <path d="M562 158C502 177 502 237 562 256" stroke="var(--c-brand-fg)" strokeOpacity="0.14" strokeWidth="2" />

                <path d="M126 276C206 190 278 244 350 168C411 103 487 113 568 74" stroke="var(--c-blue)" strokeWidth="5" strokeLinecap="round" strokeDasharray="2 14" />
                <path d="M152 116C226 156 284 147 339 214C389 275 466 288 591 244" stroke="var(--c-success-fg)" strokeWidth="4" strokeLinecap="round" />
                <path d="M248 318C310 282 344 300 407 253C453 219 511 205 610 212" stroke="var(--c-warning)" strokeWidth="4" strokeLinecap="round" />
            </svg>

            <div className="absolute left-[14%] top-[64%] flex h-12 w-12 items-center justify-center rounded-lg bg-[#2563EB] text-white shadow-lg shadow-blue-500/25">
                <TacticNodeGlyph variant="target" size={23} />
            </div>
            <div className="absolute left-[46%] top-[36%] flex h-12 w-12 items-center justify-center rounded-lg bg-[#059669] text-white shadow-lg shadow-emerald-500/20">
                <TacticNodeGlyph variant="route" size={23} />
            </div>
            <div className="absolute right-[12%] top-[14%] flex h-12 w-12 items-center justify-center rounded-lg bg-[#D97706] text-white shadow-lg shadow-amber-500/20">
                <TacticNodeGlyph variant="seal" size={23} />
            </div>

            <div className="absolute left-8 top-8 max-w-[220px]">
                <p className="m-0 text-xs font-black uppercase tracking-[0.18em] text-[#123B95]">Court logic</p>
                <p className="m-0 mt-2 text-2xl font-black leading-tight text-[#0D1F3A]">
                    Tot clubul, asezat ca o schema de joc.
                </p>
            </div>

            <div className="absolute bottom-3 right-8 max-w-[250px] border-l-2 border-[#D97706] bg-white/55 py-2 pl-4 pr-1 backdrop-blur-sm">
                <p className="m-0 text-sm font-black text-slate-950">Program, prezenta, plati, documente.</p>
                <p className="m-0 mt-1 text-xs font-bold leading-5 text-slate-500">Fiecare rol intra direct in contextul potrivit.</p>
            </div>
        </div>
    );
}

function BrandSide() {
    return (
        <section className="relative hidden min-h-[680px] flex-col justify-center overflow-hidden md:flex">
            <div className="absolute inset-0 opacity-75 [background-image:linear-gradient(rgba(18,59,149,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(18,59,149,0.055)_1px,transparent_1px)] [background-size:34px_34px]" />

            <div className="relative z-10 flex min-h-[680px] flex-col justify-between p-7">
                <div className="flex items-center justify-between gap-5">
                    <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#123B95] text-white shadow-lg shadow-blue-600/20">
                            <BrandGlyph size={30} />
                        </div>
                        <div>
                            <p className="m-0 text-xl font-black text-slate-950">BCMS</p>
                            <p className="m-0 text-sm font-bold text-slate-500">Basketball Club Management</p>
                        </div>
                    </div>
                    <div className="h-px min-w-20 flex-1 bg-slate-200" />
                    <p className="m-0 text-xs font-black uppercase tracking-[0.18em] text-slate-400">Access</p>
                </div>

                <div>
                    <h1 className="m-0 max-w-[660px] text-5xl font-black leading-tight text-[#0D1F3A]">
                        Mai putin admin. Mai mult joc.
                    </h1>
                    <p className="m-0 mt-5 max-w-xl text-lg font-semibold leading-8 text-slate-600">
                        Login-ul deschide un spatiu construit pentru ritmul real al unui club de baschet: oameni, program, responsabilitati si decizii rapide.
                    </p>
                </div>

                <TacticsCanvas />
            </div>
        </section>
    );
}

export default function Login() {
    const navigate = useNavigate();
    const {
        email,
        setEmail,
        password,
        setPassword,
        loading,
        forgotPasswordLoading,
        errorMsg,
        forgotPasswordMsg,
        resetStage,
        resetCode,
        setResetCode,
        newPassword,
        setNewPassword,
        login,
        forgotPassword,
        submitPasswordReset,
        cancelPasswordReset,
    } = useLogin();
    const { session, initializing } = useSession();
    const [showPassword, setShowPassword] = useState(false);

    const emailIsFilled = useMemo(() => email.trim().length > 0, [email]);
    const passwordIsFilled = password.length > 0;

    useEffect(() => {
        if (!initializing && session) {
            navigate(getHomeRouteForRole(session.role), { replace: true });
        }
    }, [initializing, navigate, session]);

    if (initializing) {
        return <LoadingScreen message="Verificam sesiunea..." backgroundColor="var(--c-surface)" color="var(--c-blue)" />;
    }

    return (
        <main className="relative isolate min-h-screen overflow-hidden text-slate-950">
            <PageBackdrop />
            <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 items-center gap-6 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(390px,460px)] md:px-8 lg:gap-12">
                <BrandSide />

                <section className="w-full">
                    <div className="mx-auto w-full max-w-[460px]">
                        <MobileBrand />

                        <AuthCard>
                            <AuthHeading title="Intră în cont" subtitle="Conectare securizată pentru contul tău BCMS." />

                            <form
                                className="flex w-full flex-col gap-3.5"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void login();
                                }}
                            >
                                <label className="block">
                                    <span className={authLabelClass}>
                                        Email
                                        {emailIsFilled ? <CheckCircle2 size={16} className="text-emerald-600" /> : null}
                                    </span>
                                    <span className={`${authFieldClass} ${errorMsg ? 'border-red-300' : 'border-slate-200'}`}>
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                                            <MailGlyph size={20} />
                                        </span>
                                        <input
                                            className={`ml-3 ${authInputClass}`}
                                            placeholder="nume@club.ro"
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            autoCapitalize="none"
                                            autoComplete="email"
                                            disabled={loading}
                                        />
                                    </span>
                                </label>

                                <label className="block">
                                    <span className={authLabelClass}>
                                        Parola
                                        {passwordIsFilled ? <CheckCircle2 size={16} className="text-emerald-600" /> : null}
                                    </span>
                                    <span className={`${authFieldClass} ${errorMsg ? 'border-red-300' : 'border-slate-200'}`}>
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                                            <LockGlyph size={20} />
                                        </span>
                                        <input
                                            className={`ml-3 ${authInputClass}`}
                                            placeholder="Parola"
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            autoComplete="current-password"
                                            disabled={loading}
                                        />
                                        <button
                                            type="button"
                                            aria-label={showPassword ? 'Ascunde parola' : 'Arata parola'}
                                            onClick={() => setShowPassword((value) => !value)}
                                            className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-slate-100"
                                        >
                                            <EyeGlyph hidden={showPassword} size={18} />
                                        </button>
                                    </span>
                                </label>

                                <div className="flex items-center justify-between gap-4">
                                    <div className="hidden items-center gap-2 text-xs font-bold text-slate-500 sm:flex">
                                        <RoleGlyph size={16} className="text-emerald-600" />
                                        Acces pe rol
                                    </div>
                                    <button
                                        type="button"
                                        onClick={forgotPassword}
                                        disabled={forgotPasswordLoading || loading}
                                        className="ml-auto min-h-[36px] border-0 bg-transparent px-0 text-sm font-black text-blue-700 transition-colors hover:text-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {forgotPasswordLoading ? 'Trimit resetarea...' : 'Ai uitat parola?'}
                                    </button>
                                </div>

                                {errorMsg ? (
                                    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                                        <AlertCircle className="mt-0.5 shrink-0" size={18} />
                                        <p className="m-0 text-sm font-bold leading-5">{errorMsg}</p>
                                    </div>
                                ) : null}

                                {forgotPasswordMsg ? (
                                    <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
                                        <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
                                        <p className="m-0 text-sm font-bold leading-5">{forgotPasswordMsg}</p>
                                    </div>
                                ) : null}

                                {resetStage === 'code-sent' ? (
                                    <div className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
                                        <p className="m-0 text-sm font-bold text-blue-900">
                                            Introdu codul primit pe email si o parola noua.
                                        </p>
                                        <input
                                            className="min-h-[48px] rounded-lg border border-slate-200 bg-white px-3 text-base font-bold text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-600"
                                            placeholder="Cod de resetare"
                                            value={resetCode}
                                            onChange={(e) => setResetCode(e.target.value)}
                                            disabled={forgotPasswordLoading}
                                        />
                                        <input
                                            className="min-h-[48px] rounded-lg border border-slate-200 bg-white px-3 text-base font-bold text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-600"
                                            placeholder="Parola noua"
                                            type="password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            autoComplete="new-password"
                                            disabled={forgotPasswordLoading}
                                        />
                                        <div className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={submitPasswordReset}
                                                disabled={forgotPasswordLoading}
                                                className="min-h-[44px] flex-1 rounded-lg border-0 bg-[#2563EB] px-4 text-sm font-black text-white transition-colors hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-70"
                                            >
                                                {forgotPasswordLoading ? 'Se salveaza...' : 'Salveaza parola noua'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={cancelPasswordReset}
                                                disabled={forgotPasswordLoading}
                                                className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 hover:bg-slate-50"
                                            >
                                                Renunta
                                            </button>
                                        </div>
                                    </div>
                                ) : null}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className={`mt-1 ${authPrimaryButtonClass}`}
                                >
                                    {loading ? <Loader2 className="animate-spin" size={20} /> : <LoginGlyph size={19} />}
                                    <span>{loading ? 'Se conecteaza...' : 'Autentificare'}</span>
                                    {!loading ? <ArrowGlyph size={18} /> : null}
                                </button>
                            </form>

                            <p className="m-0 mt-5 text-center text-sm font-semibold text-slate-500">
                                Ai primit o invitație? <Link to="/signup" className="font-black text-blue-700 no-underline hover:underline">Creează cont</Link>
                            </p>
                        </AuthCard>
                    </div>
                </section>
            </div>
        </main>
    );
}
