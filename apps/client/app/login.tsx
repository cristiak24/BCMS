import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    AlertCircle,
    CheckCircle2,
    Loader2,
} from 'lucide-react';
import { getHomeRouteForRole } from '../utils/authSession';
import { useLogin } from '../hooks/useLogin';
import { useFirebaseAuth } from '../context/AuthContext';
import { LoadingScreen } from '../components/ui/ScreenState';

type GlyphProps = {
    className?: string;
    size?: number;
};

function BrandGlyph({ className, size = 28 }: GlyphProps) {
    return (
        <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 32 32" fill="none">
            <path d="M7 9.5C9.8 6.8 12.9 5.4 16 5.4c3.1 0 6.2 1.4 9 4.1v5.2c0 6.2-3.3 10.5-9 13.4-5.7-2.9-9-7.2-9-13.4V9.5Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
            <circle cx="16" cy="15.6" r="5.2" stroke="currentColor" strokeWidth="2" />
            <path d="M10.8 15.6h10.4M16 10.4v10.4M12.4 11.9c2.4 1.6 4.8 1.6 7.2 0M12.4 19.3c2.4-1.6 4.8-1.6 7.2 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
    );
}

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

function PageBackdrop() {
    return (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute inset-0 bg-[#EDF4FA]" />
            <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(18,59,149,0.08)_0%,rgba(18,59,149,0.025)_31%,rgba(255,255,255,0)_58%),linear-gradient(245deg,rgba(217,119,6,0.12)_0%,rgba(217,119,6,0.035)_28%,rgba(255,255,255,0)_56%)]" />
            <div className="absolute inset-0 opacity-55 [background-image:linear-gradient(rgba(18,59,149,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(18,59,149,0.045)_1px,transparent_1px)] [background-size:34px_34px]" />
            <div className="absolute -left-24 top-0 h-full w-[58%] skew-x-[-10deg] bg-white/34" />
            <div className="absolute bottom-0 right-0 h-[48%] w-[62%] skew-x-[-14deg] bg-[#FFF7E8]/52" />

            <svg className="absolute inset-0 h-full w-full opacity-80" viewBox="0 0 1440 900" fill="none" preserveAspectRatio="none">
                <path d="M-80 713C154 585 302 635 472 517C638 402 795 317 1057 374C1222 410 1340 351 1510 268" stroke="#123B95" strokeOpacity="0.10" strokeWidth="3" />
                <path d="M-92 252C145 334 279 279 463 355C643 429 688 552 905 555C1100 558 1217 482 1510 533" stroke="#059669" strokeOpacity="0.13" strokeWidth="3" />
                <path d="M83 108H587V365H83V108Z" stroke="#123B95" strokeOpacity="0.08" strokeWidth="2" />
                <path d="M942 570H1390V874H942V570Z" stroke="#D97706" strokeOpacity="0.10" strokeWidth="2" />
                <circle cx="336" cy="236" r="72" stroke="#123B95" strokeOpacity="0.08" strokeWidth="2" />
                <circle cx="1167" cy="722" r="96" stroke="#D97706" strokeOpacity="0.10" strokeWidth="2" />
                <path d="M336 108V365M83 236H587M1167 570V874M942 722H1390" stroke="#123B95" strokeOpacity="0.055" strokeWidth="2" />
            </svg>
        </div>
    );
}

function TacticsCanvas() {
    return (
        <div className="relative min-h-[420px] overflow-hidden">
            <svg aria-hidden="true" className="absolute inset-x-0 top-0 h-[420px] w-full" viewBox="0 0 720 420" fill="none">
                <defs>
                    <linearGradient id="courtWash" x1="70" x2="690" y1="30" y2="370" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#EAF2FF" />
                        <stop offset="0.48" stopColor="#F7FAFD" />
                        <stop offset="1" stopColor="#FFF2D9" />
                    </linearGradient>
                    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="18" stdDeviation="22" floodColor="#123B95" floodOpacity="0.16" />
                    </filter>
                </defs>
                <rect x="22" y="24" width="676" height="366" rx="8" fill="url(#courtWash)" filter="url(#softShadow)" />
                <rect x="46" y="48" width="628" height="318" rx="8" stroke="#123B95" strokeOpacity="0.16" strokeWidth="2" />
                <path d="M360 48V366" stroke="#123B95" strokeOpacity="0.12" strokeWidth="2" />
                <circle cx="360" cy="207" r="54" stroke="#123B95" strokeOpacity="0.14" strokeWidth="2" />
                <path d="M46 126H158V288H46" stroke="#123B95" strokeOpacity="0.14" strokeWidth="2" />
                <path d="M674 126H562V288H674" stroke="#123B95" strokeOpacity="0.14" strokeWidth="2" />
                <path d="M158 158C218 177 218 237 158 256" stroke="#123B95" strokeOpacity="0.14" strokeWidth="2" />
                <path d="M562 158C502 177 502 237 562 256" stroke="#123B95" strokeOpacity="0.14" strokeWidth="2" />

                <path d="M126 276C206 190 278 244 350 168C411 103 487 113 568 74" stroke="#2563EB" strokeWidth="5" strokeLinecap="round" strokeDasharray="2 14" />
                <path d="M152 116C226 156 284 147 339 214C389 275 466 288 591 244" stroke="#059669" strokeWidth="4" strokeLinecap="round" />
                <path d="M248 318C310 282 344 300 407 253C453 219 511 205 610 212" stroke="#D97706" strokeWidth="4" strokeLinecap="round" />
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
        login,
        forgotPassword,
    } = useLogin();
    const { session, initializing } = useFirebaseAuth();
    const [showPassword, setShowPassword] = useState(false);

    const emailIsFilled = useMemo(() => email.trim().length > 0, [email]);
    const passwordIsFilled = password.length > 0;

    useEffect(() => {
        if (!initializing && session) {
            navigate(getHomeRouteForRole(session.role), { replace: true });
        }
    }, [initializing, navigate, session]);

    if (initializing) {
        return <LoadingScreen message="Verificam sesiunea..." backgroundColor="#FFFFFF" color="#2563EB" />;
    }

    return (
        <main className="relative isolate min-h-screen overflow-hidden text-slate-950">
            <PageBackdrop />
            <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 items-center gap-6 px-4 py-5 md:grid-cols-[minmax(0,1fr)_minmax(390px,460px)] md:px-8 lg:gap-12">
                <BrandSide />

                <section className="w-full">
                    <div className="mx-auto w-full max-w-[460px]">
                        <div className="mb-4 flex items-center justify-between md:hidden">
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#123B95] text-white shadow-lg shadow-blue-600/20">
                                    <BrandGlyph size={28} />
                                </div>
                                <div>
                                    <p className="m-0 text-lg font-black text-slate-950">BCMS</p>
                                    <p className="m-0 text-xs font-bold text-slate-500">Club workspace</p>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-lg border border-white/80 bg-white/82 p-5 shadow-2xl shadow-slate-400/35 backdrop-blur-xl md:p-7">
                            <div className="mb-7">
                                <div className="mb-5 flex items-center justify-between">
                                    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[#123B95] p-3 text-white shadow-lg shadow-blue-600/20">
                                        <BrandGlyph size={32} />
                                    </div>
                                    <div className="hidden rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-600 sm:block">
                                        Staff portal
                                    </div>
                                </div>

                                <h2 className="m-0 text-4xl font-black leading-tight text-slate-950 md:text-[42px]">
                                    Intra in cont
                                </h2>
                                <p className="m-0 mt-3 text-base font-semibold leading-7 text-slate-500">
                                    Conectare securizata pentru contul tau BCMS.
                                </p>
                            </div>

                            <form
                                className="flex w-full flex-col gap-4"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void login();
                                }}
                            >
                                <label className="block">
                                    <span className="mb-2 flex items-center justify-between text-sm font-black text-slate-700">
                                        Email
                                        {emailIsFilled ? <CheckCircle2 size={16} className="text-emerald-600" /> : null}
                                    </span>
                                    <span className={`flex min-h-[56px] items-center rounded-lg border bg-white px-3 transition-colors focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 ${errorMsg ? 'border-red-300' : 'border-slate-200'}`}>
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                                            <MailGlyph size={23} />
                                        </span>
                                        <input
                                            className="ml-3 min-h-[52px] min-w-0 flex-1 bg-transparent text-base font-bold text-slate-950 outline-none placeholder:text-slate-400"
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
                                    <span className="mb-2 flex items-center justify-between text-sm font-black text-slate-700">
                                        Parola
                                        {passwordIsFilled ? <CheckCircle2 size={16} className="text-emerald-600" /> : null}
                                    </span>
                                    <span className={`flex min-h-[56px] items-center rounded-lg border bg-white px-3 transition-colors focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 ${errorMsg ? 'border-red-300' : 'border-slate-200'}`}>
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                                            <LockGlyph size={23} />
                                        </span>
                                        <input
                                            className="ml-3 min-h-[52px] min-w-0 flex-1 bg-transparent text-base font-bold text-slate-950 outline-none placeholder:text-slate-400"
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
                                            className="ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-slate-100"
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
                                        className="ml-auto min-h-[40px] border-0 bg-transparent px-0 text-sm font-black text-blue-700 transition-colors hover:text-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
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

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="mt-1 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-lg border-0 bg-[#2563EB] px-4 text-base font-black text-white shadow-xl shadow-blue-600/20 transition-colors hover:bg-[#1D4ED8] active:bg-[#1E3A8A] disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                    {loading ? <Loader2 className="animate-spin" size={20} /> : <LoginGlyph size={20} />}
                                    <span>{loading ? 'Se conecteaza...' : 'Autentificare'}</span>
                                    {!loading ? <ArrowGlyph size={18} /> : null}
                                </button>
                            </form>

                            <div className="mt-6 flex items-center justify-center gap-2 border-t border-slate-100 pt-5 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                                <BrandGlyph size={15} className="text-blue-700" />
                                Roluri, cluburi si sesiuni securizate
                            </div>

                            <p className="m-0 mt-6 text-center text-sm font-semibold text-slate-500">
                                Nu ai cont? <Link to="/signup" className="font-black text-blue-700 no-underline hover:underline">Creeaza unul</Link>
                            </p>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}
