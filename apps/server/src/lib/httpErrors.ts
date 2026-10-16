import type { Response } from 'express';

/**
 * What a client may be told about a failed request.
 *
 * Routes used to answer `error.message` for anything thrown, so a failing
 * query sent back its full SQL text with the parameters ("Failed query: insert
 * into "player_payments" … params: …"). The message of an error thrown on
 * purpose (validation, "not found") is still shown; database and programming
 * errors become the generic text, and the details stay in the server log.
 */

export const GENERIC_ERROR = 'A apărut o eroare neașteptată. Încearcă din nou.';

const PROGRAMMING_ERRORS = new Set(['TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'EvalError', 'URIError']);

export function isInternalError(error: unknown): boolean {
    if (!(error instanceof Error)) return true;
    if (PROGRAMMING_ERRORS.has(error.name)) return true;
    // Drizzle wraps every failing query ("Failed query: …"); the driver error
    // (pg / PGlite) carries a SQLSTATE `code` and a `severity`.
    if (error.name === 'DrizzleQueryError' || /^Failed query/i.test(error.message)) return true;
    const fields = error as Error & { code?: unknown; severity?: unknown; cause?: unknown };
    if (typeof fields.severity === 'string') return true;
    // SQLSTATE ("23505"), Node system errors ("ECONNREFUSED"), Stripe codes…
    if (typeof fields.code === 'string') return true;
    if (fields.cause instanceof Error) return isInternalError(fields.cause);
    return false;
}

/** The message for a 4xx answer: the thrown text when it was meant for people, else `fallback`. */
export function clientErrorMessage(error: unknown, fallback: string) {
    return !isInternalError(error) && error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Answers a caught error: 5xx always with the generic text, 4xx with
 * `clientErrorMessage`. Logs the full error either way.
 */
export function sendRouteError(res: Response, error: unknown, options: { status?: number; fallback?: string; log?: string } = {}) {
    const status = options.status ?? 400;
    console.error(options.log ?? 'Route error:', error);
    if (status >= 500 || isInternalError(error)) {
        res.status(status >= 500 ? status : 500).json({ error: GENERIC_ERROR });
        return;
    }
    res.status(status).json({ error: clientErrorMessage(error, options.fallback ?? GENERIC_ERROR) });
}
