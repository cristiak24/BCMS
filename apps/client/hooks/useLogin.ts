import { useState } from 'react';
import { authApi } from '../services/authApi';
import { useFirebaseAuth } from '../context/AuthContext';

/**
 * Login hook — signs in via Firebase Auth, then waits for AuthContext
 * to load the Postgres profile via /api/auth/me before navigating.
 */
export function useLogin() {
    const { reloadSession } = useFirebaseAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [forgotPasswordMsg, setForgotPasswordMsg] = useState<string | null>(null);

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

            // AuthContext onAuthStateChanged fires → loads /api/auth/me
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
            if (!result.success) {
                setErrorMsg(result.message ?? 'Nu am putut trimite emailul de resetare.');
                return;
            }

            setForgotPasswordMsg(result.message ?? 'Emailul de resetare a fost trimis.');
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : 'Nu am putut trimite emailul de resetare.');
        } finally {
            setForgotPasswordLoading(false);
        }
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
        login,
        forgotPassword,
    };
}
