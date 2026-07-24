import type { AuthUser } from '../../utils/authSession';

type PendingApprovalProps = {
  session: AuthUser;
  onSignOut: () => Promise<void> | void;
};

const ROLE_LABELS: Record<string, string> = {
  player: 'sportiv',
  parent: 'părinte',
  coach: 'antrenor',
  accountant: 'contabil',
  staff: 'staff',
  admin: 'administrator',
};

/**
 * Shown to accounts whose club membership has not been approved yet.
 *
 * These users authenticate fine but have no club data, so previously they were
 * dropped into the normal app shell where every panel was empty and every
 * request 403'd — indistinguishable from the app being broken.
 */
export default function PendingApproval({ session, onSignOut }: PendingApprovalProps) {
  const roleLabel = ROLE_LABELS[String(session.role ?? '').toLowerCase()] ?? session.role;

  return (
    <main
      className="min-h-screen flex items-center justify-center px-6 py-12"
      style={{ backgroundColor: 'var(--c-bg)' }}
    >
      <div
        className="w-full max-w-[520px] rounded-3xl border p-8 text-center"
        style={{
          backgroundColor: 'var(--c-surface)',
          borderColor: 'var(--c-border)',
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.10)',
        }}
      >
        <div
          className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl"
          style={{ backgroundColor: 'var(--c-warning-bg)' }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="var(--c-warning-fg)" strokeWidth="2" />
            <path
              d="M12 7.4v5l3.1 1.9"
              stroke="var(--c-warning-fg)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-black" style={{ color: 'var(--c-ink)' }}>
          Cont în așteptare
        </h1>

        <p className="mt-3 text-sm font-semibold leading-6" style={{ color: 'var(--c-muted)' }}>
          Cererea ta de acces ca <strong style={{ color: 'var(--c-ink-soft)' }}>{roleLabel}</strong>
          {session.clubName ? (
            <>
              {' '}la <strong style={{ color: 'var(--c-ink-soft)' }}>{session.clubName}</strong>
            </>
          ) : null}{' '}
          a fost înregistrată și așteaptă aprobarea administratorului clubului.
        </p>

        <div
          className="mt-6 rounded-2xl px-4 py-3 text-left"
          style={{ backgroundColor: 'var(--c-surface-2)' }}
        >
          <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--c-faint)' }}>
            Cont conectat
          </p>
          <p className="mt-1 text-sm font-bold" style={{ color: 'var(--c-ink)' }}>
            {session.email}
          </p>
        </div>

        <p className="mt-5 text-[13px] font-semibold leading-5" style={{ color: 'var(--c-muted)' }}>
          Vei primi acces automat imediat ce cererea este aprobată. Reîncarcă pagina pentru a verifica
          din nou.
        </p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-[46px] rounded-2xl px-6 text-sm font-black transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--c-brand-surface)', color: 'var(--c-on-brand)' }}
          >
            Verifică din nou
          </button>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="min-h-[46px] rounded-2xl border px-6 text-sm font-black"
            style={{
              borderColor: 'var(--c-border-strong)',
              color: 'var(--c-ink-soft)',
              backgroundColor: 'var(--c-surface)',
            }}
          >
            Deconectare
          </button>
        </div>
      </div>
    </main>
  );
}
