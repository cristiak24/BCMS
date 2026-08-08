"use strict";
/**
 * Neutral starting configuration for a club with no settings document yet.
 *
 * Kept free of any store dependency on purpose. Seeding used to copy club 1's real
 * monthly fee, training levy and facility fee into every newly onboarded club, so a
 * brand-new tenant silently started life billing another club's prices. These values
 * are multiplied into real Stripe charges, which makes an inherited number a wrong
 * amount taken from a real parent — not merely a confusing default. A new club starts
 * at zero and an admin sets its fees deliberately.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTINGS_ROW_ID = exports.DEFAULT_PAYMENT_DUE_DAY = void 0;
exports.buildDefaultSettings = buildDefaultSettings;
exports.DEFAULT_PAYMENT_DUE_DAY = 25;
// The legacy pre-tenancy settings row. Still the write target for a caller with no
// club (superadmin only), and the id reported alongside safe defaults so the client
// keeps receiving a number here. See the TODO(schema) note in getSettingsData.
exports.DEFAULT_SETTINGS_ROW_ID = 1;
function buildDefaultSettings(clubId) {
    return {
        id: clubId !== null && clubId !== void 0 ? clubId : exports.DEFAULT_SETTINGS_ROW_ID,
        clubId: clubId !== null && clubId !== void 0 ? clubId : null,
        monthlyPlayerFee: 0,
        trainingLevy: 0,
        facilityFee: 0,
        autoAdjust: 1,
        paymentDueDay: exports.DEFAULT_PAYMENT_DUE_DAY,
        updatedAt: new Date(),
    };
}
