import { Link, useLocation } from 'react-router-dom';
import { useSession } from '../context/AuthContext';
import { getHomeRouteForRole } from '../utils/authSession';

/**
 * Real 404 screen.
 *
 * The wildcard route used to `<Navigate to="/" replace />`, which silently threw
 * the user back to the landing page — a mistyped or stale link looked identical
 * to logging out, with no indication anything had gone wrong.
 */
export default function NotFound() {
  const location = useLocation();
  const { session } = useSession();
  const homeRoute = session ? getHomeRouteForRole(session.role) : '/';

  return (
    <main
      className="min-h-screen flex items-center justify-center px-6 py-12"
      style={{ backgroundColor: 'var(--c-bg)' }}
    >
      <div className="w-full max-w-[520px] text-center">
        <p
          className="text-[86px] font-black leading-none tracking-tight sm:text-[110px]"
          style={{ color: 'var(--c-brand-fg)', opacity: 0.22 }}
          aria-hidden="true"
        >
          404
        </p>

        <h1 className="mt-2 text-2xl font-black sm:text-3xl" style={{ color: 'var(--c-ink)' }}>
          Pagina nu a fost găsită
        </h1>

        <p className="mt-3 text-sm font-semibold leading-6" style={{ color: 'var(--c-muted)' }}>
          Adresa <span style={{ color: 'var(--c-ink-soft)' }}>{location.pathname}</span> nu există sau
          nu mai este disponibilă. Verifică linkul sau întoarce-te la o secțiune cunoscută.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            to={homeRoute}
            className="inline-flex min-h-[46px] items-center justify-center rounded-2xl px-6 text-sm font-black transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--c-brand-surface)', color: 'var(--c-on-brand)' }}
          >
            {session ? 'Înapoi la aplicație' : 'Înapoi la început'}
          </Link>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex min-h-[46px] items-center justify-center rounded-2xl border px-6 text-sm font-black"
            style={{
              borderColor: 'var(--c-border-strong)',
              color: 'var(--c-ink-soft)',
              backgroundColor: 'var(--c-surface)',
            }}
          >
            Pagina anterioară
          </button>
        </div>
      </div>
    </main>
  );
}
