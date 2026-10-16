/**
 * Who may do what in Finanțe. The accountant records and collects money and
 * reads the books, but the fees families are billed (cotizație, other monthly
 * fees, due day, arrears window) are the club admin's decision — user
 * decision, 2026-10-16 (audit WP2: an accountant had changed 150 → 160 RON).
 */
const FINANCE_ROLES = new Set(['admin', 'superadmin', 'accountant']);
const FEE_SETTINGS_ROLES = new Set(['admin', 'superadmin']);

export function canUseFinance(role: string) {
    return FINANCE_ROLES.has(role);
}

export function canEditFeeSettings(role: string) {
    return FEE_SETTINGS_ROLES.has(role);
}
