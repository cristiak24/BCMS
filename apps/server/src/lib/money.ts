/**
 * Money is stored as numeric(12,2): lei with bani. Amounts used to be integer
 * columns and every write did Math.round, so 49,50 RON became 50.
 */
export function roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * The largest amount a numeric(12,2) column holds. A bigger input used to
 * reach the INSERT and come back as a 500 carrying the SQL text, so every
 * money input is checked against this before it gets near the database.
 */
export const MAX_MONEY_AMOUNT = 9_999_999_999.99;

export function fitsMoneyColumn(value: number) {
    return Number.isFinite(value) && Math.abs(value) <= MAX_MONEY_AMOUNT;
}
