/**
 * Single source for the legal pages. LEGAL_VERSION must equal LEGAL_VERSION in
 * apps/server/src/lib/legal.ts (a server test checks it): bumping it makes every
 * account accept the Terms and Privacy Policy again.
 */
export const LEGAL_VERSION = '2026-10-13';
export const LEGAL_UPDATED_LABEL = '13 octombrie 2026';

/** Romanian digital-consent age (Legea 190/2018, art. 8): below it a parent or guardian acts. */
export const DIGITAL_CONSENT_AGE = 16;

/**
 * Who runs the platform. Fill in the fields you have: whatever is empty is left
 * out of the legal pages. A privacy policy needs at least an email people can
 * write to, so set `contactEmail` before publishing.
 */
export const LEGAL_OPERATOR = {
    product: 'BCMS',
    legalName: '',
    registration: '',
    address: '',
    contactEmail: '',
};
