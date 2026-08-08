import { Component, type ErrorInfo, type ReactNode } from 'react';
import { signOut as firebaseSignOut } from 'firebase/auth';
import { firebaseAuth } from '../../config/firebase';
import { clearAuthSession, setCachedAuthSession } from '../../utils/authSession';

type ErrorBoundaryProps = {
  children: ReactNode;
  /** Rendered instead of the default card. Receives a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

/**
 * Catches render-time exceptions anywhere below it.
 *
 * Without this, a single bad field on an API response (a `null` where the UI
 * expects an object) unmounts the whole React tree and leaves the user staring
 * at a blank white page with no way forward. Now they get an explanation and
 * a few ways out: retry the subtree, go back to the dashboard, or log out.
 *
 * This boundary wraps the app ABOVE FirebaseAuthProvider (see App.tsx), so it
 * can't use useFirebaseAuth()/signOut() — and it must not need to. If the
 * crash happens on a logged-in user's home route, "go to dashboard" just
 * re-triggers the same crash (Landing redirects straight back there), trapping
 * the user with no escape. Log out is handled here directly against Firebase
 * + local session storage so it always works, independent of whatever broke.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the component stack — it is the only way to find which screen threw
    // once the tree has already been torn down.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  logout = async () => {
    try {
      await firebaseSignOut(firebaseAuth);
    } catch (error) {
      console.error('[ErrorBoundary] Sign-out failed:', error);
    } finally {
      setCachedAuthSession(null);
      await clearAuthSession();
      window.location.href = '/login';
    }
  };

  render() {
    const { error } = this.state;

    if (!error) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    return (
      <div
        role="alert"
        className="min-h-screen flex items-center justify-center px-6"
        style={{ backgroundColor: 'var(--c-bg)' }}
      >
        <div
          className="w-full max-w-[460px] rounded-3xl border p-8 text-center"
          style={{
            backgroundColor: 'var(--c-surface)',
            borderColor: 'var(--c-border)',
            boxShadow: '0 24px 60px rgba(15, 23, 42, 0.10)',
          }}
        >
          <div
            className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'var(--c-danger-bg)' }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 8.5v4.2M12 16.4h.01M10.3 3.9 2.6 17.2a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
                stroke="var(--c-danger)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <h1 className="text-xl font-black" style={{ color: 'var(--c-ink)' }}>
            Ceva nu a funcționat
          </h1>
          <p className="mt-2 text-sm font-semibold leading-6" style={{ color: 'var(--c-muted)' }}>
            A apărut o eroare neașteptată pe această pagină. Datele tale sunt în siguranță — poți
            reîncerca sau te poți întoarce la pagina principală.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={this.reset}
              className="min-h-[44px] rounded-2xl px-5 text-sm font-black transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--c-brand-surface)', color: 'var(--c-on-brand)' }}
            >
              Reîncearcă
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = '/';
              }}
              className="min-h-[44px] rounded-2xl border px-5 text-sm font-black"
              style={{
                borderColor: 'var(--c-border-strong)',
                color: 'var(--c-ink-soft)',
                backgroundColor: 'var(--c-surface)',
              }}
            >
              Pagina principală
            </button>
            <button
              type="button"
              onClick={this.logout}
              className="min-h-[44px] rounded-2xl border px-5 text-sm font-black"
              style={{
                borderColor: 'var(--c-danger-bg)',
                color: 'var(--c-danger-fg)',
                backgroundColor: 'var(--c-surface)',
              }}
            >
              Deconectare
            </button>
          </div>

          {import.meta.env.DEV ? (
            <pre
              className="mt-6 max-h-40 overflow-auto rounded-xl p-3 text-left text-[11px] leading-4"
              style={{ backgroundColor: 'var(--c-surface-3)', color: 'var(--c-muted)' }}
            >
              {error.message}
            </pre>
          ) : null}
        </div>
      </div>
    );
  }
}
