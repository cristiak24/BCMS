/**
 * FRB (baskethotel widget service) configuration — the ONE place the key is read.
 *
 * The key is the public widget key frbaschet.ro embeds in its own pages (the
 * upstream only checks the Referer), so it is not a secret in the credential
 * sense. It still belongs in configuration: set FRB_API_KEY in every
 * environment. The literal fallback exists only so a deploy that predates the
 * variable keeps working; production logs a warning until it is set, after
 * which the fallback can be deleted.
 */
const LEGACY_FALLBACK_KEY = '9c3622c013ca2f69e8c373ecbf5af38e180f6d7d';

let warned = false;

export function getFrbApiKey() {
    const configured = process.env.FRB_API_KEY?.trim();
    if (configured) return configured;

    if (process.env.NODE_ENV === 'production' && !warned) {
        warned = true;
        console.warn('[config] FRB_API_KEY is not set — using the legacy built-in widget key. Set FRB_API_KEY in the environment.');
    }
    return LEGACY_FALLBACK_KEY;
}

export const FRB_REFERER = 'https://www.frbaschet.ro/';
export const FRB_HEADERS = { Referer: FRB_REFERER };
