import { useState } from 'react';
import { authApi } from '../services/authApi';
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

    const login = async () => {
        setErrorMsg(null);
        setForgotPasswordMsg(null);

        if (!email.trim() || !password) {
            setErrorMsg('Introdu emailul si parola.');
            return;
        }

        setLoading(true);

        try {
            const result = await authApi.login(email.trim().toLowerCase(), password);

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
            setLoading(false);
        }
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
    };
}
