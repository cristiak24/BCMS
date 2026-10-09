import { useRef, useState } from 'react';
import { authApi, type SecondFactorChallenge } from '../services/authApi';
import { useSession } from '../context/AuthContext';

/**
 * Login hook — signs in via Clerk, then waits for AuthContext to load the
 * Postgres profile via /api/auth/me before navigating. Also drives the
 * forgot-password flow, which with Clerk is two steps: send a code, then
 * submit that code with a new password.
 */
export function useLogin() {
    const { reloadSession } = useSession();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [forgotPasswordMsg, setForgotPasswordMsg] = useState<string | null>(null);
    const [resetStage, setResetStage] = useState<'idle' | 'code-sent'>('idle');
    const [resetCode, setResetCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    // Clerk asked for a code (new device or 2FA) after the password step.
    const [secondFactor, setSecondFactor] = useState<SecondFactorChallenge | null>(null);
    const [secondFactorCode, setSecondFactorCode] = useState('');
    // Enter + click, or a double tap, fired two sign-ins before `loading`
    // re-rendered; the second failed with "already signed in".
    const inFlight = useRef(false);

    const login = async () => {
        if (inFlight.current) return;
        setErrorMsg(null);
        setForgotPasswordMsg(null);

        if (!email.trim() || !password) {
            setErrorMsg('Introdu emailul si parola.');
            return;
        }

        inFlight.current = true;
        setLoading(true);

        try {
            const result = await authApi.login(email.trim().toLowerCase(), password);

            if (result.secondFactor) {
                setSecondFactor(result.secondFactor);
                setSecondFactorCode('');
                return;
            }

            if (!result.success) {
                setErrorMsg(result.error ?? 'Email sau parola incorecte.');
                return;
            }

            // Force a profile refresh so we can surface backend/profile issues here
            // instead of waiting for the AuthContext effect to fail silently.
            await reloadSession();

            // AuthContext picks up the newly active Clerk session → loads /api/auth/me
            // The login.tsx useEffect watches `session` and redirects when it arrives
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : 'Nu ne-am putut conecta la server.');
        } finally {
            inFlight.current = false;
            setLoading(false);
        }
    };

    const verifySecondFactor = async () => {
        if (inFlight.current) return;
        setErrorMsg(null);
        if (!secondFactorCode.trim()) {
            setErrorMsg('Introdu codul primit.');
            return;
        }
        inFlight.current = true;
        setLoading(true);
        try {
            const result = await authApi.verifySecondFactor(secondFactorCode);
            if (!result.success) {
                setErrorMsg(result.error ?? 'Codul nu a fost acceptat.');
                return;
            }
            setSecondFactor(null);
            setSecondFactorCode('');
            await reloadSession();
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : 'Nu am putut verifica codul.');
        } finally {
            inFlight.current = false;
            setLoading(false);
        }
    };

    const resendSecondFactor = async () => {
        setErrorMsg(null);
        const result = await authApi.resendSecondFactor();
        if (result.error) setErrorMsg(result.error);
        else setForgotPasswordMsg('Am trimis un cod nou.');
    };

    const cancelSecondFactor = () => {
        authApi.cancelSecondFactor();
        setSecondFactor(null);
        setSecondFactorCode('');
        setErrorMsg(null);
        setForgotPasswordMsg(null);
    };

    const forgotPassword = async () => {
        setErrorMsg(null);
        setForgotPasswordMsg(null);

        const normalizedEmail = email.trim().toLowerCase();

        if (!normalizedEmail) {
            setErrorMsg('Introdu emailul inainte de resetarea parolei.');
            return;
        }

        setForgotPasswordLoading(true);

        try {
            const result = await authApi.forgotPassword(normalizedEmail);
            setForgotPasswordMsg(result.message ?? 'Emailul de resetare a fost trimis.');
            setResetStage('code-sent');
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : 'Nu am putut trimite emailul de resetare.');
        } finally {
            setForgotPasswordLoading(false);
        }
    };

    const submitPasswordReset = async () => {
        setErrorMsg(null);

        if (!resetCode.trim() || !newPassword) {
            setErrorMsg('Introdu codul primit pe email si o parola noua.');
            return;
        }

        setForgotPasswordLoading(true);

        try {
            const result = await authApi.resetPassword(resetCode.trim(), newPassword);

            if (!result.success) {
                setErrorMsg(result.error ?? 'Nu am putut reseta parola.');
                return;
            }

            setForgotPasswordMsg('Parola a fost schimbata. Te conectam...');
            setResetStage('idle');
            setResetCode('');
            setNewPassword('');
            await reloadSession();
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : 'Nu am putut reseta parola.');
        } finally {
            setForgotPasswordLoading(false);
        }
    };

    const cancelPasswordReset = () => {
        setResetStage('idle');
        setResetCode('');
        setNewPassword('');
        setForgotPasswordMsg(null);
        setErrorMsg(null);
    };

    return {
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
    };
}
