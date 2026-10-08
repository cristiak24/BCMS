/**
 * Which database a server process is about to use (audit BUG-015: local
 * development wrote into the production database). Pure, see test.
 *
 * Set DB_ENVIRONMENT=development in apps/server/.env.local once DATABASE_URL
 * points at a Neon development branch. Until then a local server warns loudly
 * on start, and refuses to start when REQUIRE_DEV_DATABASE=1.
 */
type Env = Record<string, string | undefined>;

export type DatabaseTargetCheck =
    | { level: 'ok' }
    | { level: 'warn' | 'block'; message: string };

export function checkDatabaseTarget(env: Env): DatabaseTargetCheck {
    if (env.NODE_ENV === 'production') return { level: 'ok' };
    // Tests only ever run on the embedded database: a test must never reach
    // a real one, whatever .env.local says.
    if (env.NODE_ENV === 'test' && !(env.DATABASE_URL ?? '').startsWith('pglite:')) {
        return { level: 'block', message: 'Testele rulează doar pe PGlite (DATABASE_URL=pglite:memory).' };
    }
    if ((env.DB_ENVIRONMENT ?? '').trim().toLowerCase() === 'development') return { level: 'ok' };
    // PGlite is local by construction (db/index.ts).
    if ((env.DATABASE_URL ?? '').startsWith('pglite:')) return { level: 'ok' };
    let host = 'baza configurată';
    try {
        host = env.DATABASE_URL ? new URL(env.DATABASE_URL).hostname : host;
    } catch {
        // Unparseable URL: keep the generic wording.
    }
    const message = `Serverul local folosește ${host}, care nu e marcată ca bază de dezvoltare. `
        + 'Dacă e baza de producție, orice test scrie în datele reale. Creează un branch Neon pentru dezvoltare, '
        + 'pune-i URL-ul în DATABASE_URL din .env.local și setează DB_ENVIRONMENT=development.';
    return { level: env.REQUIRE_DEV_DATABASE === '1' ? 'block' : 'warn', message };
}
