/**
 * Crash reports from the browser (POST /api/client-errors), without a paid
 * service: logged once per distinct error as `[client-error]` in the Render
 * logs, nothing stored. Pure helpers, see clientErrorReport.test.ts.
 *
 * Nothing personal or secret may reach the log: query strings and hashes are
 * cut from every URL (invite and reset links carry tokens there), and emails,
 * bearer tokens, JWTs, Stripe/Clerk-style keys, long random ids and phone
 * numbers are masked in messages and stack lines.
 */
export type ClientErrorKind = 'boundary' | 'error' | 'rejection';

export type ClientErrorReport = {
    kind: ClientErrorKind;
    message: string;
    /** Script URL (origin + path) and position, when the browser gave one. */
    source: string;
    line: number | null;
    col: number | null;
    /** First stack frames (or React component stack for 'boundary'). */
    stack: string[];
    /** App path the user was on, without query or hash. */
    path: string;
    /** Client build id, if the bundle knows it. */
    build: string;
};

const KINDS = new Set<ClientErrorKind>(['boundary', 'error', 'rejection']);
const MAX_MESSAGE = 300;
const MAX_FRAME = 200;
const MAX_FRAMES = 8;

/** Cuts the query string and hash off every URL in a text. */
function stripUrlQueries(text: string) {
    return text.replace(/((?:https?|blob|webpack):\/\/[^\s?#'"()]*)[?#][^\s'"()]*/gi, '$1');
}

/** Masks what could identify a person or open an account. */
export function scrubText(value: unknown, max = MAX_MESSAGE) {
    // Clipped before the regexes run (they must never see a huge body), and again after.
    // Control characters, newlines included, become spaces: one report can't
    // forge a second log line (stack frames are split before this runs).
    let text = Array.from(String(value ?? '').slice(0, max * 4), (char) => {
        const code = char.charCodeAt(0);
        return code < 32 || code === 127 ? ' ' : char;
    }).join('');
    text = stripUrlQueries(text);
    text = text
        .replace(/Bearer\s+[\w.~+/=-]+/gi, 'Bearer [token]')
        .replace(/eyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]*/g, '[token]')
        .replace(/\b(?:sk|pk|rk|whsec|sess|fam|inv|user|org)_[A-Za-z0-9_]{8,}/g, '[secret]')
        .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
        .replace(/(?<![\w/.-])\+?\d[\d .-]{7,}\d(?![\w-])/g, '[number]')
        .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[id]');
    return text.trim().slice(0, max);
}

/** origin + path of a URL (or a short opaque label like "inline"). */
function urlWithoutQuery(value: unknown) {
    const text = String(value ?? '').slice(0, 500);
    try {
        const url = new URL(text);
        return scrubText(`${url.origin}${url.pathname}`, MAX_FRAME);
    } catch {
        return scrubText(text.split(/[?#]/)[0], MAX_FRAME);
    }
}

function position(value: unknown) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 && n < 10_000_000 ? n : null;
}

/** A report as the browser sent it → what may be logged; null if it isn't one. */
export function parseClientError(body: unknown): ClientErrorReport | null {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const raw = body as Record<string, unknown>;
    const kind = String(raw.kind ?? '') as ClientErrorKind;
    if (!KINDS.has(kind)) return null;
    const message = scrubText(raw.message);
    if (!message) return null;
    const frames = (Array.isArray(raw.stack) ? raw.stack : String(raw.stack ?? '').split('\n'))
        .map((frame) => scrubText(frame, MAX_FRAME))
        .filter(Boolean)
        .slice(0, MAX_FRAMES);
    const path = String(raw.path ?? '').split(/[?#]/)[0];
    const build = String(raw.build ?? '');
    return {
        kind,
        message,
        source: raw.source ? urlWithoutQuery(raw.source) : '',
        line: position(raw.line),
        col: position(raw.col),
        stack: frames,
        path: path.startsWith('/') ? scrubText(path, MAX_FRAME) : '',
        build: /^[\w.-]{1,40}$/.test(build) ? build : '',
    };
}

/** Browser family and platform only — never the whole user agent. */
export function coarseUserAgent(value: unknown) {
    const ua = String(value ?? '');
    const browser = /Edg\//.test(ua) ? 'Edge'
        : /SamsungBrowser\//.test(ua) ? 'Samsung'
            : /(?:Chrome|CriOS)\//.test(ua) ? 'Chrome'
                : /(?:Firefox|FxiOS)\//.test(ua) ? 'Firefox'
                    : /Safari\//.test(ua) ? 'Safari' : 'other';
    const platform = /iPhone|iPad|iPod/.test(ua) ? 'iOS'
        : /Android/.test(ua) ? 'Android'
            : /Mac OS X/.test(ua) ? 'macOS'
                : /Windows/.test(ua) ? 'Windows'
                    : /Linux/.test(ua) ? 'Linux' : 'other';
    return `${browser}/${platform}`;
}

/** One log line (plus indented frames) for a report. */
export function formatClientError(report: ClientErrorReport, extra: { role: string | null; ua: string }) {
    const at = report.source ? ` at ${report.source}${report.line != null ? `:${report.line}:${report.col ?? 0}` : ''}` : '';
    const head = `[client-error] ${report.kind} ${report.path || '-'} "${report.message}"${at} build=${report.build || '-'} role=${extra.role ?? 'anon'} ua=${extra.ua}`;
    return [head, ...report.stack.map((frame) => `    ${frame}`)].join('\n');
}

/** Logs each distinct error once per window, so a crash loop can't flood the log. */
export function createClientErrorDeduper(windowMs = 60 * 60 * 1000, maxKeys = 500) {
    const seen = new Map<string, number>();
    return (report: ClientErrorReport, now = Date.now()) => {
        const key = `${report.kind}|${report.message}|${report.source}:${report.line}:${report.col}`;
        const last = seen.get(key);
        if (last != null && now - last < windowMs) return false;
        if (seen.size >= maxKeys) seen.clear();
        seen.set(key, now);
        return true;
    };
}
