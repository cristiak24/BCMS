import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    AlertCircle,
    ArrowRight,
    Check,
    CheckCircle2,
    Eye,
    EyeOff,
    Loader2,
    Lock,
    Mail,
    MapPin,
    Receipt,
} from 'lucide-react';
import { getHomeRouteForRole } from '../utils/authSession';
import { useLogin } from '../hooks/useLogin';
import { useSession } from '../context/AuthContext';
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

const AVATARS = ['AM', 'DP', 'IS', 'MC', 'RT'];

/** Static product preview built from the real tokens; purely decorative. */
function ProductPreview() {
    const card = 'rounded-[var(--r-lg)] border border-[var(--c-border)] bg-[var(--c-surface)] shadow-[var(--e-lg)]';
    const eyebrow = 'text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--c-muted)]';
    return (
        <div aria-hidden="true" className="relative mt-10 h-[300px] w-[540px] max-w-full select-none">
            <div className="ui-rise absolute left-0 top-0 w-[390px]" style={{ animationDelay: '0.1s' }}>
                <div className={`auth-float ${card} p-4`}>
                    <div className="flex items-center justify-between">
                        <span className={`${eyebrow} flex items-center gap-2`}>
                            <span className="ui-ping h-2 w-2 rounded-full bg-[var(--c-success)]" />
                            Următorul meci
                        </span>
                        <span className="rounded-full bg-[var(--c-surface-tint)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--c-brand-fg)]">Acasă</span>
                    </div>
                    <div className="mt-3.5 flex items-center gap-3.5">
                        <div className="flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center rounded-xl bg-[var(--c-surface-tint)]">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--c-brand-fg)]">Sâm</span>
                            <span className="text-[22px] font-extrabold leading-none tracking-tight text-[var(--c-ink-strong)]">14</span>
                        </div>
                        <div className="min-w-0">
                            <p className="m-0 text-[15px] font-extrabold tracking-tight text-[var(--c-ink-strong)]">U16 Masculin <span className="font-semibold text-[var(--c-muted)]">vs</span> CSM Rivals</p>
                            <p className="m-0 mt-1 flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--c-muted)]">
                                <MapPin size={13} /> Sala Polivalentă · 18:30
                            </p>
                        </div>
                    </div>
                    <div className="mt-4">
                        <div className="mb-1.5 flex items-center justify-between text-[12px] font-semibold text-[var(--c-muted)]">
                            <span>Confirmări</span>
                            <span className="text-[var(--c-ink-strong)]">11 / 14</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--c-surface-3)]">
                            <div className="ui-bar h-full w-[78%] rounded-full bg-[var(--c-brand-surface)]" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="ui-rise absolute right-0 top-[156px] w-[236px]" style={{ animationDelay: '0.25s' }}>
                <div className={`auth-float ${card} p-4`} style={{ animationDelay: '-2.5s' }}>
                    <div className="flex items-center justify-between">
                        <span className={eyebrow}>Prezență</span>
                        <span className="rounded-full bg-[var(--c-success-bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--c-success-fg)]">+2</span>
                    </div>
                    <p className="m-0 mt-2 text-[30px] font-extrabold leading-none tracking-tight text-[var(--c-ink-strong)] [font-variant-numeric:tabular-nums]">
                        12<span className="text-[18px] font-bold text-[var(--c-muted)]"> / 14</span>
                    </p>
                    <div className="mt-3.5 flex items-center">
                        {AVATARS.map((initials, index) => (
                            <span
                                key={initials}
                                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--c-surface)] bg-[var(--c-surface-3)] text-[10px] font-bold text-[var(--c-ink-soft)] ${index ? '-ml-2' : ''}`}
                            >
                                {initials}
                            </span>
                        ))}
                        <span className="ml-2 text-[12px] font-semibold text-[var(--c-muted)]">+7</span>
                    </div>
                </div>
            </div>

            <div className="ui-rise absolute bottom-0 left-6 w-[270px]" style={{ animationDelay: '0.4s' }}>
                <div className={`auth-float ${card} flex items-center gap-3 p-3.5`} style={{ animationDelay: '-4.5s' }}>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--c-success-bg)] text-[var(--c-success-fg)]">
                        <Check size={20} strokeWidth={2.5} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="m-0 text-[14px] font-extrabold tracking-tight text-[var(--c-ink-strong)]">Cotizație achitată</p>
                        <p className="m-0 mt-0.5 text-[12px] font-medium text-[var(--c-muted)]">Martie · 150 RON</p>
                    </div>
                    <Receipt size={18} className="shrink-0 text-[var(--c-muted)]" />
                </div>
            </div>
        </div>
    );
}

function BrandSide() {
    return (
        <section className="relative hidden min-h-[640px] flex-col justify-between py-10 pr-6 lg:flex">
            <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--c-brand-surface)] text-white shadow-[var(--e-sm)]">
                    <BrandGlyph size={26} />
                </div>
                <div>
                    <p className="m-0 text-lg font-extrabold leading-tight tracking-tight text-[var(--c-ink-strong)]">BCMS</p>
                    <p className="m-0 text-[13px] font-medium text-[var(--c-muted)]">Basketball Club Management</p>
                </div>
            </div>

            <div className="relative z-10 my-10">
                <h1 className="m-0 max-w-[520px] text-[46px] font-extrabold leading-[1.06] tracking-tight text-[var(--c-ink-strong)]">
                    Mai puțin admin.
                    <br />
                    <span className="text-[var(--c-brand-fg)]">Mai mult joc.</span>
                </h1>
                <p className="m-0 mt-4 max-w-[460px] text-[16.5px] font-medium leading-7 text-[var(--c-muted)]">
                    Program, prezență și plăți pentru tot clubul — într-un singur loc, pe înțelesul fiecărui rol.
                </p>
                <div className="hidden [@media(min-height:760px)]:block">
                    <ProductPreview />
                </div>
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
        secondFactor,
        secondFactorCode,
        setSecondFactorCode,
        verifySecondFactor,
        resendSecondFactor,
        cancelSecondFactor,
    } = useLogin();
    const { session, initializing } = useSession();
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        if (!initializing && session) {
            navigate(getHomeRouteForRole(session.role), { replace: true });
        }
    }, [initializing, navigate, session]);

    const fieldBorder = errorMsg ? 'border-red-300' : 'border-[var(--c-border)]';
    const plainInput = 'min-h-[46px] min-w-0 flex-1 rounded-[var(--r-md)] border border-[var(--c-border)] bg-[var(--c-surface)] px-3.5 text-base font-medium text-[var(--c-ink-strong)] outline-none placeholder:text-[var(--c-muted)]/70 focus:border-[var(--c-brand-border)] focus:ring-[3px] focus:ring-[var(--c-brand-border)]/20';

    return (
        <main className="relative isolate min-h-screen overflow-hidden text-[var(--c-ink)]">
            <PageBackdrop />
            <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-[1200px] grid-cols-1 items-center gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(400px,448px)] lg:gap-16 lg:px-10">
                <BrandSide />

                <section className="w-full">
                    <div className="mx-auto w-full max-w-[448px]">
                        <MobileBrand />

                        <AuthCard>
                            <AuthHeading title="Intră în cont" subtitle="Conectare securizată pentru contul tău BCMS." />

                            {secondFactor ? (
                                <form
                                    className="flex w-full flex-col gap-4"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        void verifySecondFactor();
                                    }}
                                >
                                    <div className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[var(--c-surface-tint)] px-4 py-3 text-sm font-semibold leading-5 text-[var(--c-ink-soft)]">
                                        {secondFactor.strategy === 'totp'
                                            ? 'Introdu codul din aplicația de autentificare.'
                                            : secondFactor.strategy === 'backup_code'
                                                ? 'Introdu unul dintre codurile de rezervă.'
                                                : `${secondFactor.newDevice ? 'Te conectezi de pe un dispozitiv nou. ' : ''}Ți-am trimis un cod${secondFactor.sentTo ? ` la ${secondFactor.sentTo}` : ''}. Introdu-l mai jos.`}
                                    </div>
                                    <label className="block">
                                        <span className={authLabelClass}>Cod de verificare</span>
                                        <span className={`${authFieldClass} ${fieldBorder}`}>
                                            <input
                                                className={`${authInputClass} tracking-[0.3em]`}
                                                placeholder="123456"
                                                inputMode={secondFactor.strategy === 'backup_code' ? 'text' : 'numeric'}
                                                autoComplete="one-time-code"
                                                value={secondFactorCode}
                                                onChange={(e) => setSecondFactorCode(e.target.value)}
                                                disabled={loading}
                                                autoFocus
                                            />
                                        </span>
                                    </label>

                                    {errorMsg ? (
                                        <div role="alert" className="flex items-start gap-3 rounded-[var(--r-md)] border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                                            <AlertCircle className="mt-0.5 shrink-0" size={18} />
                                            <p className="m-0 text-sm font-semibold leading-5">{errorMsg}</p>
                                        </div>
                                    ) : null}
                                    {forgotPasswordMsg ? (
                                        <div className="flex items-start gap-3 rounded-[var(--r-md)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
                                            <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
                                            <p className="m-0 text-sm font-semibold leading-5">{forgotPasswordMsg}</p>
                                        </div>
                                    ) : null}

                                    <button type="submit" disabled={loading} className={authPrimaryButtonClass}>
                                        {loading ? <Loader2 className="animate-spin" size={18} /> : null}
                                        <span>{loading ? 'Se verifică...' : 'Verifică și intră'}</span>
                                    </button>
                                    <div className="flex items-center justify-between gap-3">
                                        {secondFactor.strategy === 'email_code' || secondFactor.strategy === 'phone_code' ? (
                                            <button type="button" onClick={() => void resendSecondFactor()} disabled={loading} className="min-h-[36px] border-0 bg-transparent px-0 text-sm font-bold text-[var(--c-brand-fg)] hover:underline disabled:opacity-60">
                                                Trimite din nou
                                            </button>
                                        ) : <span />}
                                        <button type="button" onClick={cancelSecondFactor} disabled={loading} className="min-h-[36px] border-0 bg-transparent px-0 text-sm font-bold text-[var(--c-muted)] hover:text-[var(--c-ink)] disabled:opacity-60">
                                            Renunță
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <form
                                    className="flex w-full flex-col gap-4"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        void login();
                                    }}
                                >
                                    <div>
                                        <label htmlFor="login-email" className={authLabelClass}>Email</label>
                                        <span className={`${authFieldClass} ${fieldBorder}`}>
                                            <Mail size={18} className="shrink-0 text-[var(--c-muted)]" />
                                            <input
                                                id="login-email"
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
                                    </div>

                                    <div>
                                        <div className="mb-1.5 flex items-center justify-between">
                                            <label htmlFor="login-password" className="text-[13px] font-bold text-[var(--c-ink-soft)]">Parolă</label>
                                            <button
                                                type="button"
                                                onClick={forgotPassword}
                                                disabled={forgotPasswordLoading || loading}
                                                className="border-0 bg-transparent p-0 text-[13px] font-bold text-[var(--c-brand-fg)] hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {forgotPasswordLoading ? 'Trimit resetarea...' : 'Ai uitat parola?'}
                                            </button>
                                        </div>
                                        <span className={`${authFieldClass} ${fieldBorder}`}>
                                            <Lock size={18} className="shrink-0 text-[var(--c-muted)]" />
                                            <input
                                                id="login-password"
                                                className={`ml-3 ${authInputClass}`}
                                                placeholder="Parola ta"
                                                type={showPassword ? 'text' : 'password'}
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                autoComplete="current-password"
                                                disabled={loading}
                                            />
                                            <button
                                                type="button"
                                                aria-label={showPassword ? 'Ascunde parola' : 'Arată parola'}
                                                onClick={() => setShowPassword((value) => !value)}
                                                className="-mr-1.5 ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-[var(--c-muted)] transition-colors hover:bg-[var(--c-surface-3)] hover:text-[var(--c-ink)]"
                                            >
                                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </span>
                                    </div>

                                    {errorMsg ? (
                                        <div role="alert" className="flex items-start gap-3 rounded-[var(--r-md)] border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                                            <AlertCircle className="mt-0.5 shrink-0" size={18} />
                                            <p className="m-0 text-sm font-semibold leading-5">{errorMsg}</p>
                                        </div>
                                    ) : null}

                                    {forgotPasswordMsg ? (
                                        <div className="flex items-start gap-3 rounded-[var(--r-md)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
                                            <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
                                            <p className="m-0 text-sm font-semibold leading-5">{forgotPasswordMsg}</p>
                                        </div>
                                    ) : null}

                                    {resetStage === 'code-sent' ? (
                                        <div className="flex flex-col gap-3 rounded-[var(--r-md)] border border-[var(--c-border)] bg-[var(--c-surface-2)] p-4">
                                            <p className="m-0 text-sm font-semibold text-[var(--c-ink-soft)]">
                                                Introdu codul primit pe email și o parolă nouă.
                                            </p>
                                            <input
                                                className={plainInput}
                                                placeholder="Cod de resetare"
                                                value={resetCode}
                                                onChange={(e) => setResetCode(e.target.value)}
                                                disabled={forgotPasswordLoading}
                                            />
                                            <input
                                                className={plainInput}
                                                placeholder="Parolă nouă"
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
                                                    className="min-h-[44px] flex-1 rounded-[var(--r-md)] border-0 bg-[var(--c-brand-surface)] px-4 text-sm font-bold text-white transition-colors hover:bg-[var(--c-brand-strong)] disabled:cursor-not-allowed disabled:opacity-70"
                                                >
                                                    {forgotPasswordLoading ? 'Se salvează...' : 'Salvează parola nouă'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={cancelPasswordReset}
                                                    disabled={forgotPasswordLoading}
                                                    className="min-h-[44px] rounded-[var(--r-md)] border border-[var(--c-border)] bg-[var(--c-surface)] px-4 text-sm font-bold text-[var(--c-muted)] hover:bg-[var(--c-surface-3)]"
                                                >
                                                    Renunță
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}

                                    <button type="submit" disabled={loading} className={`group mt-1 ${authPrimaryButtonClass}`}>
                                        {loading ? <Loader2 className="animate-spin" size={18} /> : null}
                                        <span>{loading ? 'Se conectează...' : 'Autentificare'}</span>
                                        {!loading ? <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" /> : null}
                                    </button>
                                </form>
                            )}

                            <p className="m-0 mt-6 border-t border-[var(--c-border-soft)] pt-5 text-center text-sm font-medium text-[var(--c-muted)]">
                                Ai primit o invitație?{' '}
                                <Link to="/signup" className="font-bold text-[var(--c-brand-fg)] no-underline hover:underline">Creează cont</Link>
                            </p>
                        </AuthCard>
                    </div>
                </section>
            </div>
        </main>
    );
}
